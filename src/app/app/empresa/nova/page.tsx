"use client";

import { Store, Tent } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCompany } from "@/components/app/company-context";
import { Logo } from "@/components/app/logo";
import { Button, Card, Field, InfoBox, Input, cx } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { friendlyError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase/client";

export default function NewCompanyPage() {
  const { companies, reload, setActive, user } = useCompany();
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = useState<"vendor" | "organizer">("vendor");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await getSupabase().rpc("create_company", {
      p_kind: kind,
      p_name: name.trim(),
      p_responsible_name: (user?.user_metadata?.full_name as string) ?? null,
      p_phone: phone || null,
      p_email: user?.email ?? null,
      p_city: city || null,
    });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setActive(data as string);
    await reload();
    toast.success("Empresa criada! Bem-vindo(a) ao SR - Feirinhas.");
    router.replace("/app");
  };

  return (
    <div className="mx-auto max-w-xl">
      {companies.length === 0 && (
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
      )}
      <Card>
        <h1 className="mb-1 text-2xl font-extrabold">{companies.length ? "Nova empresa" : "Vamos começar"}</h1>
        <p className="mb-4 text-sm text-muted">
          Uma pessoa pode participar de várias empresas, inclusive de tipos diferentes. Para entrar na equipe de uma empresa existente, peça um
          convite ao proprietário.
        </p>
        <form onSubmit={submit} className="space-y-4">
          {error && <InfoBox tone="danger">{error}</InfoBox>}
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Tipo da empresa</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { v: "vendor", label: "Feirante", desc: "Gestão do meu negócio e das feiras em que participo", icon: <Store className="h-6 w-6" /> },
                  { v: "organizer", label: "Organizador", desc: "Organização de eventos e participantes", icon: <Tent className="h-6 w-6" /> },
                ] as const
              ).map((o) => (
                <label
                  key={o.v}
                  className={cx("flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 p-3 text-center", kind === o.v ? "border-brand-500 bg-brand-50" : "border-line")}
                >
                  <input type="radio" name="kind" checked={kind === o.v} onChange={() => setKind(o.v)} className="sr-only" />
                  <span className="text-brand-600">{o.icon}</span>
                  <span className="font-bold">{o.label}</span>
                  <span className="text-xs text-muted">{o.desc}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Nome da empresa" htmlFor="cname" required>
            <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cidade" htmlFor="ccity">
              <Input id="ccity" value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
            <Field label="Telefone / WhatsApp" htmlFor="cphone">
              <Input id="cphone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
          </div>
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            Criar empresa
          </Button>
        </form>
      </Card>
    </div>
  );
}
