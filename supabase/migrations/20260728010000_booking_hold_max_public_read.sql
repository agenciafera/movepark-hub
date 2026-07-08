-- E0.3.1-b · Expõe o teto de renovação pro checkout do cliente.
-- `app_setting` é admin-only por RLS, mas o modal keep-alive precisa saber o teto pra exibir/gatear.
-- A RPC `get_booking_hold_max_minutes` retorna só um número de config (não sensível) → liberada
-- para `anon`/`authenticated`. O valor real continua em `booking_hold_max_minutes` (editável no
-- Manager → Configurações → Pagamentos).
grant execute on function public.get_booking_hold_max_minutes() to anon, authenticated;
