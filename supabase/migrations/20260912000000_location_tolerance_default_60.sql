-- Liga a tolerância de saída: 60 minutos como padrão da plataforma (86ajp6vrq).
--
-- Por quê: a FAQ global já promete ao cliente "tolerância de 30 minutos antes e 60 minutos
-- depois sem cobrança", mas a engine cobrava diária nova a partir do primeiro minuto de
-- excedente. A promessa publicada e o que o motor cobrava não batiam. Decisão do Kallef em
-- 24/07/2026: honrar a promessa, com 60 minutos para todas as unidades.
--
-- Duas partes, porque uma sem a outra deixa buraco:
--   1. o DEFAULT passa a 60, então unidade nova já nasce honrando a promessa;
--   2. as unidades existentes, todas em 0, sobem para 60.
--
-- Alcance: afeta reservas NOVAS e reprecificação de datas. Reserva já criada não muda, porque
-- o preço dela está snapshotado em `booking.price_breakdown`.
--
-- Reversão: `alter column tolerance_minutes set default 0` + update de volta. A tolerância
-- continua editável por unidade na UI, então um lote específico pode divergir do padrão.
--
-- Fora de escopo: a tolerância de ENTRADA ("30 minutos antes" da mesma FAQ) não é modelada
-- por este campo, que é só de saída.

alter table public.location
  alter column tolerance_minutes set default 60;

update public.location
   set tolerance_minutes = 60
 where tolerance_minutes = 0;

comment on column public.location.tolerance_minutes is
  'Minutos de tolerância na saída antes de virar diária nova. Padrão da plataforma: 60, honrando a FAQ global. Editável por unidade. Consumido por _create_booking_core e reprice_booking_dates. Ver 86ajp6vrq.';
