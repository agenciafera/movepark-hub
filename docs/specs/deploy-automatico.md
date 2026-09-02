# Publicação automática do site

**Status:** implementado em 19/08/2026, migration `20261030140000_deploy_automatico_no_save.sql`.
**Nunca publicou nada.** O Deploy Hook não chegou a ser criado, o segredo do Vault não existe e o
mecanismo ficou 13 dias inerte sem ninguém perceber. O diagnóstico está em "O silêncio de 13 dias";
a checagem que passou a reclamar está em "O alarme"; o passo que falta está em "Ativação".

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

### O espelho de preço escreve calado

`pricing_rule`, `pricing_tier` e `location_parking_type` estão na lista porque preço muda a
página, mas quem mais escreve nelas não é gente: é o espelho do white-label (E0.13), de 3 em 3
horas, e ele regrava as três a cada passada mesmo quando o parceiro não mexeu em nada. O
`on conflict do update` sempre atualiza `mirror_verified_at`, as faixas são apagadas e
reinseridas uma a uma, e a estadia mínima é regravada por cima do mesmo valor.

Medido em 02/09/2026, em 48 horas de fila: 428 pedidos de `pricing_tier`, 94 de `pricing_rule` e
48 de `location_parking_type`, contra **duas** mudanças reais de preço no mesmo período. Com o
hook ligado isso seriam oito builds por dia sem conteúdo novo, e um mecanismo que publica sem
motivo perde a confiança tão rápido quanto um que não publica.

A saída (migration `20261111090000`): `request_site_rebuild()` respeita o GUC de transação
`movepark.skip_site_rebuild`, e `wl_mirror_apply_pricing` o abre enquanto escreve, fechando no
fim. O pedido de publicação passa a ser explícito, um por passada, e só quando a impressão
digital da regra ou a estadia mínima mudam. É a mesma pergunta que a função já respondia para
decidir se grava linha de histórico: o que entra no log de mudança de preço é o que pede
publicação. O retorno da RPC ganhou `rebuild_requested` para isso ficar visível.

Trigger de statement não enxerga linha, então a alternativa "compare a coluna no `when`" não
existe aqui; e trocar por trigger de linha não resolveria `pricing_tier`, que é apagada e
reinserida (toda linha é sempre nova).

## O silêncio de 13 dias

Descoberto em 01/09/2026, no projeto `mgaigbezdalbyuqiofcf`:

| Sinal | Leitura |
|---|---|
| `site_rebuild_request`: 3.834 pendentes, **zero** despachadas, a mais antiga de 19/08/2026 19:00 UTC | nada foi publicado desde o minuto em que o mecanismo entrou |
| cron `dispatch-site-rebuild` (jobid 21) devolvendo `succeeded` todo minuto | não era cron parado |
| `site_rebuild_decision()` respondendo `{"acao":"disparar","pendentes":3834}` | a regra de quando publicar estava certa |
| `select count(*) from vault.decrypted_secrets where name = 'cloudflare_deploy_hook_url'` = **0** | a causa |

Sem o segredo, `cron_dispatch_site_rebuild()` cai no ramo `sem_deploy_hook`, devolve um jsonb
dizendo isso e volta sem carimbar nada. Ninguém lê esse retorno. Para o pg_cron a execução foi um
sucesso, porque de fato não houve erro, e essa é a armadilha: **`succeeded` no cron significa "a
função rodou", não "o site publicou".** Durante 13 dias toda edição de conteúdo no Manager (blog,
FAQ, destino, unidade, preço espelhado) continuou dependendo de um push na `main` para ir ao ar,
que era exatamente o problema que o mecanismo existia para resolver.

O defeito não estava na lógica. Estava em não haver ninguém para reclamar do silêncio.

## O alarme

`public.site_rebuild_health(p_now)` responde a outra pergunta que não a da decisão. A decisão diz
"publico agora?", e responder "não" é o comportamento dela na maioria dos minutos. A saúde diz
"este mecanismo consegue publicar?", e responder "não" é sempre notícia.

```json
{"ok": false, "motivo": "sem_deploy_hook", "pendentes": 3834, "mais_antigo": "2026-08-19T19:00:48Z",
 "horas_esperando": 314.9, "ultimo_build": null, "tem_deploy_hook": false, "ligado": true,
 "limites": {"pendentes": 250, "horas": 6}}
```

