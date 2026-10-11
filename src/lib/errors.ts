// Traduz erros do Supabase/Postgres para mensagens claras em português.

type MaybeError = { message?: string; code?: string; details?: string } | null | undefined;

export function friendlyError(err: MaybeError | unknown): string {
  const e = err as MaybeError;
  if (!e) return "Algo deu errado. Tente novamente.";
  const msg = e.message ?? String(err);
  const code = e.code ?? "";

  if (msg.includes("stall_assignments_stall_day_uniq"))
    return "Esta barraca já está ocupada neste dia. Escolha outra barraca ou outro dia.";
  if (msg.includes("stall_assignments_participant_day_uniq"))
    return "Este participante já tem uma barraca neste dia.";
  if (code === "23505") return "Já existe um registro com esses dados (duplicado).";
  if (code === "23503") return "Este registro está em uso por outros dados e não pode ser removido. Arquive-o.";
  if (code === "23514") return "Algum valor informado é inválido. Confira os campos.";
  if (code === "42501" || msg.includes("row-level security"))
    return msg.includes("row-level security") ? "Você não tem permissão para esta ação." : msg;
  if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("Email not confirmed")) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (msg.includes("User already registered")) return "Já existe uma conta com este e-mail.";
  if (msg.includes("Password should be")) return "A senha precisa ter pelo menos 8 caracteres.";
  if (msg.includes("Failed to fetch")) return "Sem conexão com o servidor. Verifique sua internet.";
  return msg;
}
