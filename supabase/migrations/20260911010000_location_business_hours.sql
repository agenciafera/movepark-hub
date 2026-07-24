-- Horário de funcionamento da unidade (86ajp6vnf).
--
-- Quase toda base de conhecimento responde "qual o horário" e "posso retirar fora do horário".
-- A maioria das unidades é 24h, mas há exceção: Move Parking (Nova Iguaçu) é comercial
-- (seg a sex 07h-20h, sáb 08h-17h). Hoje a location só tem `timezone`, não o horário, então
-- a resposta automática não consegue cravar 24h.
--
-- Modelo: uma flag `is_24h` (default true, o caso comum) e, quando ela é false, um jsonb
-- `business_hours` com o horário por dia da semana. Forma esperada do jsonb (chaves mon..sun,
-- valor {open, close} em HH:MM ou null quando fecha):
--   { "mon": {"open":"07:00","close":"20:00"}, ..., "sat": {"open":"08:00","close":"17:00"}, "sun": null }
-- Quando `is_24h` é true, `business_hours` é ignorado (fica null). A validação da forma vive na app.

alter table public.location
  add column if not exists is_24h boolean not null default true,
  add column if not exists business_hours jsonb;

comment on column public.location.is_24h is
  'Unidade funciona 24 horas, todos os dias. Default true (caso comum). Quando false, o horário vem de business_hours.';

comment on column public.location.business_hours is
  'Horário por dia da semana quando a unidade não é 24h. jsonb com chaves mon..sun e valor {open,close} em HH:MM, ou null no dia que fecha. Ignorado quando is_24h. Ver 86ajp6vnf.';
