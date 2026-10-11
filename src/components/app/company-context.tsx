"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase/client";

export type MyCompany = {
  id: string;
  name: string;
  kind: "vendor" | "organizer";
  status: "active" | "suspended";
  role: "owner" | "admin" | "operator";
  can_finance: boolean;
  can_settings: boolean;
  is_demo: boolean;
  timezone: string;
};

type Ctx = {
  user: User | null;
  companies: MyCompany[];
  company: MyCompany | null;
  isPlatformAdmin: boolean;
  loading: boolean;
  setActive: (id: string) => void;
  reload: () => Promise<void>;
  /** Pode gerenciar cadastros (proprietário/admin ou permissão de configurações/finanças) */
  canManage: boolean;
  canFinance: boolean;
  canSettings: boolean;
  isOwnerOrAdmin: boolean;
};

const CompanyContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "sr-feirinhas:empresa-ativa";

export function CompanyProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<MyCompany[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    setUser(u.user);
    if (!u.user) {
      setLoading(false);
      return;
    }
    const [{ data: list }, { data: adm }] = await Promise.all([
      supabase.rpc("my_companies"),
      supabase.from("platform_admins").select("user_id").eq("user_id", u.user.id).maybeSingle(),
    ]);
    const cs = (list ?? []) as MyCompany[];
    setCompanies(cs);
    setIsPlatformAdmin(!!adm);
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {}
    setActiveId((prev) => {
      const candidate = prev ?? stored;
      if (candidate && cs.some((c) => c.id === candidate)) return candidate;
      return cs.find((c) => c.status === "active")?.id ?? cs[0]?.id ?? null;
    });
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    reload();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") window.location.href = "/login";
    });
    return () => data.subscription.unsubscribe();
  }, [reload, supabase]);

  const setActive = useCallback((id: string) => {
    setActiveId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {}
  }, []);

  const value = useMemo<Ctx>(() => {
    const company = companies.find((c) => c.id === activeId) ?? null;
    const isOwnerOrAdmin = !!company && (company.role === "owner" || company.role === "admin");
    const canFinance = !!company && company.can_finance;
    const canSettings = !!company && company.can_settings;
    return {
      user,
      companies,
      company,
      isPlatformAdmin,
      loading,
      setActive,
      reload,
      canFinance,
      canSettings,
      canManage: canFinance || canSettings,
      isOwnerOrAdmin,
    };
  }, [user, companies, activeId, isPlatformAdmin, loading, setActive, reload]);

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany(): Ctx {
  const c = useContext(CompanyContext);
  if (!c) throw new Error("useCompany fora do CompanyProvider");
  return c;
}

/** Empresa ativa garantida (use dentro das telas do app). */
export function useActiveCompany() {
  const ctx = useCompany();
  if (!ctx.company) throw new Error("Nenhuma empresa ativa");
  return { ...ctx, company: ctx.company };
}
