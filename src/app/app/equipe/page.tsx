"use client";

import { Copy, Plus, Send } from "lucide-react";
import { useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { Badge, Button, Card, Checkbox, Field, InfoBox, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { ROLE } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase/client";
import { must, useData } from "@/lib/use-data";
import { whatsappShareUrl } from "@/lib/whatsapp";

type Member = { user_id: string; full_name: string | null; email: string | null; role: string; can_finance: boolean; can_settings: boolean; active: boolean; created_at: string };
type Inv = { id: string; email: string; role: string; token: string; accepted_at: string | null; revoked_at: string | null; expires_at: string; can_finance: boolean; can_settings: boolean };

export default function TeamPage() {
  const { company, isOwnerOrAdmin, user } = useActiveCompany();
  const toast = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const { data, loading, error, reload } = useData(async () => {
    const s = getSupabase();
    const members = must(await s.rpc("company_team", { p_company: company.id })) as Member[];
    const invites = must(await s.from("invitations").select("*").eq("company_id", company.id).order("created_at", { ascending: false })) as Inv[];
    return { members, invites };
  }, [company.id]);

  if (!isOwnerOrAdmin) return <InfoBox tone="warning">Somente proprietários e administradores gerenciam a equipe.</InfoBox>;

  const update = async (m: Member, patch: Partial<Member>) => {
    const { error } = await getSupabase().from("memberships").update(patch).eq("company_id", company.id).eq("user_id", m.user_id);
    if (error) toast.error(friendlyError(error));
    else toast.success("Permissões atualizadas.");
    reload();
  };
  const link = (t: string) => `${window.location.origin}/convite/${t}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Equipe e permissões"
        description="Convide colaboradores. Operadores registram vendas; só acessam finanças e configurações quando autorizados."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>
            Convidar
          </Button>
        }
      />
      {loading && <Spinner />}
      {error && <InfoBox tone="danger">{error}</InfoBox>}
      {data && (
        <Card title="Membros">
          <Table>
            <thead>
              <tr>
                <Th>Pessoa</Th>
                <Th>Papel</Th>
                <Th>Acesso financeiro</Th>
                <Th>Configurações e cadastros</Th>
                <Th>Ativo</Th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => {
                const self = m.user_id === user?.id;
                const isOwner = m.role === "owner";
                return (
                  <tr key={m.user_id}>
                    <Td>
                      <span className="font-semibold">{m.full_name || "—"}</span>
                      <span className="block text-xs text-muted">{m.email}</span>
                    </Td>
                    <Td>
                      {isOwner || self ? (
                        <Badge tone="brand">{ROLE[m.role]}</Badge>
                      ) : (
                        <Select className="h-9" value={m.role} onChange={(e) => update(m, { role: e.target.value })} aria-label="Papel">
                          <option value="admin">Administrador</option>
                          <option value="operator">Operador</option>
                        </Select>
                      )}
                    </Td>
                    <Td>
                      {m.role === "operator" ? (
                        <Checkbox label="Permitir" checked={m.can_finance} onChange={(v) => update(m, { can_finance: v })} />
                      ) : (
                        <span className="text-sm text-muted">Sim</span>
                      )}
                    </Td>
                    <Td>
                      {m.role === "operator" ? (
                        <Checkbox label="Permitir" checked={m.can_settings} onChange={(v) => update(m, { can_settings: v })} />
                      ) : (
                        <span className="text-sm text-muted">Sim</span>
                      )}
                    </Td>
                    <Td>{!isOwner && !self ? <Checkbox label={m.active ? "Sim" : "Não"} checked={m.active} onChange={(v) => update(m, { active: v })} /> : "Sim"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
      {data && data.invites.length > 0 && (
        <Card title="Convites">
          <ul className="divide-y divide-line">
            {data.invites.map((i) => {
              const valid = !i.accepted_at && !i.revoked_at && new Date(i.expires_at) > new Date();
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    <b>{i.email}</b> · {ROLE[i.role]}{" "}
                    {i.accepted_at ? <Badge tone="success">Aceito</Badge> : i.revoked_at ? <Badge>Cancelado</Badge> : valid ? <Badge tone="warning">Válido até {formatDate(i.expires_at)}</Badge> : <Badge>Expirado</Badge>}
                  </span>
                  {valid && (
                    <span className="flex gap-1">
                      <Button size="sm" variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => navigator.clipboard.writeText(link(i.token)).then(() => toast.success("Link copiado."))}>
                        Copiar link
                      </Button>
                      <a
                        className="inline-flex h-9 items-center gap-1 rounded-xl bg-leaf-500 px-3 text-sm font-semibold text-white"
                        href={whatsappShareUrl(`Olá! Você foi convidado(a) para a equipe de ${company.name} no SR - Feirinhas. Acesse: ${link(i.token)}`)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Send className="h-4 w-4" /> WhatsApp
                      </a>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await getSupabase().from("invitations").update({ revoked_at: new Date().toISOString() }).eq("id", i.id);
                          reload();
                        }}
                      >
                        Cancelar
                      </Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {inviteOpen && <InviteDialog onClose={() => setInviteOpen(false)} onSaved={reload} />}
    </div>
  );
}

function InviteDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { company, user } = useActiveCompany();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("operator");
  const [fin, setFin] = useState(false);
  const [set, setSet] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return toast.error("Informe um e-mail válido.");
    setBusy(true);
    const { error } = await getSupabase()
      .from("invitations")
      .insert({ company_id: company.id, email: email.trim().toLowerCase(), role, can_finance: role === "operator" ? fin : true, can_settings: role === "operator" ? set : true, invited_by: user!.id });
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("Convite criado. Envie o link para a pessoa.");
    onSaved();
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Convidar colaborador"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={busy}>
            Criar convite
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="E-mail da pessoa" hint="Ela precisa entrar com este mesmo e-mail para aceitar.">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Papel">
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="operator">Operador — registra vendas</option>
            <option value="admin">Administrador — acesso completo</option>
          </Select>
        </Field>
        {role === "operator" && (
          <>
            <Checkbox label="Pode acessar informações financeiras" checked={fin} onChange={setFin} />
            <Checkbox label="Pode alterar cadastros e configurações" checked={set} onChange={setSet} />
          </>
        )}
        <p className="text-xs text-muted">O convite gera um link para você enviar (WhatsApp ou e-mail). Não enviamos mensagens automaticamente.</p>
      </div>
    </Modal>
  );
}
