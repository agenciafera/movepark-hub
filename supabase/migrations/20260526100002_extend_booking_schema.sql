-- Extensões da tabela booking
-- Campos identificados no legado que estavam faltando no schema inicial

alter table public.booking
  -- controle de expiração para pagamentos assíncronos (PIX/boleto)
  add column expires_at       timestamptz,

  -- dados do passageiro (exibidos no voucher e controlados pela unidade)
  add column passenger_count  integer,
  add column has_pcd          boolean not null default false,

  -- rastreamento de origem
  add column origin           text,  -- ex: 'web', 'app', 'parceiro'
  add column utm_source       text,
  add column utm_medium       text,
  add column utm_campaign     text,
  add column external_id      text,  -- ID externo para integrações com parceiros

  -- voucher e timestamps reais de check-in/out
  -- (distintos de check_in_at/check_out_at que são o agendamento)
  add column voucher_url      text,        -- URL do PDF gerado no storage
  add column checked_in_at    timestamptz, -- timestamp real de entrada (via QR)
  add column checked_out_at   timestamptz; -- timestamp real de saída
