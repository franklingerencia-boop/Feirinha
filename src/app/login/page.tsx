"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthFrame } from "@/components/app/auth-frame";
import { Button, Field, InfoBox, Input } from "@/components/ui/ui";
import { friendlyError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/app";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(params.get("confirmado") ? "E-mail confirmado! Agora é só entrar." : null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    router.replace(next.startsWith("/") ? next : "/app");
    router.refresh();
  };

  const forgot = async () => {
    if (!email) return setError("Digite seu e-mail para receber o link de redefinição.");
    setBusy(true);
    const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/app/conta`,
    });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setInfo("Enviamos um link para redefinir sua senha. Confira seu e-mail.");
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {info && <InfoBox tone="success">{info}</InfoBox>}
      {error && <InfoBox tone="danger">{error}</InfoBox>}
      <Field label="E-mail" htmlFor="email" required>
        <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Senha" htmlFor="password" required>
        <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={busy}>
        Entrar
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <button type="button" onClick={forgot} className="font-semibold text-brand-600 hover:underline">
          Esqueci minha senha
        </button>
        <Link href={`/cadastro${next !== "/app" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-600 hover:underline">
          Criar uma conta
        </Link>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthFrame title="Entrar">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthFrame>
  );
}

