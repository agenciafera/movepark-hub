-- Opt-in de Termos + documentos legais editáveis (RFN005 · LGPD). Move Termos/Privacidade do código
-- (hardcoded em src/routes/{termos,privacidade}.tsx) para o banco, versionados e editáveis no Manager
-- (rich editor). Registra o aceite POR RESERVA com a versão exata aceita + timestamp + IP (prova de
-- conformidade). O gate é server-authoritative: o pagamento exige o aceite. Ver docs/specs/legal-documents.md.

-- 1) Documento legal (ponteiro por slug) + versões imutáveis (append-only). ---
create table public.legal_document (
  slug               text primary key,          -- 'terms', 'privacy'
  title              text not null,
  current_version_id uuid,                       -- FK setado abaixo (nullable até a 1ª publicação)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.legal_document_version (
  id            uuid primary key default gen_random_uuid(),
  document_slug text not null references public.legal_document(slug) on delete cascade,
  version       integer not null,
  content       text not null,                   -- HTML (schema restrito do Tiptap)
  published_at  timestamptz not null default now(),
  published_by  uuid,                            -- auth.users id do hub_admin que publicou
  unique (document_slug, version)
);

alter table public.legal_document
  add constraint legal_document_current_version_fk
  foreign key (current_version_id) references public.legal_document_version(id);

create trigger legal_document_set_updated_at
  before update on public.legal_document for each row execute function public.set_updated_at();

-- 2) Aceite dos Termos por reserva (auditoria LGPD). -------------------------
create table public.terms_acceptance (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null references public.booking(id) on delete cascade,
  document_version_id uuid not null references public.legal_document_version(id),
  accepted_at         timestamptz not null default now(),
  ip                  text,                       -- IP do aceite (x-forwarded-for; só auditoria)
  unique (booking_id)
);
create index terms_acceptance_booking_idx on public.terms_acceptance(booking_id);

-- 3) RLS. --------------------------------------------------------------------
alter table public.legal_document enable row level security;
alter table public.legal_document_version enable row level security;
alter table public.terms_acceptance enable row level security;

-- Documentos e versões: leitura pública (páginas /termos e /privacidade, anon). Escrita só via RPC
-- SECURITY DEFINER (publish_legal_document) — sem policy de insert/update → bloqueado a anon/auth.
create policy legal_document_public_read on public.legal_document for select using (true);
create policy legal_document_version_public_read on public.legal_document_version for select using (true);

-- Aceite: hub_admin vê tudo; o cliente vê o da própria reserva. Insert só service_role (Edge).
create policy terms_acceptance_select_own on public.terms_acceptance for select using (
  public.is_hub_admin()
  or exists (
    select 1 from public.booking b
    where b.id = terms_acceptance.booking_id and b.profile_id = auth.uid()
  )
);

