"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useCompany } from "@/components/app/company-context";
import { Spinner } from "@/components/ui/ui";

export default function AppIndex() {
  const { company } = useCompany();
  const router = useRouter();
  useEffect(() => {
    if (!company) return;
    if (company.can_finance) router.replace("/app/painel");
    else router.replace(company.kind === "vendor" ? "/app/vendas" : "/app/eventos");
  }, [company, router]);
  return <Spinner />;
}
