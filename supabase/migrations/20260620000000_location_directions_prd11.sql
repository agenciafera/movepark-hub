-- PRD-11 — Instruções de acesso / bloco "Como chegar" no detalhe da unidade.
-- O endereço (que já temos) diz ONDE fica; falta o COMO: o passo-a-passo de chegada
-- (`directions_text`, markdown) e o traslado operacional honesto (frequência + tempo até o
-- terminal). O `notice` existente passa a ser o AVISO CRÍTICO de entrada (ex.: "use a rua
-- lateral, o GPS erra a entrada") — esta migration só adiciona o que falta. Tudo aditivo e
-- nullable: conteúdo por unidade, preenchido pelo parceiro/operador. Geo/distância NÃO entram
-- aqui (vêm de DAT-04, proximidade calculada).

alter table public.location
  add column directions_text text,
  add column shuttle_frequency_minutes integer,
  add column shuttle_to_terminal_minutes integer;

-- Traslado: minutos positivos quando informados (0/negativo não faz sentido operacional).
alter table public.location
  add constraint location_shuttle_frequency_positive
    check (shuttle_frequency_minutes is null or shuttle_frequency_minutes > 0),
  add constraint location_shuttle_to_terminal_positive
    check (shuttle_to_terminal_minutes is null or shuttle_to_terminal_minutes > 0);

comment on column public.location.directions_text is
  'PRD-11: passo-a-passo de chegada (markdown), o COMO. O ONDE é address/geo.';
comment on column public.location.shuttle_frequency_minutes is
  'PRD-11: frequência do traslado em minutos (ex.: 15 = a cada 15 min). Null se não há ou é variável.';
comment on column public.location.shuttle_to_terminal_minutes is
  'PRD-11: tempo aproximado do traslado até o terminal, em minutos.';
