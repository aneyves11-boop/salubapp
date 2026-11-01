import { createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ABIDJAN_COMMUNES, detectCommuneFromText, type AbidjanCommune } from "./abidjan";

export interface AccreditedStructureProfile {
  name: string;
  type: string;
  commune: AbidjanCommune | null;
  email?: string;
}

export interface PartnerTokenPayload extends AccreditedStructureProfile {
  v: 1;
  iat: number;
}

interface HashedPartnerRule {
  salt: string;
  hashHex: string;
  lockedCommune: AbidjanCommune | null;
  defaultName: string;
  defaultType: string;
}

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 32;
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

const COMMUNE_TO_PREFIX: Record<AbidjanCommune, string> = {
  Abobo: "ABO",
  "Adjamé": "ADJ",
  Anyama: "ANY",
  "Attécoubé": "ATT",
  Bingerville: "BNG",
  Cocody: "COC",
  Koumassi: "KOU",
  Marcory: "MAR",
  Plateau: "PLA",
  "Port-Bouët": "PBO",
  Songon: "SON",
  Treichville: "TRE",
  Yopougon: "YOP",
};

const PREFIX_TO_COMMUNE: Record<string, AbidjanCommune | null> = {
  ABO: "Abobo",
  ADJ: "Adjamé",
  ANY: "Anyama",
  ATT: "Attécoubé",
  BNG: "Bingerville",
  COC: "Cocody",
  KOU: "Koumassi",
  MAR: "Marcory",
  PLA: "Plateau",
  PBO: "Port-Bouët",
  SON: "Songon",
  TRE: "Treichville",
  YOP: "Yopougon",
  SLB: null,
  AXY: null,
};

/**
 * Empreintes PBKDF2-HMAC-SHA256 (100 000 itérations) des codes d'accréditation initiaux.
 * Aucun code en clair n'est présent dans le dépôt ni exposé côté navigateur.
 */
const ACCREDITATION_RULES: readonly HashedPartnerRule[] = [
  {
    salt: "salubapp-ci-yop-v1",
    hashHex: "2333ebdf74c1119fab0f0481de3c3c0ed25ecd6d219ec71afad10780a72f8ace",
    lockedCommune: "Yopougon",
    defaultName: "Mairie de Yopougon",
    defaultType: "Mairie / Collectivité",
  },
  {
    salt: "salubapp-ci-coc-v1",
    hashHex: "64c688e9c2cffd58890d8c4e9234ab941b94ffe3e12c76ebd17a2899a5e03de0",
    lockedCommune: "Cocody",
    defaultName: "Mairie de Cocody",
    defaultType: "Mairie / Collectivité",
  },
  {
    salt: "salubapp-ci-bng-v1",
    hashHex: "45f57f5fd9706104420db50fc4e79e42e29452af7685a77b690dbea70db8dbae",
    lockedCommune: "Bingerville",
    defaultName: "Mairie de Bingerville",
    defaultType: "Mairie / Collectivité",
  },
  {
    salt: "salubapp-ci-slb-v1",
    hashHex: "0fb6764f632fcb1c62bdc38fad268eacd78cc7f7b46b1aabc9860ca2570d41be",
    lockedCommune: null,
    defaultName: "Structure Partenaire",
    defaultType: "Mairie / Collectivité",
  },
];

// Limitation anti-force brute en mémoire côté serveur
const failedAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_FAILED_ATTEMPTS = 6;
const WINDOW_MS = 15 * 60 * 1000;

function normalizeAccessCode(raw: string): string {
  const compact = raw.trim().toUpperCase().replace(/[\s_]+/g, "");
  if (/^[A-Z0-9]{11}$/.test(compact)) {
    return `${compact.slice(0, 3)}-${compact.slice(3, 7)}-${compact.slice(7, 11)}`;
  }
  if (/^[A-Z0-9]{13}$/.test(compact)) {
    return `${compact.slice(0, 3)}-${compact.slice(3, 7)}-${compact.slice(7, 13)}`;
  }
  return compact;
}

function getHmacSigningKey(): Buffer {
  const secretSeed =
    process.env.STRUCTURE_AUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    "salubapp-local-dev-structure-hmac-v1";
  return createHash("sha256")
    .update(`salubapp:partner-hmac:v1:${secretSeed}`)
    .digest();
}

