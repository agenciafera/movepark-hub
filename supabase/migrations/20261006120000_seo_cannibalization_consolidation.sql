-- SEO Consolidation: Canibalization Fix
-- Implementa 301 redirects para consolidar tráfego de posts guia antigos
-- para os novos guias completos (canonical per destino).
--
-- Estratégia:
-- 1. Criar tabela de rastreamento de redirects
-- 2. Inserir 301s para consolidar 12 posts antigos em 5 novos guias-completos
-- 3. Links internos adicionados manualmente em body_md dos guias (seção "Posts Relacionados")

CREATE TABLE IF NOT EXISTS public.blog_post_redirect (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  old_slug TEXT NOT NULL UNIQUE,
  new_slug TEXT NOT NULL,
  destination_id UUID REFERENCES public.destination(id) ON DELETE SET NULL,
  http_status INT NOT NULL DEFAULT 301,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.blog_post_redirect IS
  'Registro de 301 redirects para consolidação SEO. Implementa "guia antigo → guia-completo canonical".';
COMMENT ON COLUMN public.blog_post_redirect.old_slug IS
  'Slug original que será redirecionado (ex: guia-atualizado-5-melhores-opcoes-...).';
COMMENT ON COLUMN public.blog_post_redirect.new_slug IS
  'Slug canonical para o qual o antigo redireciona (ex: guia-completo-aeroporto-guarulhos).';
COMMENT ON COLUMN public.blog_post_redirect.http_status IS
  'Sempre 301 Moved Permanently. Preserva PageRank.';
COMMENT ON COLUMN public.blog_post_redirect.reason IS
  'Motivo técnico: cannibalization_consolidation, content_merge, etc.';

CREATE TRIGGER blog_post_redirect_set_updated_at
  BEFORE UPDATE ON public.blog_post_redirect
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Inserir redirects para consolidação dos 5 destinos críticos
-- GRU (Guarulhos) → guia-completo-aeroporto-guarulhos
INSERT INTO public.blog_post_redirect (old_slug, new_slug, destination_id, reason)
SELECT
  'estacionamento-gru-airport-guia-completo-para-parar-seu-carro-com-tranquilidade',
  'guia-completo-aeroporto-guarulhos',
  d.id,
  'cannibalization_consolidation'
FROM destination d WHERE d.slug = 'aeroporto-internacional-de-sao-paulo-guarulhos'
ON CONFLICT (old_slug) DO NOTHING;

INSERT INTO public.blog_post_redirect (old_slug, new_slug, destination_id, reason)
SELECT
  'melhor-estacionamento-aeroporto-guarulhos-guia-completo-para-escolher-com-seguranca-economia-e-conforto',
  'guia-completo-aeroporto-guarulhos',
  d.id,
  'cannibalization_consolidation'
FROM destination d WHERE d.slug = 'aeroporto-internacional-de-sao-paulo-guarulhos'
ON CONFLICT (old_slug) DO NOTHING;

INSERT INTO public.blog_post_redirect (old_slug, new_slug, destination_id, reason)
SELECT
  'guia-atualizado-5-melhores-opcoes-de-estacionamento-no-aeroporto-guarulhos-em-2024',
  'guia-completo-aeroporto-guarulhos',
  d.id,
  'cannibalization_consolidation'
FROM destination d WHERE d.slug = 'aeroporto-internacional-de-sao-paulo-guarulhos'
ON CONFLICT (old_slug) DO NOTHING;

INSERT INTO public.blog_post_redirect (old_slug, new_slug, destination_id, reason)
SELECT
  'seu-guia-definitivo-para-uma-partida-descomplicada-dicas-valiosas-do-aeroporto-de-guarulhos',
  'guia-completo-aeroporto-guarulhos',
  d.id,
  'cannibalization_consolidation'
FROM destination d WHERE d.slug = 'aeroporto-internacional-de-sao-paulo-guarulhos'
ON CONFLICT (old_slug) DO NOTHING;

-- VCP (Viracopos) → guia-completo-aeroporto-viracopos
INSERT INTO public.blog_post_redirect (old_slug, new_slug, destination_id, reason)
SELECT
  'estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica',
  'guia-completo-aeroporto-viracopos',
  d.id,
  'cannibalization_consolidation'
FROM destination d WHERE d.slug = 'aeroporto-de-viracopos'
ON CONFLICT (old_slug) DO NOTHING;

INSERT INTO public.blog_post_redirect (old_slug, new_slug, destination_id, reason)
SELECT
  'qual-o-melhor-estacionamento-no-aeroporto-de-viracopos-guia-completo-para-economizar-e-viajar-com-tranquilidade',
  'guia-completo-aeroporto-viracopos',
  d.id,
  'cannibalization_consolidation'
FROM destination d WHERE d.slug = 'aeroporto-de-viracopos'
ON CONFLICT (old_slug) DO NOTHING;

INSERT INTO public.blog_post_redirect (old_slug, new_slug, destination_id, reason)
SELECT
  'viracopos-para-iniciantes-guia-para-uma-viagem-tranquila-e-sem-estresse',
  'guia-completo-aeroporto-viracopos',
  d.id,
  'cannibalization_consolidation'
FROM destination d WHERE d.slug = 'aeroporto-de-viracopos'
ON CONFLICT (old_slug) DO NOTHING;

-- CNF (Confins) → guia-completo-aeroporto-confins
INSERT INTO public.blog_post_redirect (old_slug, new_slug, destination_id, reason)
SELECT
  'tudo-sobre-o-aeroporto-de-confins-guia-completo',
  'guia-completo-aeroporto-confins',
  d.id,
  'cannibalization_consolidation'
FROM destination d WHERE d.slug = 'aeroporto-de-confins'
ON CONFLICT (old_slug) DO NOTHING;

-- CWB (Curitiba/Afonso Pena) → guia-completo-aeroporto-curitiba
INSERT INTO public.blog_post_redirect (old_slug, new_slug, destination_id, reason)
SELECT
  'aeroporto-afonso-pena-confira-o-guia-completo-para-sua-viagem',
  'guia-completo-aeroporto-curitiba',
  d.id,
  'cannibalization_consolidation'
FROM destination d WHERE d.slug = 'aeroporto-afonso-pena'
ON CONFLICT (old_slug) DO NOTHING;

-- POA (Porto Alegre/Salgado Filho) - nenhum antigo, mas tabela pronta para próximos

-- Validação
SELECT COUNT(*) as total_redirects FROM public.blog_post_redirect;
