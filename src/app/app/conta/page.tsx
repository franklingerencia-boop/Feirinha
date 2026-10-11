"use client";

import { useState } from "react";
import { useCompany } from "@/components/app/company-context";
import { Button, Card, Field, Input, PageHeader } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { friendlyError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase/client";

export default function AccountPage() {
  const { user } = useCompany();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (password.length < 8) return toast.error("A senha precisa ter pelo menos 8 caracteres.");
    setBusy(true);
    const { error } = await getSupabase().auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    setPassword("");
    toast.success("Senha alterada.");
  };
  return (
    <div className="max-w-lg">
      <PageHeader title="Minha conta" description={user?.email ?? ""} />
      <Card title="Alterar senha">
        <Field label="Nova senha" hint="Mínimo de 8 caracteres">
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button className="mt-3" onClick={save} loading={busy}>
          Salvar senha
        </Button>
      </Card>
    </div>
  );
}
