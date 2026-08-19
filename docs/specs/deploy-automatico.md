# Publicação automática do site

**Status:** implementado em 19/08/2026, migration `20261030140000_deploy_automatico_no_save.sql`.
**Pendente de ativação:** o Deploy Hook precisa ser criado no Cloudflare e guardado no Vault (§5).

## O problema

A página pública é SSG. O `loader` roda no build, o HTML sai pronto e o `useListing` recebe esse
dado como `initialData` com `staleTime` de 60s, então nem no cliente ele é refeito no
carregamento. Consequência: **o que está no ar é o retrato do último build, não o banco.**

Isso não era teoria. Em 19/08/2026 a Abbapark e a Nationpark tiveram as comodidades reeditadas no
Manager e o site seguiu mostrando a lista antiga por horas, inclusive uma comodidade
("Seguro voo") que já tinha sido removida do banco. O histórico do repo tem commit vazio criado só
para forçar publicação (`21aeb4a8`), o que mostra que a lacuna já era conhecida e resolvida na mão.

Quem edita no Manager não tem como saber disso. A tela confirma o salvamento, o banco guarda, e o
site continua com o conteúdo velho até alguém do time lembrar de rebuildar.

## O desenho

```
save no Manager
  └─ trigger de statement na tabela  ──►  site_rebuild_request (fila)
                                              │
        pg_cron, de minuto em minuto ─────────┤ site_rebuild_decision()
                                              │   decide: publicar agora ou esperar
                                              ▼
                                     Deploy Hook do Workers Builds
                                              │
                                              ▼
                                    build + deploy (~3 min)
```

Três escolhas que valem registrar:

**O disparo não acontece no trigger.** Um save do Manager toca várias tabelas na mesma transação.
Chamar HTTP dali penduraria a transação do usuário na latência do Cloudflare e dispararia um build
por tabela tocada. O trigger só enfileira; quem decide é o cron.

**A fila coalesce.** Vinte edições seguidas viram um build só. O cron espera o editor ficar quieto
antes de publicar, com um teto para que uma sessão longa de edição não adie a publicação para
sempre.

**O trigger é de statement, não de linha.** Salvar as comodidades de uma unidade regrava dez linhas
de `location_amenity`. Como o build é do site inteiro, saber qual linha mudou não muda nada, e uma
linha de fila por statement basta.

## Quando publica

`public.site_rebuild_decision(p_now)` responde `{acao, motivo, pendentes}` e é a regra inteira num
lugar só. Ela recebe o "agora" por parâmetro justamente para ser testável sem esperar o relógio.

| Situação | Resposta |
|---|---|
| Nada na fila | `nada_pendente` |
| `enabled: false` no `app_setting` | `desligado` |
| Último build há menos de `min_interval_seconds` | `intervalo_minimo` |
| Mudança mais recente há menos de `quiet_seconds`, e a mais antiga ainda dentro de `max_wait_seconds` | `aguardando_silencio` |
| Qualquer outro caso com fila | `disparar` |

Config em `app_setting.site_rebuild_policy` (JSON), editável sem migration:

```json
{"enabled": true, "quiet_seconds": 180, "max_wait_seconds": 1200, "min_interval_seconds": 600}
```

- **`quiet_seconds` (3 min)** é a espera pelo silêncio: publica depois que o editor parou.
- **`max_wait_seconds` (20 min)** é o teto dessa espera: quem edita sem pausar publica assim mesmo.
- **`min_interval_seconds` (10 min)** é o teto de frequência, que protege a cota de build minutos
  do Cloudflare de uma enxurrada de escrita (import, correção em massa) virar um build por minuto.
- **`enabled`** é o desligamento de emergência, sem deploy e sem migration.

## O que dispara

Tabelas com trigger `<tabela>_site_rebuild` (todas em `public`):

| Grupo | Tabelas |
|---|---|
| Unidade e empresa | `location`, `location_amenity`, `location_parking_type`, `company`, `company_parking_type`, `amenity`, `parking_type` |
| Catálogo e conteúdo | `destination`, `prospect_location`, `faq`, `faq_category`, `blog_post` |
| Preço | `pricing_rule`, `pricing_tier`, `pricing_hourly_bracket` |

**Regra para crescer a lista:** entra tabela cujo conteúdo aparece em página pré-renderizada **e**
que é escrita por gente. Ficaram de fora de propósito:

- **`google_place_snapshot`**, reescrita pelo cron de avaliações do Google. Entraria em laço de
  build a cada refresh.
- **`review`**, porque a nota que a página mostra vive em `location.review_avg` e o trigger
  `review_bump_rating` já atualiza `location`, que está na lista. Cobrir as duas só duplicaria o
  pedido.
- **`booking`** e o resto do caminho transacional, que não sai em HTML pré-renderizado.

## Ativação (o passo que depende de gente)

Enquanto o segredo não existir, a fila enche e nada é publicado: o cron responde
`sem_deploy_hook` e não carimba nada. No dia em que o segredo entrar, o minuto seguinte publica
tudo o que se acumulou. Nada se perde.

1. No Cloudflare, em **Workers & Pages › movepark-hub › Settings › Builds › Deploy Hooks**, crie um
   hook na branch `main`. Ele é uma URL secreta: quem tiver a URL dispara build.
2. No Supabase, em **Integrations › Vault**, crie o segredo com o nome exato
   **`cloudflare_deploy_hook_url`** e a URL como valor.

Não coloque a URL no repo, no `wrangler.jsonc` nem em variável do front.

## Observar

```sql
-- a decisão neste instante
select public.site_rebuild_decision();

-- o que está pendente e desde quando
select source_table, count(*), min(requested_at)
  from public.site_rebuild_request where dispatched_at is null group by 1;

-- os últimos builds disparados, com a resposta do Cloudflare
select r.dispatch_id, min(r.dispatched_at) as em, count(*) as pedidos, resp.status_code
  from public.site_rebuild_request r
  left join net._http_response resp on resp.id = r.net_request_id
 where r.dispatch_id is not null
 group by r.dispatch_id, resp.status_code order by em desc limit 10;
```

A fila é lida no painel só por `hub_admin` (RLS). Pedido despachado é podado depois de 30 dias
(`cron_prune_site_rebuild_request`, 04:41 diário).

## Limites conhecidos

- **Latência mínima de publicação é o build.** Com as janelas atuais, uma edição isolada vai ao ar
  em torno de 3 min de espera mais o tempo do build. Não é tempo real, e não deveria ser: a página
  é estática por opção, o que dá o TTFB da borda.
- **Não existe botão "publicar agora" no Manager.** É o próximo passo natural: uma RPC que enfileira
  um pedido ignorando `min_interval_seconds`, mais um indicador de "mudanças pendentes" na tela.
  Hoje, para publicar na hora, chame `select public.cron_dispatch_site_rebuild();` com o
  `service_role` ou dispare o hook direto.
- **Quem edita não vê o estado da publicação.** Enquanto não houver indicador na tela, a fila
  responde por SQL (acima).
- **Mudança feita durante o build entra no build seguinte.** O corte é tirado antes do POST
  justamente para não carimbar como publicado o que o Cloudflare não chegou a ler.

## Testes

`supabase/tests/site_rebuild.test.sql` (pgTAP, 15 casos): estrutura e RLS, o trigger enfileirando,
um statement de duas linhas gerando um pedido só, as quatro janelas da decisão, o desligamento por
`app_setting` e o caso sem segredo no Vault (não publica e não perde a fila).

## Referências

- [Deploy Hooks do Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/deploy-hooks/)
- ADR-007 em `CLAUDE.md`: config no banco, template e regra no código.
