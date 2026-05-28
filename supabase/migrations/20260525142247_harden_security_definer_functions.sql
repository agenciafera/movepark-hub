-- Fix search_path on set_updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Revoke EXECUTE on SECURITY DEFINER functions from public roles
-- These are meant to run only as triggers / event triggers, not via REST RPC.
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
