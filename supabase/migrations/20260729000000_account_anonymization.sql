-- E0.9 · Exclusão de conta pelo usuário + anonimização (LGPD art. 18).
--
-- Decisão: anonimizar IN-PLACE, mantendo a venda. O esquema força isso —
-- `booking.profile_id → profiles.id` é ON DELETE RESTRICT (reservas travam a exclusão do
-- perfil) e `profiles.id → auth.users.id` é ON DELETE CASCADE (deletar o auth.users de quem
-- tem reserva falharia). Então não há hard-delete do perfil: faz-se scrub da PII in-place.
--
-- Esta RPC faz só o scrub ATÔMICO no banco, operando sobre `auth.uid()` (self-service — não é
-- company-scoped, logo fora do modelo de escopos da ADR-005; a autorização é "só a própria
-- conta"). Os passos que exigem service_role (estorno de reservas ativas, delete de objetos no
-- Storage, scrub+ban do auth.users) moram na Edge `delete-account`, que chama esta função com o
-- JWT do próprio usuário (auth.uid()).
--
-- Ver docs/specs/customer/account-deletion.md.

create or replace function public.anonymize_own_account()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;

  -- Guarda: só consumidor. Se o usuário for membro/dono de alguma empresa, aborta — o fluxo de
  -- operador (saída/transferência de titularidade, KYC do recebedor) está fora do escopo (E0.9).
  if exists (select 1 from public.profile_company where profile_id = v_uid) then
    raise exception 'Conta vinculada a uma empresa. Saia ou transfira a titularidade antes de excluir.'
      using errcode = 'P0001';
  end if;

  -- Perfil: scrub da PII, mantendo a linha (as reservas apontam pra ela via RESTRICT).
  update public.profiles
  set full_name  = '(Conta excluída)',
      phone      = null,
      tax_id     = null,
      birth_date = null,
      avatar_url = null,
      preferences = '{}'::jsonb,
      deleted_at = coalesce(deleted_at, now()),
      updated_at = now()
  where id = v_uid;

  -- Reservas: scrub da PII, MANTENDO a venda (preço, datas, status, utm, profile_id).
  update public.booking
  set customer_name  = null,
      customer_email = null,
      customer_phone = null,
      notes          = null,
      voucher_url    = null,
      updated_at     = now()
  where profile_id = v_uid;

  -- Dados puramente pessoais (sem valor de venda): remove.
  -- booking.vehicle_id é ON DELETE SET NULL → apagar o veículo desliga a referência histórica.
  delete from public.vehicle        where profile_id = v_uid;
  delete from public.address        where profile_id = v_uid;
  delete from public.payment_method where profile_id = v_uid;
  delete from public.profile_saved  where profile_id = v_uid;

  -- Reviews: MANTIDAS (rating/comentário têm valor pro local); o autor fica anônimo via
  -- profiles.full_name = '(Conta excluída)'. Nada a fazer aqui.
end;
$$;

-- Self-service: qualquer usuário autenticado pode anonimizar A PRÓPRIA conta (a função só toca
-- auth.uid()). service_role para a Edge orquestradora. Nunca anon.
revoke all on function public.anonymize_own_account() from public, anon;
grant execute on function public.anonymize_own_account() to authenticated, service_role;

comment on function public.anonymize_own_account() is
  'E0.9/LGPD: anonimiza a própria conta (auth.uid()) in-place, mantendo reservas/pagamentos. '
  'Aborta se o usuário for membro de empresa. Orquestrada pela Edge delete-account.';
