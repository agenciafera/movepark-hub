-- E0.10 · O preview do merge precisa dizer QUAL credencial morre.
--
-- O `auth.users` guarda um e-mail e um telefone por conta. Quando as duas contas têm e-mail
-- verificado e eles são diferentes, o merge apaga a conta perdedora e o e-mail dela deixa de
-- existir como login. Antes, o preview só devolvia contagens (reservas, veículos, favoritos,
-- avaliações), então a tela "conectar contas" prometia que nada era perdido, o que era falso.
-- Agora o preview devolve também o e-mail e o telefone da conta perdedora, e a UI avisa o que
-- deixa de funcionar como login (Q-006).

create or replace function public.merge_preview(p_loser uuid)
returns jsonb language sql security definer set search_path to 'public' stable as $$
  select jsonb_build_object(
    'bookings', (select count(*) from public.booking       where profile_id = p_loser),
    'vehicles', (select count(*) from public.vehicle       where profile_id = p_loser),
    'saved',    (select count(*) from public.profile_saved where profile_id = p_loser),
    'reviews',  (select count(*) from public.review        where profile_id = p_loser),
    -- Credenciais da conta perdedora: são elas que somem do login quando ela é apagada.
    'email',    (select u.email from auth.users u where u.id = p_loser and u.email_confirmed_at is not null),
    'phone',    (select u.phone from auth.users u where u.id = p_loser and u.phone_confirmed_at is not null)
  );
$$;
revoke all on function public.merge_preview(uuid) from public, anon, authenticated;
grant execute on function public.merge_preview(uuid) to service_role;
