import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "citoyen" | "autorite" | "admin";

export type StructureProfile = {
  name: string;
  type: string;
  email?: string;
};

const STRUCTURE_STORAGE_KEY = "salubapp_structure_profile";

interface AuthCtx {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  loading: boolean;
  isAutorite: boolean;
  structureProfile: StructureProfile | null;
  setStructureProfile: (profile: StructureProfile | null) => void;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [structureProfile, setStructureProfileState] = useState<StructureProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const syncStructureProfile = (user: User | null | undefined) => {
    if (!user) {
      setStructureProfileState(null);
      return;
    }
    const meta = user.user_metadata;
    if (meta?.is_structure && meta?.structure_name) {
      const prof: StructureProfile = {
        name: String(meta.structure_name),
        type: String(meta.structure_type || "Structure"),
        email: meta.structure_email ? String(meta.structure_email) : user.email,
      };
      setStructureProfileState(prof);
      if (typeof window !== "undefined") {
        localStorage.setItem(STRUCTURE_STORAGE_KEY, JSON.stringify(prof));
      }
      return;
    }
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(STRUCTURE_STORAGE_KEY);
        if (raw) {
          setStructureProfileState(JSON.parse(raw) as StructureProfile);
          return;
        }
      } catch {
        // ignore
      }
    }
    setStructureProfileState(null);
  };

  const setStructureProfile = (profile: StructureProfile | null) => {
    setStructureProfileState(profile);
    if (typeof window !== "undefined") {
      if (profile) {
        localStorage.setItem(STRUCTURE_STORAGE_KEY, JSON.stringify(profile));
      } else {
        localStorage.removeItem(STRUCTURE_STORAGE_KEY);
      }
    }
  };

  const loadRoles = async (uid: string | undefined) => {
    if (!uid) { setRoles([]); return; }
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    setRoles((data ?? []).map((r) => r.role as AppRole));
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      syncStructureProfile(s?.user);
      setTimeout(() => loadRoles(s?.user.id), 0);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      syncStructureProfile(data.session?.user);
      loadRoles(data.session?.user.id).finally(() => setLoading(false));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthCtx = {
    session,
    user: session?.user ?? null,
    roles,
    loading,
    isAutorite:
      roles.includes("autorite") ||
      roles.includes("admin") ||
      Boolean(structureProfile),
    structureProfile,
    setStructureProfile,
    signOut: async () => {
      setStructureProfile(null);
      await supabase.auth.signOut();
    },
    refreshRoles: async () => loadRoles(session?.user.id),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}