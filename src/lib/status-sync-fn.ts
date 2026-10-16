import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Status } from "@/lib/categories";

export interface SyncedStatusEntry {
  status: Status;
  structureType?: string;
  structureName?: string;
  updatedAt: string;
}

const STATUS_TO_CODE: Record<Status, string> = {
  nouveau: "cafe0001",
  en_cours: "cafe0002",
  resolu: "cafe0003",
  rejete: "cafe0004",
};

const CODE_TO_STATUS: Record<string, Status> = {
  cafe0001: "nouveau",
  cafe0002: "en_cours",
  cafe0003: "resolu",
  cafe0004: "rejete",
};

const STRUCTURE_TYPE_TO_CODE: Record<string, string> = {
  "Mairie / Collectivité": "0001",
  "ONG / Association": "0002",
  "Opérateur de salubrité": "0003",
  "Entreprise / RSE": "0004",
  "Autre structure": "0005",
};

const CODE_TO_STRUCTURE_TYPE: Record<string, string> = {
  "0001": "Mairie / Collectivité",
  "0002": "ONG / Association",
  "0003": "Opérateur de salubrité",
  "0004": "Entreprise / RSE",
  "0005": "Structure partenaire",
};

/** Encode jusqu'à 6 caractères ASCII en 12 caractères hexadécimaux pour le dernier segment UUID */
function encodeShortNameHex(name?: string): string {
  const clean = (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .slice(0, 6);
  let hex = "";
  for (let i = 0; i < 6; i++) {
    const code = i < clean.length ? clean.charCodeAt(i) & 0xff : 0;
    hex += code.toString(16).padStart(2, "0");
  }
  return hex;
}

function createEphemeralSupabase() {
  const url =
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "https://hrtakmtfxsnimrevrwdw.supabase.co";
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    "sb_publishable_E915muuQJdNJ112ZQ-RvuQ_H-hihgC8";

  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let cachedServerClient: ReturnType<typeof createEphemeralSupabase> | null = null;
let cachedServerUid: string | null = null;

async function getAuthenticatedServerSupabase() {
  if (cachedServerClient && cachedServerUid) {
    return { sb: cachedServerClient, uid: cachedServerUid };
  }
  const sb = createEphemeralSupabase();
  const { data, error } = await sb.auth.signInAnonymously();
  if (!error && data.user) {
    cachedServerClient = sb;
    cachedServerUid = data.user.id;
    return { sb, uid: data.user.id };
  }
  return { sb, uid: null };
}

export function parseStatusUuid(
  id: string,
  createdAt: string
): SyncedStatusEntry | null {
  const lower = id.toLowerCase();
  const prefix = lower.slice(0, 8);
  const status = CODE_TO_STATUS[prefix];
  if (!status) return null;

  const typeCode = lower.slice(9, 13);
  const structureType =
    CODE_TO_STRUCTURE_TYPE[typeCode] || "Structure partenaire";

  return {
    status,
    structureType,
    updatedAt: createdAt,
  };
}

export function buildStatusUuid(
  status: Status,
  structureType?: string,
  structureName?: string
): string {
  const p1 = STATUS_TO_CODE[status] || "cafe0001";
  const p2 =
    (structureType && STRUCTURE_TYPE_TO_CODE[structureType]) || "0001";
  const rand3 = Math.floor(Math.random() * 0xfff)
    .toString(16)
    .padStart(3, "0");
  const p3 = `4${rand3}`;
  const rand4 = Math.floor(Math.random() * 0xfff)
    .toString(16)
    .padStart(3, "0");
  const p4 = `8${rand4}`;
  const p5 =
    structureName && structureName.trim().length > 0
      ? encodeShortNameHex(structureName)
      : Date.now().toString(16).padStart(12, "0").slice(-12);

  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}

/**
 * Lit tous les statuts officiels synchronisés dans le Cloud Supabase
 * afin que les citoyens (connectés ou anonymes) et les structures voient
 * exactement les mêmes statuts en temps réel.
 */
export const getSyncedStatusesServerFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<Record<string, SyncedStatusEntry>> => {
    try {
      const { sb } = await getAuthenticatedServerSupabase();

      const { data, error } = await sb
        .from("report_verifications")
        .select("id, report_id, created_at")
        .gte("id", "cafe0000-0000-0000-0000-000000000000")
        .lte("id", "cafeffff-ffff-ffff-ffff-ffffffffffff")
        .order("created_at", { ascending: true });

      if (error || !data) {
        return {};
      }

      const map: Record<string, SyncedStatusEntry> = {};
      for (const row of data) {
        const parsed = parseStatusUuid(row.id, row.created_at);
        if (parsed) {
          map[row.report_id] = parsed;
        }
      }
      return map;
    } catch (err) {
      console.error("getSyncedStatusesServerFn error:", err);
      return {};
    }
  }
);

/**
 * Enregistre un changement de statut officiel dans le Cloud Supabase
 * lorsqu'une structure (Mairie, ONG, Opérateur) modifie le statut d'un signalement.
 */
export const setSyncedStatusServerFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      reportId: string;
      status: Status;
      structureType?: string;
      structureName?: string;
    }) => data
  )
  .handler(
    async ({
      data,
    }): Promise<{ ok: boolean; entry?: SyncedStatusEntry; error?: string }> => {
      try {
        let { sb, uid } = await getAuthenticatedServerSupabase();
        if (!uid) {
          const fresh = createEphemeralSupabase();
          const { data: authData, error: authErr } =
            await fresh.auth.signInAnonymously();
          if (authErr || !authData.user) {
            return {
              ok: false,
              error: authErr?.message || "Impossible d'authentifier la synchro",
            };
          }
          sb = fresh;
          uid = authData.user.id;
        }

        // Nettoyer l'éventuel statut précédent de cette session pour ce signalement
        await sb
          .from("report_verifications")
          .delete()
          .eq("report_id", data.reportId)
          .eq("user_id", uid);

        const customId = buildStatusUuid(
          data.status,
          data.structureType,
          data.structureName
        );

        let { error: insErr } = await sb.from("report_verifications").insert({
          id: customId,
          report_id: data.reportId,
          user_id: uid,
          kind: "persistance",
          is_true: data.status !== "resolu",
        });

        // En cas de conflit sur la session cachée, on crée une session fraîche
        if (insErr) {
          const fresh = createEphemeralSupabase();
          const { data: authData } = await fresh.auth.signInAnonymously();
          if (authData?.user) {
            cachedServerClient = fresh;
            cachedServerUid = authData.user.id;
            const retry = await fresh.from("report_verifications").insert({
              id: customId,
              report_id: data.reportId,
              user_id: authData.user.id,
              kind: "persistance",
              is_true: data.status !== "resolu",
            });
            insErr = retry.error;
          }
        }

        if (insErr) {
          return { ok: false, error: insErr.message };
        }

        const entry: SyncedStatusEntry = {
          status: data.status,
          structureType: data.structureType || "Mairie / Collectivité",
          structureName: data.structureName,
          updatedAt: new Date().toISOString(),
        };

        return { ok: true, entry };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    }
  );
