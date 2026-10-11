"use client";

import { useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { AccountsTab } from "@/components/finance/accounts";
import { FinanceSettingsTab, RecurringTab } from "@/components/finance/settings";
import { TransactionsTab } from "@/components/finance/transactions";
import { TransfersTab } from "@/components/finance/transfers";
import { InfoBox, PageHeader, Tabs } from "@/components/ui/ui";

type Tab = "contas" | "lancamentos" | "pagar" | "receber" | "transferencias" | "recorrentes" | "config";

export default function FinancePage() {
  const { company, canFinance } = useActiveCompany();
  const [tab, setTab] = useState<Tab>("contas");
  if (!canFinance) return <InfoBox tone="warning">Você não tem permissão para acessar o financeiro desta empresa.</InfoBox>;
  return (
    <div key={company.id}>
      <PageHeader title="Financeiro" description="Contas, caixa, receitas, despesas, contas a pagar e a receber — separando o que foi previsto do que foi realizado." />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "contas", label: "Contas e fluxo" },
          { value: "lancamentos", label: "Lançamentos" },
          { value: "pagar", label: "A pagar" },
          { value: "receber", label: "A receber" },
          { value: "transferencias", label: "Transferências" },
          { value: "recorrentes", label: "Recorrentes" },
          { value: "config", label: "Categorias e pagamentos" },
        ]}
      />
      {tab === "contas" && <AccountsTab />}
      {tab === "lancamentos" && <TransactionsTab mode="all" />}
      {tab === "pagar" && <TransactionsTab key="p" mode="payables" />}
      {tab === "receber" && <TransactionsTab key="r" mode="receivables" />}
      {tab === "transferencias" && <TransfersTab />}
      {tab === "recorrentes" && <RecurringTab />}
      {tab === "config" && <FinanceSettingsTab />}
    </div>
  );
}