| Motivo | Quando |
|---|---|
| `sem_deploy_hook` | o segredo não existe no Vault. Reclama **mesmo com a fila vazia**: é invariante de configuração, e foi o caso que passou despercebido |
| `desligado` | `enabled: false` no `app_setting` **e** já segurando conteúdo além do limite de horas. O desligamento de emergência é legítimo; virar estado permanente não é |
| `fila_parada` | a mudança mais antiga espera há mais que `alert_max_age_hours` (6 h) |
| `fila_grande` | mais que `alert_max_pending` (250) pedidos sem publicar, antes mesmo de bater o relógio |

Os dois limites moram no mesmo `app_setting.site_rebuild_policy`, então apertar ou afrouxar o
alarme não exige deploy. A função é `security definer` porque precisa olhar o Vault, e devolve só
`tem_deploy_hook: true|false`: a URL nunca sai dali (tem teste para isso).

**Quem pergunta é o GitHub Actions**, uma vez por dia, em
[`.github/workflows/site-rebuild-health.yml`](../../.github/workflows/site-rebuild-health.yml):
consulta pela Management API do Supabase (com o `SUPABASE_ACCESS_TOKEN` que o `security-scan` já
usa, sem segredo novo), abre ou atualiza uma issue rotulada `site-rebuild` quando `ok: false` e
fecha a issue sozinha quando a publicação volta.

Não existe cron novo no Postgres para isso, e é decisão, não esquecimento: um cron cuja única
consequência é escrever aviso no log do Postgres repetiria o defeito original, porque log que
ninguém lê é a mesma coisa que silêncio. Issue notifica gente.

## Ativação (o passo que depende de gente)

Enquanto o segredo não existir, a fila enche e nada é publicado: o cron responde
`sem_deploy_hook` e não carimba nada. No dia em que o segredo entrar, o minuto seguinte publica
tudo o que se acumulou. Nada se perde.

1. No Cloudflare, em **Workers & Pages › movepark-hub › Settings › Builds › Deploy Hooks**, crie um
   hook na branch `main`. Ele é uma URL secreta: quem tiver a URL dispara build.
2. No Supabase, em **Integrations › Vault**, crie o segredo com o nome exato
   **`cloudflare_deploy_hook_url`** e a URL como valor.

Não coloque a URL no repo, no `wrangler.jsonc` nem em variável do front.

**O passo 1 é de dashboard mesmo, e isso foi verificado.** O token OAuth do wrangler daquela conta
não alcança `builds/*`: `GET /accounts/{id}/builds/repos`, `/builds/deploy_hooks` e
`/builds/workers/movepark-hub/builds` respondem `10000 Authentication error`, e não existe rota de
deploy hook fora de `builds/*` (o que responde em `/workers/services/movepark-hub/...` é o endpoint
do serviço, que ignora o sufixo e devolve o mesmo JSON para qualquer caminho inventado). Para
automatizar isso um dia seria preciso um API token com permissão de Workers Builds, criado no
painel. Enquanto não houver, criar o hook é clique humano.

## Observar

```sql
-- isto está de pé? (a pergunta que o alarme faz todo dia)
select public.site_rebuild_health();

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

`supabase/tests/pricing_mirror.test.sql` cobre o lado do espelho (seis casos): a porta aberta e
fechada, passada sem mudança que não deixa pedido na fila, e mudança real que pede um build só.

`supabase/tests/site_rebuild.test.sql` (pgTAP, 22 casos): estrutura e RLS, o trigger enfileirando,
um statement de duas linhas gerando um pedido só, as quatro janelas da decisão, o desligamento por
`app_setting` e o caso sem segredo no Vault (não publica e não perde a fila). Os sete últimos são a
saúde: alarme aceso sem hook mesmo com a fila vazia, `fila_parada`, `fila_grande`, limite vindo do
`app_setting` e a garantia de que a URL do hook não aparece no retorno da função.

## Referências

- [Deploy Hooks do Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/deploy-hooks/)
- ADR-007 em `CLAUDE.md`: config no banco, template e regra no código.
