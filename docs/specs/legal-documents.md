# Documentos legais + opt-in de Termos (RFN005 · LGPD)

Tira os Termos de Uso e a Política de Privacidade do código (antes hardcoded em
`src/routes/{termos,privacidade}.tsx`) e os move para o banco — **versionados e editáveis no Manager
por rich editor**. E registra o **aceite explícito por reserva** no checkout, com a versão exata
aceita + timestamp + IP (prova de conformidade). Origem: reunião 03/07/2026 · tarefa
[86ajcf63y](https://app.clickup.com/t/86ajcf63y).

## Modelo de dados (migration `20260727000003_legal_documents.sql`)

- **`legal_document`** — ponteiro por slug (`terms`, `privacy`): `title`, `current_version_id`.
- **`legal_document_version`** — histórico **append-only** (imutável): `document_slug`, `version`
  (1,2,3… por slug), `content` (HTML), `published_at`, `published_by`. `unique(slug, version)`.
- **`terms_acceptance`** — aceite por reserva: `booking_id` (`unique`), `document_version_id`
  (a versão exata aceita), `accepted_at`, `ip` (texto, só auditoria).

**RLS:** `legal_document`/`legal_document_version` têm **leitura pública** (páginas anon); escrita só
via RPC. `terms_acceptance`: `select` do próprio (hub_admin ou dono da reserva); **sem policy de
insert** → só `service_role` (Edge) grava.

## RPCs

- `get_current_legal_document(slug)` — versão vigente publicada (leitura pública). Renderiza as páginas.
- `publish_legal_document(slug, content)` — publica nova versão (incrementa + move o ponteiro).
  **Só hub_admin** (gate interno `is_hub_admin()` → 42501). `grant authenticated`.
- `record_terms_acceptance(booking_id, ip)` — resolve a versão vigente dos Termos e grava o aceite;
  **idempotente** por reserva (re-aceita a versão atual). `grant service_role`.

## Fluxo do aceite (server-authoritative)

1. **Checkout `Step1Identity`** — checkbox obrigatório de aceite (já existia; agora funcional). No
   "Continuar", chama a Edge **`accept-terms`** (JWT, valida dono da reserva) → grava
   `terms_acceptance` com a versão vigente + IP (`x-forwarded-for`).
2. **Gate no pagamento** — `create-pix-charge`/`create-card-charge` exigem que exista
   `terms_acceptance` para a reserva → sem aceite, **422**. O checkbox client-side **não** é a única
   barreira (ADR: server-authoritative).

## Edição no Manager

- **`/manager/legal`** (RequireRole `hub_admin`): seletor de documento + **editor Tiptap** (schema
  **restrito**: h2/h3, negrito, itálico, listas, links `http/https/mailto`) + "Publicar nova versão"
  + histórico de versões (read-only). Tiptap é client-only (`immediatelyRender:false` → SSR-safe).

## Páginas públicas

`/termos` e `/privacidade` renderizam do banco via `useLegalDocument(slug)` (client-fetch — a edição
reflete na hora; a meta de SEO fica no HTML estático do SSG). A "Última atualização" é o
`published_at` da versão vigente. O HTML é **sanitizado com DOMPurify** (allowlist casando o schema
do Tiptap) antes do `dangerouslySetInnerHTML` — **não** confia no schema client-side do editor como
fronteira de segurança (defesa em profundidade contra markup gravado fora do editor).

## Versionamento & re-aceite

Cada publicação cria uma nova versão imutável; o aceite referencia a versão exata (reproduz o texto
aceito). Como o aceite é **por reserva**, cada nova reserva aceita a versão vigente — não há re-aceite
forçado de reservas antigas quando o texto muda (fora de escopo, decidido).

## Testes

- **pgTAP** `legal_documents.test.sql`: seed (v1), `publish_legal_document` (incrementa + move ponteiro
  + gate hub_admin/42501), `record_terms_acceptance` (versão vigente + idempotência).
- **Vitest**: `LegalDocumentPage` (render do banco), `ManagerLegal` (publicar), `Step1Identity` (gate).
- **deno**: gate de aceite embutido nas Edges de pagamento.
