# SR - Feirinhas

Aplicativo web para **feirantes** e **organizadores de feiras**: agenda, eventos, vendas, custos, precificação e finanças, em português do Brasil, com valores em reais e datas no formato brasileiro. Funciona em celular, tablet e computador.

## Tecnologias

- **Next.js 15** (App Router) + **TypeScript** + **Tailwind CSS 4**
- **Supabase**: autenticação, Postgres com **Row Level Security** em todas as tabelas, Storage para imagens
- **Vercel** para hospedagem, **GitHub** para versionamento

## Estrutura

```
src/
  app/                 Telas (rotas)
    app/               Área logada (feirante e organizador)
    admin/             Administração da plataforma (somente administrador)
    e/[token]/         Página pública compartilhável do evento
    login, cadastro, convite/[token], auth/callback
  components/
    ui/                Componentes de interface acessíveis (botões, campos, diálogos, toasts)
    app/               Layout, menu, seletor de empresa ativa
    vendor/ organizer/ finance/ shared/   Componentes por módulo
  lib/                 Dinheiro (centavos), datas (fuso da empresa), precificação, WhatsApp, Supabase
  middleware.ts        Renovação de sessão e proteção das rotas
supabase/
  migrations/          Migrações do banco (ordem numérica)
  tests/scenarios.sql  Testes dos cenários de negócio e de segurança (executam e desfazem tudo)
```

## Banco de dados e segurança

- Toda tabela de negócio tem `company_id`; políticas RLS liberam acesso somente a membros ativos da empresa (empresas suspensas ficam bloqueadas, com histórico preservado).
- Papéis: **proprietário**, **administrador**, **operador**. Operadores registram vendas; finanças e cadastros só com permissão (`can_finance`, `can_settings`). Operadores usam funções que não retornam custos nem saldos.
- Operações sensíveis (vendas, cancelamentos, publicação, solicitações, vínculos, links públicos, painéis, administração) são funções `SECURITY DEFINER` que validam permissão e rodam em transação.
- **Dinheiro em centavos** (`bigint`). Vendas e lançamentos usam **chave de idempotência** (cliques repetidos não duplicam).
- **Histórico preservado**: preço e custo gravados em cada item vendido; taxas de cada edição/participação guardadas no próprio registro; cancelamentos mantêm o registro com motivo; auditoria (`audit_log`) de permissões, vendas, pagamentos, cobranças, vínculos e ações administrativas.
- Imagens no bucket privado `product-images`, em pastas por empresa, com URLs temporárias.
- O perfil de **administrador da plataforma** não existe no cadastro público: é concedido por SQL (tabela `private.bootstrap_admins`) após a confirmação do e-mail.

### Integração feirante × organizador

- Os módulos funcionam de forma independente (feiras e feirantes externos, sem criar contas).
- Publicação em “Feiras disponíveis” é opcional e exige aceite do termo (versão, data, usuário e evento registrados em `consent_records`).
- Solicitações e convites dependem de aprovação/aceite. O vínculo (`links`) guarda o escopo autorizado; mudar o escopo exige novo aceite.
- Revogar encerra o compartilhamento sem cancelar a participação nem apagar pagamentos.
- Alterações de data, local, regras, barraca e taxa geram avisos ao feirante; a nova taxa não substitui o valor acordado.

## Configuração

1. Copie `.env.example` para `.env.local` e preencha a URL e a **chave publicável** do Supabase (nunca a `service_role`).
2. Aplique as migrações de `supabase/migrations` em ordem (Supabase CLI: `supabase db push`, ou cole no SQL Editor).
3. No Supabase, em **Authentication → URL Configuration**, defina o *Site URL* e adicione `https://SEU-DOMINIO/auth/callback` às *Redirect URLs*.
4. Para definir o administrador da plataforma, insira o e-mail em `private.bootstrap_admins` (já configurado nas migrações).
5. `npm install` e `npm run dev`.

## Testes

- `supabase/tests/scenarios.sql`: valida taxa diária × dias, taxa única, venda com lançamento único (inclusive repetida), transferência sem faturamento, conflito de barraca, isolamento entre empresas, permissões de operador, publicação/aceite/aprovação, escopo do vínculo, avisos de alteração, revogação e link público. Ao final, desfaz todas as alterações e exibe “TODOS OS TESTES PASSARAM”.
- `npm run build` executa verificação de tipos e lint.

## Dados de demonstração

Empresas com `is_demo = true` exibem a faixa “AMBIENTE DE DEMONSTRAÇÃO”. Dados fictícios nunca são inseridos em empresas reais.
