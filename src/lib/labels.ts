// Rótulos em português para valores do banco.

export const EDITION_STATUS: Record<string, string> = {
  planned: "Planejada",
  confirmed: "Confirmada",
  completed: "Concluída",
  canceled: "Cancelada",
};

export const EVENT_STATUS: Record<string, string> = {
  draft: "Rascunho",
  open: "Inscrições abertas",
  confirmed: "Confirmado",
  completed: "Concluído",
  canceled: "Cancelado",
};

export const PARTICIPANT_STATUS: Record<string, string> = {
  registered: "Inscrito (reservado)",
  confirmed: "Confirmado",
  canceled: "Cancelado",
};

export const FEE_MODE: Record<string, string> = {
  per_day: "Por dia",
  per_event: "Valor único por evento",
};

export const TX_STATUS: Record<string, string> = {
  planned: "Previsto",
  settled: "Realizado",
  canceled: "Cancelado",
};

export const ACCOUNT_KIND: Record<string, string> = {
  bank: "Conta bancária",
  wallet: "Carteira digital",
  cash: "Caixa (dinheiro)",
  other: "Outra",
};

export const ROLE: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  operator: "Operador",
};

export const COMPANY_KIND: Record<string, string> = {
  vendor: "Feirante",
  organizer: "Organizador de feiras",
};

export const MAP_ELEMENT: Record<string, string> = {
  entrance: "Entrada",
  exit: "Saída",
  stage: "Palco",
  restroom: "Banheiros",
  support: "Ponto de apoio",
  food: "Alimentação",
  parking: "Estacionamento",
  other: "Outro",
};

export const VENDOR_FIELDS: Record<string, string> = {
  trade_name: "Nome comercial (sempre)",
  responsible_name: "Nome do responsável",
  phone: "Telefone",
  whatsapp: "WhatsApp",
  email: "E-mail",
  segment: "Segmento",
  products: "Produtos vendidos",
  needs: "Necessidades de estrutura",
};

export const REQUEST_STATUS: Record<string, string> = {
  pending: "Aguardando resposta",
  approved: "Aprovada",
  rejected: "Recusada",
  canceled: "Cancelada",
};

export const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  planned: "info",
  confirmed: "success",
  completed: "neutral",
  canceled: "danger",
  draft: "neutral",
  open: "info",
  registered: "warning",
  settled: "success",
  pending: "warning",
  approved: "success",
  rejected: "danger",
  active: "success",
  revoked: "neutral",
  suspended: "danger",
};
