"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { CompanyProvider, useCompany } from "@/components/app/company-context";
import { AppShell } from "@/components/app/shell";
import { InfoBox, Spinner } from "@/components/ui/ui";
import { getSupabase } from "@/lib/supabase/client";

function Gate({ children }: { children: ReactNode }) {
  const { loading, user, companies, company, reload, setActive } = useCompany();
  const pathname = usePathname();
  const router = useRouter();
  const creating = useRef(false);

  // Cria a empresa escolhida no cadastro (após a confirmação do e-mail)
  useEffect(() => {
    if (loading || !user || companies.length > 0 || creating.current) return;
    const meta = user.user_metadata ?? {};
    if (meta.pending_company_kind && meta.pending_company_name) {
      creating.current = true;
      const s = getSupabase();
      s.rpc("create_company", {
        p_kind: meta.pending_company_kind,
        p_name: meta.pending_company_name,
        p_responsible_name: meta.full_name ?? null,
        p_email: user.email ?? null,
      }).then(async ({ data, error }) => {
        await s.auth.updateUser({ data: { pending_company_kind: null, pending_company_name: null } });
        if (!error && data) setActive(data as string);
        await reload();
      });
    } else if (pathname !== "/app/empresa/nova" && pathname !== "/app/conta") {
      router.replace("/app/empresa/nova");
    }
  }, [loading, user, companies, pathname, router, reload, setActive]);

  if (loading || (!company && pathname !== "/app/empresa/nova" && pathname !== "/app/conta")) {
    return <Spinner label="Preparando seu espaço..." />;
  }
  if (company && company.status === "suspended" && pathname !== "/app/empresa/nova") {
    return (
      <AppShell>
        <InfoBox tone="danger" title="Empresa suspensa">
          O acesso a esta empresa está suspenso pela administração da plataforma. Os dados foram preservados. Entre em contato com o suporte
          ou selecione outra empresa no menu.
        </InfoBox>
      </AppShell>
    );
  }
  if (!company) return <div className="mx-auto max-w-3xl px-4 py-8">{children}</div>;
  return <AppShell>{children}</AppShell>;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <CompanyProvider>
      <Gate>{children}</Gate>
    </CompanyProvider>
  );
}
