import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { detectCommuneFromText, type AbidjanCommune } from "@/lib/abidjan";
import { verifyPartnerTokenServerFn, verifyAdminSessionServerFn } from "@/lib/structure-auth-fn";

export type AppRole = "citoyen" | "autorite" | "admin";

export type StructureProfile = {
  name: string;
  type: string;
  commune?: AbidjanCommune | null;
  email?: string;
  partnerToken?: string;
};

const LEGACY_STRUCTURE_STORAGE_KEY = "salubapp_structure_profile";
const PARTNER_TOKEN_STORAGE_KEY = "salubapp_partner_token_v2";
const ADMIN_TOKEN_STORAGE_KEY = "salubapp_admin_token_v2";

export function readStoredAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    return raw && raw.length > 10 ? raw : null;
  } catch {
    return null;
  }
}

export function writeStoredAdminToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) {
      localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

interface StoredPartnerToken {
  userId: string;
  partnerToken: string;
}

function readStoredTokenForUser(userId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    // Nettoyer l'ancienne clé non signée du prototype
    localStorage.removeItem(LEGACY_STRUCTURE_STORAGE_KEY);
    const raw = localStorage.getItem(PARTNER_TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPartnerToken>;
    if (parsed.userId === userId && typeof parsed.partnerToken === "string" && parsed.partnerToken.length > 10) {
      return parsed.partnerToken;
    }
  } catch {
    // ignore
  }
  return null;
}

function writeStoredTokenForUser(userId: string | null, partnerToken: string | null) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LEGACY_STRUCTURE_STORAGE_KEY);
    if (userId && partnerToken) {
      const payload: StoredPartnerToken = { userId, partnerToken };
      localStorage.setItem(PARTNER_TOKEN_STORAGE_KEY, JSON.stringify(payload));
    } else {
      localStorage.removeItem(PARTNER_TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

interface AuthCtx {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  loading: boolean;
  isAutorite: boolean;
  structureProfile: StructureProfile | null;
  setStructureProfile: (profile: StructureProfile | null, userIdOverride?: string) => void;
  setAdminToken: (token: string | null) => void;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [structureProfile, setStructureProfileState] = useState<StructureProfile | null>(null);
  const [isPartnerVerified, setIsPartnerVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const hydrateSeqRef = useRef(0);

  const hydrateUserAccess = async (currentSession: Session | null) => {
    const seq = ++hydrateSeqRef.current;
    const currentUser = currentSession?.user ?? null;

    if (!currentUser) {
      // Vérifier si un token admin signé existe
      const candidateAdminToken = readStoredAdminToken();
      if (candidateAdminToken) {
        const adminRes = await verifyAdminSessionServerFn({
          data: { adminToken: candidateAdminToken },
        }).catch(() => ({ ok: false, valid: false }));
        if (seq === hydrateSeqRef.current && (adminRes.ok || adminRes.valid)) {
          setRoles(["admin"]);
          return;
        }
      }
      setRoles([]);
      setIsPartnerVerified(false);
      setStructureProfileState(null);
      return;
    }

    const meta = currentUser.user_metadata;
    const candidateToken =
      (typeof meta?.partner_token === "string" && meta.partner_token.length > 10
        ? meta.partner_token
        : null) || readStoredTokenForUser(currentUser.id);
    const candidateAdminToken = readStoredAdminToken();

    const [rolesRes, tokenRes, adminRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", currentUser.id),
      candidateToken
        ? verifyPartnerTokenServerFn({ data: { token: candidateToken } }).catch(() => ({
            valid: false as const,
            profile: undefined,
          }))
        : Promise.resolve({ valid: false as const, profile: undefined }),
      candidateAdminToken || currentSession?.access_token
        ? verifyAdminSessionServerFn({
            data: {
              adminToken: candidateAdminToken || undefined,
              accessToken: currentSession?.access_token || undefined,
            },
          }).catch(() => ({ ok: false, valid: false, adminToken: undefined }))
        : Promise.resolve({ ok: false, valid: false, adminToken: undefined }),
    ]);

    if (seq !== hydrateSeqRef.current) return;

    const loadedRoles = (rolesRes.data ?? []).map((r) => r.role as AppRole);
    if ((adminRes.ok || adminRes.valid) && !loadedRoles.includes("admin")) {
      loadedRoles.push("admin");
      if (adminRes.adminToken) {
        writeStoredAdminToken(adminRes.adminToken);
      }
    }
    setRoles(loadedRoles);

    if (tokenRes.valid && tokenRes.profile && candidateToken) {
      writeStoredTokenForUser(currentUser.id, candidateToken);
      setIsPartnerVerified(true);
      setStructureProfileState({
        name: tokenRes.profile.name,
        type: tokenRes.profile.type,
        commune: tokenRes.profile.commune ?? detectCommuneFromText(tokenRes.profile.name),
        email: tokenRes.profile.email || currentUser.email,
        partnerToken: candidateToken,
      });
      return;
    }

    // Si l'utilisateur possède un rôle officiel SQL ('autorite' ou 'admin'), autoriser l'accès
    if (loadedRoles.includes("autorite") || loadedRoles.includes("admin")) {
      const fallbackName =
        typeof meta?.structure_name === "string" && meta.structure_name.trim()
          ? meta.structure_name.trim()
          : loadedRoles.includes("admin")
          ? "Administration SalubApp"
          : "Autorité Locale";
      const fallbackType =
        typeof meta?.structure_type === "string" && meta.structure_type.trim()
          ? meta.structure_type.trim()
          : "Mairie / Collectivité";
      const fallbackCommune =
        detectCommuneFromText(
          typeof meta?.structure_commune === "string" ? meta.structure_commune : fallbackName
        ) ?? null;

      setIsPartnerVerified(false);
      setStructureProfileState({
        name: fallbackName,
        type: fallbackType,
        commune: fallbackCommune,
        email: currentUser.email,
      });
      return;
    }

    // Sinon : citoyen standard ou jeton invalide -> aucun accès au portail structures
    writeStoredTokenForUser(null, null);
    setIsPartnerVerified(false);
    setStructureProfileState(null);
  };

  const setStructureProfile = (profile: StructureProfile | null, userIdOverride?: string) => {
    // Invalider toute hydratation antérieure en vol pour éviter une course
    hydrateSeqRef.current += 1;

    if (!profile) {
      writeStoredTokenForUser(null, null);
      setIsPartnerVerified(false);
      setStructureProfileState(null);
      return;
    }

    const effectiveUid = userIdOverride || session?.user?.id || null;
    if (profile.partnerToken) {
      writeStoredTokenForUser(effectiveUid, profile.partnerToken);
      setIsPartnerVerified(true);
    }
    setStructureProfileState(profile);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setTimeout(() => {
        void hydrateUserAccess(nextSession);
      }, 0);
    });

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        setSession(data.session);
        await hydrateUserAccess(data.session);
      })
      .finally(() => setLoading(false));

    return () => sub.subscription.unsubscribe();
  }, []);

  const hasOfficialAccess =
    Boolean(session?.user) &&
    (roles.includes("autorite") || roles.includes("admin") || isPartnerVerified);

  const value: AuthCtx = {
    session,
    user: session?.user ?? null,
    roles,
    loading,
    isAutorite: hasOfficialAccess,
    structureProfile: hasOfficialAccess ? structureProfile : null,
    setStructureProfile,
    setAdminToken: (token: string | null) => {
      writeStoredAdminToken(token);
      if (token) {
        setRoles((prev) => (prev.includes("admin") ? prev : [...prev, "admin"]));
      } else {
        setRoles((prev) => prev.filter((r) => r !== "admin"));
      }
    },
    signOut: async () => {
      setStructureProfile(null);
      writeStoredTokenForUser(null, null);
      writeStoredAdminToken(null);
      await supabase.auth.signOut();
      setRoles([]);
    },
    refreshRoles: async () => {
      await hydrateUserAccess(session);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
