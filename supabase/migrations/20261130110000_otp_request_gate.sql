-- Portão do pedido de código de login (19/10/2026).
--
-- Em 18/10 a Mia pediu o código do mesmo cliente novo duas vezes ao mesmo tempo (duas chamadas a
-- /mcp/customer com menos de 1 s de diferença). O GoTrue criou a conta na primeira e quebrou a
-- segunda com 500 (`users_phone_key` duplicada); a Mia recebeu erro no meio da conversa. Aconteceu
-- duas vezes no dia.
--
-- `otp_request_gate` serializa os pedidos do MESMO identificador com um advisory lock e, se já
-- houve pedido nos últimos 30 s, devolve `recent` sem gastar o freio nem chamar o GoTrue (que
-- recusaria com 429 de qualquer jeito, ele segura 60 s entre disparos). Fora isso, delega para o
-- freio de custo `otp_request_allowed` (20261007000000): `send` quando cabe, `blocked` quando não.
-- O identificador continua em SHA-256.

create or replace function public.otp_request_gate(p_identifier_hash text, p_ip text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_identifier_hash is null or length(p_identifier_hash) <> 64 then
    raise exception 'Identificador inválido.' using errcode = 'P0001';
  end if;

  -- Dois pedidos simultâneos do mesmo identificador: o segundo espera o primeiro gravar o log.
  perform pg_advisory_xact_lock(hashtextextended('otp_request:' || p_identifier_hash, 0));

  if exists (
    select 1 from public.otp_request_log
     where identifier_hash = p_identifier_hash
       and created_at > now() - interval '30 seconds'
  ) then
    return 'recent';
  end if;

  return case when public.otp_request_allowed(p_identifier_hash, p_ip) then 'send' else 'blocked' end;
end;
$$;

revoke all on function public.otp_request_gate(text, text) from public, anon, authenticated;
grant execute on function public.otp_request_gate(text, text) to service_role;
