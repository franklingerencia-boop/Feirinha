"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, InfoBox, Spinner } from "@/components/ui/ui";
import { friendlyError } from "@/lib/errors";
import { COMPANY_KIND, ROLE } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase/client";
import { AuthFrame } from "@/components/app/auth-frame";

type Inv = { company_name: string; company_kind: string; role: string; email: string; valid: boolean };

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [inv, setInv] = useState<Inv | null | undefined>(undefined);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = getSupabase();
    s.rpc("get_invitation", { p_token: token }).then(({ data }) => setInv((data as Inv[] | null)?.[0] ?? null));
    s.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
  }, [token]);

  const accept = async () => {
    setBusy(true);
    setError(null);
    const { data, error } = await getSupabase().rpc("accept_invitation", { p_token: token });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    try {
      localStorage.setItem("sr-feirinhas:empresa-ativa", data as string);
    } catch {}
    router.replace("/app");
  };

  return (
    <AuthFrame title="Convite para equipe">
      {inv === undefined && <Spinner />}
      {inv === null && <InfoBox tone="danger">Convite não encontrado.</InfoBox>}
      {inv && (
        <div className="space-y-4">
          <p>
            Você foi convidado para a empresa <b>{inv.company_name}</b> ({COMPANY_KIND[inv.company_kind]}) como <b>{ROLE[inv.role]}</b>.
          </p>
          {!inv.valid && <InfoBox tone="warning">Este convite expirou, foi cancelado ou já foi usado. Peça um novo convite.</InfoBox>}
          {error && <InfoBox tone="danger">{error}</InfoBox>}
          {inv.valid && !userEmail && (
            <div className="space-y-2">
              <p className="text-sm text-muted">Para aceitar, entre ou crie uma conta com o e-mail {inv.email}.</p>
              <div className="flex gap-2">
                <Link className="flex-1 rounded-xl bg-brand-500 px-4 py-3 text-center font-semibold text-white" href={`/login?next=/convite/${token}`}>
                  Entrar
                </Link>
                <Link className="flex-1 rounded-xl border border-line px-4 py-3 text-center font-semibold" href={`/cadastro?next=/convite/${token}`}>
                  Criar conta
                </Link>
              </div>
            </div>
          )}
          {inv.valid && userEmail && (
            <Button className="w-full" size="lg" onClick={accept} loading={busy}>
              Aceitar convite
            </Button>
          )}
        </div>
      )}
    </AuthFrame>
  );
}
