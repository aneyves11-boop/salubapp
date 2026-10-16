import { supabase } from "@/integrations/supabase/client";
import type { Status } from "@/lib/categories";
import {
  getSyncedStatusesServerFn,
  setSyncedStatusServerFn,
  type SyncedStatusEntry,
} from "@/lib/status-sync-fn";

const LOCAL_STATUS_KEY_LEGACY = "salubapp_structure_status_overrides";
const LOCAL_STATUS_KEY_V2 = "salubapp_structure_status_overrides_v2";
const BROADCAST_CHANNEL_NAME = "salubapp_status_sync_channel";

export type { SyncedStatusEntry };

export function getLocalSyncedStatuses(): Record<string, SyncedStatusEntry> {
  if (typeof window === "undefined") return {};
  const result: Record<string, SyncedStatusEntry> = {};

  // 1. Lire l'ancien format éventuel (Record<string, Status>) pour ne perdre aucun statut déjà modifié
  try {
    const rawLegacy = localStorage.getItem(LOCAL_STATUS_KEY_LEGACY);
    if (rawLegacy) {
      const parsed = JSON.parse(rawLegacy) as Record<string, Status>;
      for (const [reportId, status] of Object.entries(parsed)) {
        if (status) {
          result[reportId] = {
            status,
            structureType: "Structure partenaire",
            updatedAt: "2026-01-01T00:00:00.000Z",
          };
        }
      }
    }
  } catch {
    // ignore
  }

  // 2. Lire le format enrichi v2
  try {
    const rawV2 = localStorage.getItem(LOCAL_STATUS_KEY_V2);
    if (rawV2) {
      const parsedV2 = JSON.parse(rawV2) as Record<string, SyncedStatusEntry>;
      for (const [reportId, entry] of Object.entries(parsedV2)) {
        if (entry && entry.status) {
          result[reportId] = entry;
        }
      }
    }
  } catch {
    // ignore
  }

  return result;
}

function saveLocalSyncedStatuses(map: Record<string, SyncedStatusEntry>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STATUS_KEY_V2, JSON.stringify(map));
    // Maintenir aussi la clé legacy pour compatibilité
    const legacy: Record<string, Status> = {};
    for (const [id, entry] of Object.entries(map)) {
      legacy[id] = entry.status;
    }
    localStorage.setItem(LOCAL_STATUS_KEY_LEGACY, JSON.stringify(legacy));
  } catch {
    // ignore
  }
}

function notifyAllTabs() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("salubapp-status-sync"));
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      ch.postMessage({ type: "STATUS_UPDATED", timestamp: Date.now() });
      ch.close();
    }
  } catch {
    // ignore
  }
}

/**
 * Récupère les statuts synchronisés (Cloud Supabase + LocalStorage)
 * et pousse automatiquement vers le Cloud tout statut local qui n'y était pas encore.
 */
export async function fetchSyncedStatuses(): Promise<
  Record<string, SyncedStatusEntry>
> {
  const localMap = getLocalSyncedStatuses();
  let cloudMap: Record<string, SyncedStatusEntry> = {};

  try {
    cloudMap = (await getSyncedStatusesServerFn()) ?? {};
  } catch {
    // Fallback client-side si besoin
  }

  const merged: Record<string, SyncedStatusEntry> = { ...localMap };

  for (const [reportId, cloudEntry] of Object.entries(cloudMap)) {
    const localEntry = merged[reportId];
    if (
      !localEntry ||
      new Date(cloudEntry.updatedAt).getTime() >=
        new Date(localEntry.updatedAt).getTime()
    ) {
      merged[reportId] = {
        ...cloudEntry,
        structureName: cloudEntry.structureName || localEntry?.structureName,
      };
    }
  }

  // Si des statuts avaient été modifiés localement avant la mise en place du Cloud, on les synchronise automatiquement vers le Cloud
  for (const [reportId, localEntry] of Object.entries(localMap)) {
    const cloudEntry = cloudMap[reportId];
    if (!cloudEntry || cloudEntry.status !== localEntry.status) {
      void setSyncedStatusServerFn({
        data: {
          reportId,
          status: localEntry.status,
          structureType: localEntry.structureType,
          structureName: localEntry.structureName,
        },
      }).catch(() => {});
    }
  }

  saveLocalSyncedStatuses(merged);
  return merged;
}

/**
 * Met à jour le statut d'un signalement depuis la plateforme des Structures
 * et le synchronise immédiatement avec la partie Citoyens (Local + Multi-onglets + Cloud Supabase).
 */
export async function updateReportStatusSynced(params: {
  reportId: string;
  status: Status;
  structureName?: string;
  structureType?: string;
}): Promise<Record<string, SyncedStatusEntry>> {
  const { reportId, status, structureName, structureType } = params;
  const current = getLocalSyncedStatuses();
  const nextEntry: SyncedStatusEntry = {
    status,
    structureName: structureName || "Structure partenaire",
    structureType: structureType || "Mairie / Collectivité",
    updatedAt: new Date().toISOString(),
  };

  const nextMap = {
    ...current,
    [reportId]: nextEntry,
  };

  saveLocalSyncedStatuses(nextMap);
  notifyAllTabs();

  // 1. Tentative de mise à jour directe sur la table reports (si le compte a le rôle autorite SQL)
  try {
    await supabase.from("reports").update({ status }).eq("id", reportId);
  } catch {
    // ignore
  }

  // 2. Synchronisation Cloud universelle via Server Function (visible par tous les citoyens et appareils)
  try {
    await setSyncedStatusServerFn({
      data: {
        reportId,
        status,
        structureName,
        structureType,
      },
    });
    notifyAllTabs();
  } catch (err) {
    console.warn("Cloud status sync warning:", err);
  }

  return nextMap;
}

/**
 * Abonne un composant (page Citoyens, Carte ou Portail Structures) aux changements de statut en temps réel
 */
export function subscribeToStatusSync(onSync: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleStorage = (e: StorageEvent) => {
    if (
      e.key === LOCAL_STATUS_KEY_V2 ||
      e.key === LOCAL_STATUS_KEY_LEGACY ||
      e.key === null
    ) {
      onSync();
    }
  };

  const handleCustom = () => onSync();
  const handleFocus = () => onSync();

  window.addEventListener("storage", handleStorage);
  window.addEventListener("salubapp-status-sync", handleCustom);
  window.addEventListener("focus", handleFocus);

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.onmessage = () => onSync();
    } catch {
      // ignore
    }
  }

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("salubapp-status-sync", handleCustom);
    window.removeEventListener("focus", handleFocus);
    if (channel) {
      try {
        channel.close();
      } catch {
        // ignore
      }
    }
  };
}