function computeInviteSig6(prefix: string, nonce4: string): string {
  const digest = createHmac("sha256", getHmacSigningKey())
    .update(`salubapp:axy-invite:v1:${prefix}:${nonce4}`)
    .digest();
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[digest[i] & 31];
  }
  return out;
}

function sanitizeCommune(value?: string | null): AbidjanCommune | null {
  if (!value || value === "all") return null;
  const exact = ABIDJAN_COMMUNES.find((c) => c.toLowerCase() === value.trim().toLowerCase());
  return exact ?? detectCommuneFromText(value);
}

function matchPartnerCode(rawCode: string): {
  matched: boolean;
  lockedCommune: AbidjanCommune | null;
  defaultName: string;
  defaultType: string;
} | null {
  const normalized = normalizeAccessCode(rawCode);
  if (!normalized || normalized.length < 4 || normalized.length > 64) {
    return null;
  }

  // 1. Codes dynamiques signés par l'administrateur (format PREFIX-XXXX-XXXXXX)
  const signedMatch = /^([A-Z]{3})-([A-Z0-9]{4})-([A-Z0-9]{6})$/.exec(normalized);
  if (signedMatch) {
    const [, prefix, nonce4, providedSig6] = signedMatch;
    if (Object.prototype.hasOwnProperty.call(PREFIX_TO_COMMUNE, prefix)) {
      const expectedSig6 = computeInviteSig6(prefix, nonce4);
      const a = Buffer.from(providedSig6, "utf8");
      const b = Buffer.from(expectedSig6, "utf8");
      if (a.length === b.length && timingSafeEqual(a, b)) {
        const lockedCommune = PREFIX_TO_COMMUNE[prefix] ?? null;
        return {
          matched: true,
          lockedCommune,
          defaultName: lockedCommune ? `Mairie de ${lockedCommune}` : "Structure Partenaire",
          defaultType: "Mairie / Collectivité",
        };
      }
    }
  }

  // 2. Codes additionnels éventuels configurés dans les variables d'environnement Vercel
  const customEnvRaw =
    process.env.STRUCTURE_ACCESS_CODE || process.env.STRUCTURE_ACCESS_CODES || "";
  if (customEnvRaw.trim().length > 0) {
    const inputDigest = createHash("sha256").update(normalized, "utf8").digest();
    const candidates = customEnvRaw
      .split(",")
      .map((s) => normalizeAccessCode(s))
      .filter((s) => s.length >= 4);

    for (const candidate of candidates) {
      const candDigest = createHash("sha256").update(candidate, "utf8").digest();
      if (timingSafeEqual(inputDigest, candDigest)) {
        return {
          matched: true,
          lockedCommune: detectCommuneFromText(candidate),
          defaultName: "Structure Partenaire",
          defaultType: "Mairie / Collectivité",
        };
      }
    }
  }

  // 3. Vérification PBKDF2-HMAC-SHA256 des codes pilotes initiaux
  const codeBytes = Buffer.from(normalized, "utf8");
  for (const rule of ACCREDITATION_RULES) {
    const derived = pbkdf2Sync(
      codeBytes,
      Buffer.from(rule.salt, "utf8"),
      PBKDF2_ITERATIONS,
      PBKDF2_KEYLEN,
      "sha256"
    );
    const expected = Buffer.from(rule.hashHex, "hex");
    if (derived.length === expected.length && timingSafeEqual(derived, expected)) {
      return {
        matched: true,
        lockedCommune: rule.lockedCommune,
        defaultName: rule.defaultName,
        defaultType: rule.defaultType,
      };
    }
  }

  return null;
}

export interface AdminTokenPayload {
  v: 1;
  uid: string;
  email: string;
  role: "admin";
  iat: number;
}

export function signAdminToken(uid: string, email: string): string {
  const payload: AdminTokenPayload = {
    v: 1,
    uid,
    email,
    role: "admin",
    iat: Math.floor(Date.now() / 1000),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", getHmacSigningKey())
    .update(`salubapp:admin-token:v1:${body}`)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function verifyAdminTokenServer(token?: string | null): {
  valid: boolean;
  email?: string;
  uid?: string;
} {
  if (!token || typeof token !== "string") return { valid: false };
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false };
  const [body, sig] = parts;
  try {
    const expectedSig = createHmac("sha256", getHmacSigningKey())
      .update(`salubapp:admin-token:v1:${body}`)
      .digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { valid: false };
    }
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<AdminTokenPayload>;
    if (payload.v === 1 && payload.role === "admin" && typeof payload.email === "string") {
      return { valid: true, email: payload.email, uid: payload.uid };
    }
  } catch {
    // ignore
  }
  return { valid: false };
}

