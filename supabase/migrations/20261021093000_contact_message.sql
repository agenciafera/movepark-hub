-- O formulário de contato passa a ter destino e registro.
--
-- Até aqui `/contato` montava um `mailto:` e fazia `window.location.href`. Isso não é
-- envio: joga o visitante para fora do site, depende de ele ter cliente de e-mail
-- configurado, e no celular costuma abrir um aplicativo que ele nem usa. Pior, a tela
-- dizia "Mensagem enviada!" logo depois, então quem desistia no cliente de e-mail saía
-- achando que a mensagem tinha chegado. Nunca chegou nada, e não havia registro de nada.
--
-- A mensagem agora é gravada aqui antes de qualquer e-mail sair. A ordem importa: o SMTP
-- é a parte que falha (credencial vencida, caixa cheia, remetente não configurado), e se
-- o registro dependesse do envio a Movepark perderia a mensagem junto. Gravado primeiro,
-- o pior caso é uma mensagem que ninguém foi avisado que chegou, e que ainda está no
-- banco para ser respondida.
--
-- `email_status` guarda o resultado do envio em texto porque é diagnóstico, não máquina de
-- estados: quem lê é uma pessoa procurando por que o alerta não chegou.

create table public.contact_message (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  email text not null,
  message text not null,

  -- Procedência, para triagem. Ambos opcionais: são dica de contexto, não identidade.
  page_url text,
  user_agent text,

  -- Resultado do envio de e-mail, preenchido depois da resposta ao visitante.
  email_status text,

  answered_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.contact_message is
  'Mensagens do formulário público de /contato. Gravadas pela Edge submit-contact-message com service_role, antes do envio de e-mail.';
comment on column public.contact_message.email_status is
  'Diagnóstico do envio de e-mail em texto livre, para uma pessoa entender por que o alerta não chegou.';

-- A caixa de entrada da triagem: quem chegou e ainda não foi respondido, mais recente
-- primeiro. Parcial porque mensagem apagada não entra em fila de atendimento.
create index contact_message_triagem_idx
  on public.contact_message (created_at desc)
  where deleted_at is null;

create trigger contact_message_set_updated_at
  before update on public.contact_message
  for each row execute function public.set_updated_at();

-- RLS: só hub_admin lê e gerencia.
--
-- Não existe policy de INSERT para `anon`, e é de propósito. Abrir escrita pública nesta
-- tabela deixaria qualquer um gravar linha direto por PostgREST, sem passar pelo honeypot
-- nem pela validação da Edge. O visitante escreve pela Edge, que usa service_role e
-- ignora RLS.
alter table public.contact_message enable row level security;

create policy contact_message_admin_all on public.contact_message
  for all
  to authenticated
  using (public.is_hub_admin())
  with check (public.is_hub_admin());

-- Destino da mensagem, editável sem deploy (é o que a atividade pede como "caminho claro
-- para atualizar"). Privado: `is_public` nasce `false`, e caixa de suporte não é dado de
-- vitrine.
insert into public.app_setting (key, value)
values ('support_inbox', 'contato@movepark.co')
on conflict (key) do nothing;
