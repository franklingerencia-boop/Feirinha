"use client";

import { useEffect, useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { Button, Card, Field, InfoBox, Input, PageHeader, Spinner, Textarea } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { friendlyError } from "@/lib/errors";
import { COMPANY_KIND } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase/client";

const FIELDS = ["name", "document", "responsible_name", "phone", "whatsapp", "email", "city", "segment", "products_summary", "timezone"] as const;

export default function CompanyPage() {
  const { company, isOwnerOrAdmin, reload } = useActiveCompany();
  const toast = useToast();
  const [f, setF] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSupabase()
      .from("companies")
      .select(FIELDS.join(","))
      .eq("id", company.id)
      .single()
      .then(({ data }) => setF(Object.fromEntries(FIELDS.map((k) => [k, ((data as unknown as Record<string, string>)?.[k] ?? "") as string]))));
  }, [company.id]);

  if (!isOwnerOrAdmin) return <InfoBox tone="warning">Somente proprietários e administradores alteram os dados da empresa.</InfoBox>;
  if (!f) return <Spinner />;
  const set = (k: string, v: string) => setF((x) => ({ ...x!, [k]: v }));
  const save = async () => {
    if (f.name.trim().length < 2) return toast.error("Informe o nome da empresa.");
    setBusy(true);
    const payload = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null]));
    payload.timezone = payload.timezone || "America/Sao_Paulo";
    const { error } = await getSupabase().from("companies").update(payload).eq("id", company.id);
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("Dados salvos.");
    reload();
  };
  return (
    <div>
      <PageHeader title="Dados da empresa" description={`Tipo: ${COMPANY_KIND[company.kind]}. O tipo da empresa não pode ser alterado.`} />
      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome" required>
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="CPF/CNPJ (opcional)">
            <Input value={f.document} onChange={(e) => set("document", e.target.value)} />
          </Field>
          <Field label="Responsável">
            <Input value={f.responsible_name} onChange={(e) => set("responsible_name", e.target.value)} />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Telefone">
            <Input value={f.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="WhatsApp">
            <Input value={f.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
          </Field>
          <Field label="Cidade">
            <Input value={f.city} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="Fuso horário" hint="Padrão: America/Sao_Paulo">
            <Input value={f.timezone} onChange={(e) => set("timezone", e.target.value)} />
          </Field>
          <Field label="Segmento">
            <Input value={f.segment} onChange={(e) => set("segment", e.target.value)} placeholder="Ex.: Doces artesanais" />
          </Field>
          <Field label="Produtos vendidos (resumo)" className="sm:col-span-2">
            <Textarea value={f.products_summary} onChange={(e) => set("products_summary", e.target.value)} rows={2} />
          </Field>
        </div>
        {company.kind === "vendor" && (
          <p className="mt-3 text-xs text-muted">
            Estes dados só são compartilhados com organizadores quando você autoriza, no escopo de cada vínculo. Vendas, fornecedores e finanças nunca são compartilhados.
          </p>
        )}
        <Button className="mt-4" onClick={save} loading={busy}>
          Salvar
        </Button>
      </Card>
    </div>
  );
}
