-- E0.1.2 — Cobrança PIX com split. Colunas de PIX/split no `payment`, idempotência de webhook
-- e a chave configurável do recebedor master da Movepark (editável no Manager). Ver
-- docs/specs/payment-split.md.

-- Dados da cobrança real no payment (QR copia-e-cola, imagem, expiração, snapshot do split, método).
alter table public.payment
  add column if not exists method text,
  add column if not exists pix_qr_code text,
  add column if not exists pix_qr_code_url text,
  add column if not exists expires_at timestamptz,
  add column if not exists split jsonb;

-- Recebedor master da Movepark = perna da comissão no split. Vazio até o hub_admin configurar
-- (Manager → Configurações). Trocar para o recebedor de produção é só editar este valor.
insert into public.app_setting (key, value)
  values ('pagarme_movepark_recipient_id', '')
  on conflict (key) do nothing;

-- Idempotência dos webhooks do gateway: 1 linha por evento processado.
create table if not exists public.payment_webhook_event (
  id          text primary key,                 -- id do evento no provedor
  provider    text not null default 'pagarme',
  type        text,
  received_at timestamptz not null default now()
);
-- Sem policies de RLS → acessível só pelo service_role (a Edge do webhook). Ninguém via RLS.
alter table public.payment_webhook_event enable row level security;
