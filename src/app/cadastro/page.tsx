"use client";

import { Store, Tent } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, Field, InfoBox, Input, cx } from "@/components/ui/ui";
import { friendlyError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase/client";
import { AuthFrame } from "@/components/app/auth-frame";

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const isInvite = !!next?.startsWith("/convite/");
  const [kind, setKind] = useState<"vendor" | "organizer">(params.get("tipo") === "organizer" ? "organizer" : "vendor");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
    setBusy(true);
    setError(null);
    const supabase = getSupabase();
    // A empresa é criada no primeiro acesso (após confirmar o e-mail), com o tipo escolhido.
    // O perfil de administrador da plataforma nunca é escolhido aqui.
    const meta: Record<string, string> = { full_name: fullName.trim() };
    if (!isInvite) {
      meta.pending_company_kind = kind;
      meta.pending_company_name = companyName.trim();
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: meta,
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next || "/app")}`,
      },
    });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    if (data.session) {
      router.replace(next || "/app");
      router.refresh();
    } else {
      setDone(true);
    }
  };

  if (done) {
    return (
      <InfoBox tone="success" title="Quase lá!">
        Enviamos um link de confirmação para <b>{email}</b>. Abra seu e-mail e clique no link para ativar sua conta. Depois é só entrar.
      </InfoBox>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <InfoBox tone="danger">{error}</InfoBox>}
      {!isInvite && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Qual é o tipo da sua empresa?</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { v: "vendor", label: "Feirante", desc: "Vendo em feiras", icon: <Store className="h-6 w-6" /> },
                { v: "organizer", label: "Organizador", desc: "Organizo feiras", icon: <Tent className="h-6 w-6" /> },
              ] as const
            ).map((o) => (
              <label
                key={o.v}
                className={cx(
                  "flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 p-3 text-center",
                  kind === o.v ? "border-brand-500 bg-brand-50" : "border-line",
                )}
              >
                <input type="radio" name="kind" value={o.v} checked={kind === o.v} onChange={() => setKind(o.v)} className="sr-only" />
                <span className="text-brand-600">{o.icon}</span>
                <span className="font-bold">{o.label}</span>
                <span className="text-xs text-muted">{o.desc}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {isInvite && <InfoBox>Você está criando sua conta para aceitar um convite de equipe.</InfoBox>}
      <Field label="Seu nome" htmlFor="name" required>
        <Input id="name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </Field>
      {!isInvite && (
        <Field label={kind === "vendor" ? "Nome do seu negócio" : "Nome da organização"} htmlFor="company" required>
          <Input id="company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required minLength={2} />
        </Field>
      )}
      <Field label="E-mail" htmlFor="email" required>
        <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Senha" htmlFor="password" hint="Mínimo de 8 caracteres" required>
        <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={busy}>
        Criar conta
      </Button>
      <p className="text-center text-sm">
        Já tem conta?{" "}
        <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-600 hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}

export default function SignupPage() {
  return (
    <AuthFrame title="Criar conta">
      <Suspense>
        <SignupForm />
      </Suspense>
    </AuthFrame>
  );
}