-- 4) RPCs. -------------------------------------------------------------------
-- Versão atual publicada (para as páginas públicas e para resolver o aceite). Leitura pública.
create or replace function public.get_current_legal_document(p_slug text)
returns table (slug text, title text, version integer, content text, published_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select d.slug, d.title, v.version, v.content, v.published_at
  from public.legal_document d
  join public.legal_document_version v on v.id = d.current_version_id
  where d.slug = p_slug;
$$;
alter function public.get_current_legal_document(text) owner to postgres;
revoke all on function public.get_current_legal_document(text) from public;
grant execute on function public.get_current_legal_document(text) to anon, authenticated, service_role;

-- Publica uma nova versão (só hub_admin). Append-only: incrementa a versão e move o ponteiro.
create or replace function public.publish_legal_document(p_slug text, p_content text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_next int; v_id uuid;
begin
  if not public.is_hub_admin() then
    raise exception 'Apenas administradores podem publicar documentos legais.' using errcode = '42501';
  end if;
  if p_content is null or length(trim(p_content)) = 0 then
    raise exception 'Conteúdo vazio.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.legal_document where slug = p_slug) then
    raise exception 'Documento legal % não existe.', p_slug using errcode = 'P0001';
  end if;
  select coalesce(max(version), 0) + 1 into v_next
    from public.legal_document_version where document_slug = p_slug;
  insert into public.legal_document_version (document_slug, version, content, published_by)
    values (p_slug, v_next, p_content, auth.uid())
    returning id into v_id;
  update public.legal_document set current_version_id = v_id, updated_at = now() where slug = p_slug;
  return jsonb_build_object('slug', p_slug, 'version', v_next, 'version_id', v_id);
end; $$;
alter function public.publish_legal_document(text, text) owner to postgres;
revoke all on function public.publish_legal_document(text, text) from public, anon;
grant execute on function public.publish_legal_document(text, text) to authenticated, service_role;

-- Registra o aceite dos Termos para uma reserva (chamado pela Edge accept-terms, service_role).
-- Resolve a versão vigente dos Termos e grava; idempotente por reserva (re-aceita a versão atual).
create or replace function public.record_terms_acceptance(p_booking_id uuid, p_ip text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_ver_id uuid; v_num int;
begin
  select d.current_version_id, v.version into v_ver_id, v_num
  from public.legal_document d
  join public.legal_document_version v on v.id = d.current_version_id
  where d.slug = 'terms';
  if v_ver_id is null then
    raise exception 'Termos de Uso não publicados.' using errcode = 'P0001';
  end if;
  insert into public.terms_acceptance (booking_id, document_version_id, ip)
    values (p_booking_id, v_ver_id, nullif(trim(p_ip), ''))
  on conflict (booking_id) do update
    set document_version_id = excluded.document_version_id,
        accepted_at = now(),
        ip = excluded.ip;
  return jsonb_build_object('version', v_num, 'version_id', v_ver_id);
end; $$;
alter function public.record_terms_acceptance(uuid, text) owner to postgres;
revoke all on function public.record_terms_acceptance(uuid, text) from public, anon, authenticated;
grant execute on function public.record_terms_acceptance(uuid, text) to service_role;

-- 5) Seed: migra o conteúdo VIGENTE de termos.tsx e privacidade.tsx como versão 1. ---
do $$
declare v_terms_id uuid; v_priv_id uuid;
begin
  insert into public.legal_document (slug, title) values
    ('terms', 'Termos de Uso'),
    ('privacy', 'Política de Privacidade');

  insert into public.legal_document_version (document_slug, version, content) values
    ('terms', 1, $terms$<h2>1. Aceitação dos termos</h2>
<p>Ao acessar ou usar a plataforma Movepark — disponível em <strong>hub.movepark.co</strong> e demais superfícies da marca — você concorda com estes Termos de Uso. Se não concordar com algum item, não utilize o serviço.</p>
<p>A Movepark pode atualizar estes termos a qualquer momento. Alterações relevantes serão comunicadas por e-mail ou notificação na plataforma. O uso continuado após a notificação implica aceite das alterações.</p>
<h2>2. O serviço</h2>
<p>A Movepark é um marketplace que intermedia a reserva de vagas de estacionamento entre viajantes (clientes) e operadores de estacionamento parceiros (parceiros). A Movepark não é proprietária dos estacionamentos listados na plataforma.</p>
<p>O serviço inclui: busca e comparação de vagas, reserva antecipada com preço fixo, pagamento online (PIX e cartão de crédito), voucher digital para check-in, e suporte ao cliente.</p>
<h2>3. Conta de usuário</h2>
<p>Para realizar reservas, você precisa criar uma conta com um endereço de e-mail válido ou número de celular (WhatsApp). Você é responsável por manter a confidencialidade das suas credenciais de acesso.</p>
<p>É proibido criar contas com dados falsos, de terceiros ou de forma automatizada. A Movepark pode suspender ou encerrar contas que violem estes termos.</p>
<h2>4. Reservas e pagamentos</h2>
<p>Ao confirmar uma reserva, você celebra um contrato com o parceiro operador do estacionamento, com a Movepark atuando como intermediadora. O preço exibido é fixo e inclui todos os encargos aplicáveis, salvo indicação contrária.</p>
<p>O pagamento é processado no momento da reserva. Você receberá um voucher digital por e-mail com o código de check-in. Apresente o voucher na entrada do estacionamento.</p>
<p>A Movepark retém uma comissão sobre cada reserva realizada pela plataforma. O repasse ao parceiro é feito conforme os termos acordados entre as partes.</p>
<h2>5. Cancelamentos e reembolsos</h2>
<p>As regras de cancelamento e reembolso estão descritas em detalhes na <a href="/cancelamento">Política de Cancelamento</a>. Em resumo: cancelamentos realizados com antecedência mínima de 48 horas antes do início da reserva têm direito a reembolso integral.</p>
<p>Cancelamentos realizados após o início do período reservado não geram reembolso, salvo em casos de força maior devidamente comprovados.</p>
<h2>6. Condutas proibidas</h2>
<p>É proibido ao usuário:</p>
<ul><li>Fazer reservas com intenção de não comparecer sem cancelar previamente.</li><li>Revender ou transferir reservas sem autorização da Movepark.</li><li>Usar a plataforma para fins ilegais ou fraudulentos.</li><li>Tentar acessar áreas restritas do sistema ou dados de outros usuários.</li><li>Publicar avaliações falsas ou difamatórias sobre parceiros.</li></ul>
<h2>7. Responsabilidades</h2>
<p>A Movepark não se responsabiliza por danos decorrentes de: falhas no estacionamento parceiro, furtos ou danos a veículos nas dependências do parceiro, ou uso indevido das credenciais do usuário.</p>
<p>Os parceiros operadores são integralmente responsáveis pela operação, segurança e condições do estacionamento. A Movepark atua apenas como intermediadora.</p>
<h2>8. Propriedade intelectual</h2>
<p>Todo o conteúdo da plataforma — marca, textos, imagens, código, design — é propriedade da Movepark ou de seus licenciadores. É proibida a reprodução ou uso sem autorização prévia por escrito.</p>
<h2>9. Privacidade</h2>
<p>O tratamento dos seus dados pessoais é descrito na <a href="/privacidade">Política de Privacidade</a>, em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018).</p>
<h2>10. Lei aplicável e foro</h2>
<p>Estes termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da Comarca de São Paulo/SP para dirimir quaisquer disputas decorrentes deste instrumento, com renúncia a qualquer outro, por mais privilegiado que seja.</p>
<h2>11. Contato</h2>
<p>Dúvidas sobre estes termos? <a href="/contato">Entre em contato</a> com nossa equipe.</p>$terms$)
    returning id into v_terms_id;

  insert into public.legal_document_version (document_slug, version, content) values
    ('privacy', 1, $priv$<p>Em conformidade com a Lei Geral de Proteção de Dados — LGPD (Lei 13.709/2018).</p>
<h2>1. Quem somos</h2>
<p>A <strong>Movepark</strong> é a controladora dos dados pessoais coletados nesta plataforma, disponível em <strong>hub.movepark.co</strong>. Nosso e-mail de contato para questões de privacidade é <a href="mailto:privacidade@movepark.co">privacidade@movepark.co</a>.</p>
<h2>2. Dados que coletamos</h2>
<p>Coletamos os seguintes dados pessoais:</p>
<ul><li><strong>Cadastro:</strong> nome completo, e-mail, número de celular (WhatsApp).</li><li><strong>Reservas:</strong> dados do veículo (placa, modelo), datas de entrada e saída, preferências de vaga.</li><li><strong>Pagamento:</strong> dados de cobrança (processados pelo gateway de pagamento Pagar.me — não armazenamos número de cartão).</li><li><strong>Uso da plataforma:</strong> endereço IP, tipo de dispositivo, páginas visitadas, buscas realizadas (via cookies e logs do servidor).</li><li><strong>Avaliações:</strong> textos e notas enviadas sobre estacionamentos.</li></ul>
<h2>3. Finalidade do tratamento</h2>
<p>Usamos seus dados para:</p>
<ul><li>Criar e gerenciar sua conta na plataforma.</li><li>Processar reservas e pagamentos.</li><li>Enviar confirmações, vouchers e notificações de reserva por e-mail ou WhatsApp.</li><li>Oferecer suporte ao cliente e resolver disputas.</li><li>Melhorar a plataforma com base em análise de uso anonimizado.</li><li>Cumprir obrigações legais e regulatórias.</li><li>Enviar comunicações de marketing (somente com seu consentimento explícito).</li></ul>
<h2>4. Base legal</h2>
<p>O tratamento dos seus dados é realizado com base em:</p>
<ul><li><strong>Execução de contrato</strong> — para processar reservas e pagamentos (art. 7º, V, LGPD).</li><li><strong>Obrigação legal</strong> — para cumprimento de exigências fiscais e regulatórias (art. 7º, II, LGPD).</li><li><strong>Legítimo interesse</strong> — para segurança, prevenção a fraudes e melhoria do serviço (art. 7º, IX, LGPD).</li><li><strong>Consentimento</strong> — para comunicações de marketing (art. 7º, I, LGPD).</li></ul>
<h2>5. Compartilhamento de dados</h2>
<p>Seus dados podem ser compartilhados com:</p>
<ul><li><strong>Parceiros operadores:</strong> o estacionamento da sua reserva recebe nome, placa do veículo e código de check-in para viabilizar o acesso.</li><li><strong>Processadores de pagamento:</strong> Pagar.me, para processar transações financeiras.</li><li><strong>Infraestrutura:</strong> Supabase (banco de dados) e Cloudflare (CDN e segurança), sob acordos de processamento de dados.</li><li><strong>Autoridades:</strong> quando exigido por lei ou decisão judicial.</li></ul>
<p>Não vendemos seus dados a terceiros.</p>
<h2>6. Retenção de dados</h2>
<p>Mantemos seus dados pelo tempo necessário para prestar o serviço e cumprir obrigações legais:</p>
<ul><li>Dados de conta: enquanto a conta estiver ativa, mais 5 anos após encerramento.</li><li>Dados de reservas e pagamentos: 5 anos (exigência fiscal).</li><li>Logs de acesso: 6 meses (Marco Civil da Internet).</li></ul>
<h2>7. Seus direitos (LGPD)</h2>
<p>Como titular de dados, você tem direito a:</p>
<ul><li>Confirmar a existência e acessar seus dados.</li><li>Corrigir dados incompletos, inexatos ou desatualizados.</li><li>Solicitar anonimização, bloqueio ou eliminação de dados desnecessários.</li><li>Portabilidade dos seus dados a outro fornecedor de serviço.</li><li>Revogar consentimentos a qualquer momento.</li><li>Opor-se a tratamentos realizados com base em legítimo interesse.</li><li>Peticionar à Autoridade Nacional de Proteção de Dados (ANPD).</li></ul>
<p>Para exercer seus direitos, envie um e-mail para <a href="mailto:privacidade@movepark.co">privacidade@movepark.co</a> ou acesse as configurações da sua conta.</p>
<h2>8. Cookies</h2>
<p>Utilizamos cookies técnicos (necessários ao funcionamento) e cookies analíticos (para medir o desempenho da plataforma, de forma anonimizada). Não utilizamos cookies de rastreamento para publicidade de terceiros.</p>
<p>Você pode configurar seu navegador para bloquear cookies, mas isso pode afetar o funcionamento de algumas funcionalidades da plataforma.</p>
<h2>9. Segurança</h2>
<p>Adotamos medidas técnicas e organizacionais para proteger seus dados: criptografia em trânsito (TLS), controle de acesso baseado em papéis (RBAC), autenticação segura e monitoramento contínuo de incidentes. Em caso de violação de dados que possa causar risco relevante, notificaremos a ANPD e os titulares afetados nos prazos legais.</p>
<h2>10. Contato e DPO</h2>
<p>Para dúvidas sobre privacidade ou para exercer seus direitos, entre em contato com nosso Encarregado de Proteção de Dados (DPO):</p>
<p>E-mail: <a href="mailto:privacidade@movepark.co">privacidade@movepark.co</a></p>$priv$)
    returning id into v_priv_id;

  update public.legal_document set current_version_id = v_terms_id where slug = 'terms';
  update public.legal_document set current_version_id = v_priv_id where slug = 'privacy';
end $$;