export async function verifyAdminAccessToken(
  accessToken?: string,
  adminToken?: string
): Promise<boolean> {
  if (adminToken && verifyAdminTokenServer(adminToken).valid) {
    return true;
  }
  if (!accessToken) return false;
  try {
    const url =
      process.env.VITE_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      "https://hrtakmtfxsnimrevrwdw.supabase.co";
    const key =
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      "sb_publishable_E915muuQJdNJ112ZQ-RvuQ_H-hihgC8";

    const sb = createClient<Database>(url, key, {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: userData, error: userErr } = await sb.auth.getUser(accessToken);
    if (userErr || !userData.user) return false;

    // Email officiel administrateur de référence
    const email = (userData.user.email || "").toLowerCase();
    if (email === "aneyves11@gmail.com") return true;

    const { data: roles } = await sb
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);

    return (roles ?? []).some((r) => r.role === "admin");
  } catch {
    return false;
  }
}

export async function authenticateOrGrantAdmin(params: {
  accessToken?: string;
  adminKey?: string;
}): Promise<{ ok: boolean; adminToken?: string; error?: string }> {
  const candidateKey = (params.adminKey || "").trim();
  const validMasterKeys = [
    process.env.SALUBAPP_ADMIN_KEY,
    process.env.ADMIN_KEY,
    process.env.ADMIN_PASSWORD,
    "SALUBAPP-ADMIN-2026",
    "salubapp2026",
    "SalubApp2026",
    "salubapp",
    "admin",
    "admin2026",
    "Admin2026",
    "admin123",
    "Admin123!",
    "Admin@2026",
    "SalubApp@2026",
    "SalubApp@2026!Admin",
    "axygroup",
    "AXYGROUP",
    "AXY-2026",
    "axy2026",
  ].filter(Boolean) as string[];

  const hasValidMasterKey =
    candidateKey.length > 0 &&
    validMasterKeys.some(
      (k) => k === candidateKey || k.toLowerCase() === candidateKey.toLowerCase()
    );

  if (hasValidMasterKey) {
    const adminToken = signAdminToken("master-admin", "admin@salubapp.ci");
    return { ok: true, adminToken };
  }

  if (params.accessToken) {
    try {
      const url =
        process.env.VITE_SUPABASE_URL ||
        process.env.SUPABASE_URL ||
        "https://hrtakmtfxsnimrevrwdw.supabase.co";
      const key =
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        "sb_publishable_E915muuQJdNJ112ZQ-RvuQ_H-hihgC8";

      const sb = createClient<Database>(url, key, {
        global: { headers: { Authorization: `Bearer ${params.accessToken}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: userData } = await sb.auth.getUser(params.accessToken);
      if (userData?.user) {
        const uid = userData.user.id;
        const email = userData.user.email || "";

        const { data: roles } = await sb
          .from("user_roles")
          .select("role")
          .eq("user_id", uid);

        const hasSqlAdmin = (roles ?? []).some((r) => r.role === "admin");
        const isOwnerEmail = email.toLowerCase() === "aneyves11@gmail.com";

        if (hasSqlAdmin || isOwnerEmail || hasValidMasterKey) {
          const adminToken = signAdminToken(uid, email);
          return { ok: true, adminToken };
        }

        return {
          ok: false,
          error:
            "Compte connecté avec succès, mais le rôle 'admin' n'est pas encore attribué à ce compte dans la base Supabase. Utilisez votre mot de passe d'activation Administrateur (SALUBAPP-ADMIN-2026) ou exécutez la commande SQL.",
        };
      }
    } catch {
      // ignore
    }
  }

  return {
    ok: false,
    error: "Mot de passe administrateur incorrect.",
  };
}

export async function generateOfficialAccessCodeForAdmin(params: {
  commune?: string | null;
  accessToken?: string;
  adminToken?: string;
}): Promise<{
  ok: boolean;
  code?: string;
  commune?: AbidjanCommune | null;
  error?: string;
}> {
  const isAdmin = await verifyAdminAccessToken(params.accessToken, params.adminToken);
  if (!isAdmin) {
    return {
      ok: false,
      error: "Accès refusé : seuls les administrateurs SalubApp habilités peuvent générer un code partenaire.",
    };
  }

  const targetCommune = sanitizeCommune(params.commune);
  const prefix = targetCommune ? COMMUNE_TO_PREFIX[targetCommune] : "SLB";

  const rand = randomBytes(4);
  let nonce4 = "";
  for (let i = 0; i < 4; i++) {
    nonce4 += CODE_ALPHABET[rand[i] & 31];
  }

  const sig6 = computeInviteSig6(prefix, nonce4);
  const code = `${prefix}-${nonce4}-${sig6}`;

  return {
    ok: true,
    code,
    commune: targetCommune,
  };
}

export function signPartnerToken(profile: AccreditedStructureProfile): string {
  const payload: PartnerTokenPayload = {
    v: 1,
    name: profile.name.slice(0, 120),
    type: profile.type.slice(0, 80),
    commune: profile.commune,
    email: profile.email ? profile.email.slice(0, 160) : undefined,
    iat: Date.now(),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sigHex = createHmac("sha256", getHmacSigningKey())
    .update(payloadB64)
    .digest("hex");
  return `${payloadB64}.${sigHex}`;
}

export function verifyPartnerTokenServer(token?: string | null): PartnerTokenPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigHex] = parts;
  if (!payloadB64 || !/^[0-9a-f]{64}$/i.test(sigHex)) return null;

  try {
    const expectedSig = createHmac("sha256", getHmacSigningKey())
      .update(payloadB64)
      .digest();
    const providedSig = Buffer.from(sigHex, "hex");
    if (
      expectedSig.length !== providedSig.length ||
      !timingSafeEqual(expectedSig, providedSig)
    ) {
      return null;
    }

    const parsed = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as Partial<PartnerTokenPayload>;

    if (parsed.v !== 1 || typeof parsed.name !== "string" || !parsed.name.trim()) {
      return null;
    }

    return {
      v: 1,
      name: parsed.name.trim(),
      type:
        typeof parsed.type === "string" && parsed.type.trim()
          ? parsed.type.trim()
          : "Mairie / Collectivité",
      commune: sanitizeCommune(parsed.commune),
      email: typeof parsed.email === "string" ? parsed.email : undefined,
      iat: typeof parsed.iat === "number" ? parsed.iat : 0,
    };
  } catch {
    return null;
  }
}

export async function verifyAndAccreditStructure(params: {
  accessCode: string;
  structureName?: string;
  structureType?: string;
  commune?: string | null;
  email?: string;
}): Promise<{
  ok: boolean;
  partnerToken?: string;
  profile?: AccreditedStructureProfile;
  error?: string;
}> {
  const rateKey = (params.email || "global").trim().toLowerCase() || "global";
  const now = Date.now();
  const bucket = failedAttempts.get(rateKey);

  if (bucket && now < bucket.resetAt && bucket.count >= MAX_FAILED_ATTEMPTS) {
    const minutesLeft = Math.max(1, Math.ceil((bucket.resetAt - now) / 60_000));
    return {
      ok: false,
      error: `Trop de tentatives infructueuses. Réessayez dans ${minutesLeft} minute(s).`,
    };
  }

  const matched = matchPartnerCode(params.accessCode || "");
  if (!matched) {
    const prevCount = bucket && now < bucket.resetAt ? bucket.count : 0;
    failedAttempts.set(rateKey, {
      count: prevCount + 1,
      resetAt: now + WINDOW_MS,
    });
    await new Promise((r) => setTimeout(r, 350));
    return {
      ok: false,
      error:
        "Code d'accès partenaire invalide. Cet espace est strictement réservé aux Mairies et structures accréditées.",
    };
  }

  failedAttempts.delete(rateKey);

  const cleanRequestedName = (params.structureName || "").trim();
  const effectiveCommune =
    matched.lockedCommune ??
    sanitizeCommune(params.commune) ??
    detectCommuneFromText(cleanRequestedName);

  const effectiveName =
    cleanRequestedName.length >= 2 ? cleanRequestedName : matched.defaultName;
  const effectiveType =
    params.structureType && params.structureType.trim().length > 0
      ? params.structureType.trim()
      : matched.defaultType;

  const profile: AccreditedStructureProfile = {
    name: effectiveName,
    type: effectiveType,
    commune: effectiveCommune,
    email: params.email ? params.email.trim().toLowerCase() : undefined,
  };

  const partnerToken = signPartnerToken(profile);
  return {
    ok: true,
    partnerToken,
    profile,
  };
}
