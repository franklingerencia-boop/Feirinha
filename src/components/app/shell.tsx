"use client";

import {
  BarChart3,
  Building2,
  CalendarDays,
  Calculator,
  ChevronDown,
  Handshake,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  Search,
  Shield,
  ShoppingBasket,
  Store,
  Tent,
  Truck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { COMPANY_KIND, ROLE } from "@/lib/labels";
import { useCompany } from "./company-context";
import { Logo } from "./logo";
import { cx } from "@/components/ui/ui";

type NavItem = { href: string; label: string; icon: ReactNode; show?: boolean };

function useNav(): NavItem[] {
  const { company, canManage, canFinance, isOwnerOrAdmin } = useCompany();
  if (!company) return [];
  const i = "h-5 w-5";
  if (company.kind === "vendor") {
    return [
      { href: "/app/painel", label: "Painel", icon: <LayoutDashboard className={i} />, show: canFinance },
      { href: "/app/vendas", label: "Vender", icon: <ShoppingBasket className={i} /> },
      { href: "/app/vendas/historico", label: "Histórico de vendas", icon: <Receipt className={i} /> },
      { href: "/app/agenda", label: "Agenda de feiras", icon: <CalendarDays className={i} /> },
      { href: "/app/feiras-disponiveis", label: "Feiras disponíveis", icon: <Search className={i} />, show: canManage },
      { href: "/app/vinculos", label: "Vínculos e convites", icon: <Handshake className={i} />, show: canManage },
      { href: "/app/produtos", label: "Produtos e custos", icon: <Package className={i} />, show: canManage },
      { href: "/app/precificacao", label: "Precificação", icon: <Calculator className={i} />, show: canManage },
      { href: "/app/fornecedores", label: "Fornecedores", icon: <Truck className={i} />, show: canManage },
      { href: "/app/financeiro", label: "Financeiro", icon: <Wallet className={i} />, show: canFinance },
      { href: "/app/equipe", label: "Equipe", icon: <Users className={i} />, show: isOwnerOrAdmin },
      { href: "/app/empresa", label: "Dados da empresa", icon: <Building2 className={i} />, show: isOwnerOrAdmin },
    ].filter((n) => n.show !== false);
  }
  return [
    { href: "/app/painel", label: "Painel", icon: <LayoutDashboard className={i} />, show: canFinance },
    { href: "/app/eventos", label: "Eventos", icon: <Tent className={i} /> },
    { href: "/app/feirantes", label: "Feirantes", icon: <Store className={i} />, show: canManage },
    { href: "/app/solicitacoes", label: "Solicitações", icon: <Inbox className={i} />, show: canManage },
    { href: "/app/vinculos", label: "Vínculos", icon: <Handshake className={i} />, show: canManage },
    { href: "/app/financeiro", label: "Financeiro", icon: <Wallet className={i} />, show: canFinance },
    { href: "/app/equipe", label: "Equipe", icon: <Users className={i} />, show: isOwnerOrAdmin },
    { href: "/app/empresa", label: "Dados da empresa", icon: <Building2 className={i} />, show: isOwnerOrAdmin },
  ].filter((n) => n.show !== false);
}

export function CompanySwitcher() {
  const { companies, company, setActive } = useCompany();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (!company) return null;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-left hover:bg-brand-50"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 font-bold text-brand-700">
          {company.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{company.name}</span>
          <span className="block truncate text-xs text-muted">
            {COMPANY_KIND[company.kind]} · {ROLE[company.role]}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 text-muted" />
      </button>
      {open && (
        <div role="listbox" className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-xl border border-line bg-white shadow-lg">
          {companies.map((c) => (
            <button
              key={c.id}
              role="option"
              aria-selected={c.id === company.id}
              type="button"
              onClick={() => {
                setActive(c.id);
                setOpen(false);
                router.push(c.kind === "vendor" ? (c.can_finance ? "/app/painel" : "/app/vendas") : c.can_finance ? "/app/painel" : "/app/eventos");
              }}
              className={cx("flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-brand-50", c.id === company.id && "bg-brand-50")}
            >
              <span className="font-semibold">
                {c.name} {c.is_demo && <span className="text-xs text-amber-700">(DEMO)</span>}
              </span>
              <span className="text-xs text-muted">
                {COMPANY_KIND[c.kind]} · {ROLE[c.role]}
                {c.status === "suspended" && " · suspensa"}
              </span>
            </button>
          ))}
          <Link href="/app/empresa/nova" onClick={() => setOpen(false)} className="block border-t border-line px-3 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50">
            + Criar ou entrar em outra empresa
          </Link>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const nav = useNav();
  const pathname = usePathname();
  const { isPlatformAdmin, company, user } = useCompany();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [pathname]);

  const signOut = async () => {
    await getSupabase().auth.signOut();
    window.location.href = "/login";
  };

  const isActive = (href: string) =>
    pathname === href || (href !== "/app/vendas" && pathname.startsWith(href + "/")) || (href === "/app/vendas" && pathname === "/app/vendas");

  const sidebar = (
    <nav aria-label="Menu principal" className="flex h-full flex-col gap-3 p-3">
      <div className="px-2 pt-1">
        <Logo />
      </div>
      <CompanySwitcher />
      <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {nav.map((n) => (
          <li key={n.href}>
            <Link
              href={n.href}
              aria-current={isActive(n.href) ? "page" : undefined}
              className={cx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                isActive(n.href) ? "bg-brand-500 text-white shadow-sm" : "text-ink hover:bg-brand-50",
              )}
            >
              {n.icon}
              {n.label}
            </Link>
          </li>
        ))}
        {isPlatformAdmin && (
          <li className="mt-2 border-t border-line pt-2">
            <Link href="/admin" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-violet-800 hover:bg-violet-50">
              <Shield className="h-5 w-5" />
              Administração da plataforma
            </Link>
          </li>
        )}
      </ul>
      <div className="border-t border-line pt-2">
        <Link href="/app/conta" className="block truncate rounded-lg px-3 py-1 text-xs text-muted hover:bg-brand-50" title="Minha conta">
          {user?.email}
        </Link>
        <button onClick={signOut} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:bg-brand-50">
          <LogOut className="h-5 w-5" />
          Sair
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh overflow-x-clip lg:pl-72">
      <div className="awning no-print h-2 w-full" aria-hidden />
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-line bg-cream lg:block">{sidebar}</aside>

      <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-line bg-cream/95 px-4 py-2 backdrop-blur lg:hidden">
        <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 hover:bg-brand-50" aria-label="Abrir menu">
          <Menu className="h-6 w-6" />
        </button>
        <Logo compact />
        <span className="max-w-[40%] truncate text-xs font-semibold text-muted">{company?.name}</span>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[85%] max-w-xs bg-cream shadow-xl">
            <button onClick={() => setMobileOpen(false)} className="absolute right-2 top-2 rounded-lg p-2 hover:bg-brand-50" aria-label="Fechar menu">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      {company?.is_demo && (
        <div className="bg-amber-400 px-4 py-1.5 text-center text-sm font-bold text-amber-950">
          AMBIENTE DE DEMONSTRAÇÃO — os dados desta empresa são fictícios
        </div>
      )}
      <main className="mx-auto w-full min-w-0 max-w-7xl px-4 py-5 sm:px-6">{children}</main>
    </div>
  );
}

export function ChartIcon() {
  return <BarChart3 className="h-5 w-5" />;
}
