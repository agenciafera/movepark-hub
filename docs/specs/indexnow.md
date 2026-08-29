# IndexNow: o site avisa o índice da Microsoft

> **Status:** código entregue em 29/08/2026, **inativo até dois passos operacionais** (§6).
> Migration `20261101130000_indexnow.sql`, Edge `indexnow`, chave pública em
> `public/ba2adbded014cba0e8df2ea4f3b21f43.txt`.
>
> **Origem:** desdobramento da atividade [86ak6h55g](https://app.clickup.com/t/86ak6h55g)
> ("Registrar movepark.co no Bing Webmaster Tools"). **Não substitui aquela atividade**, que
> continua pendente: ver [bing-webmaster.md](./bing-webmaster.md).
>
> Conecta com [deploy-automatico.md](./deploy-automatico.md) (o molde de fila mais cron),
> [knowledge-base.md](./knowledge-base.md) (o molde de cron mais Edge com chave no Vault) e
> [seo-indexacao.md](./seo-indexacao.md) (política de host e de índice).

## Por que existe

A busca do ChatGPT se apoia no índice da Microsoft. Hoje o `movepark.co` depende do bingbot passar
por conta própria, no ritmo dele, e ninguém no time sabe quando isso acontece.

O IndexNow inverte a direção: o site avisa o buscador. A posse do domínio é provada por um arquivo
público, então **não existe conta, painel nem login em lugar nenhum**. Foi por isso que ele entrou
como frente separada: o Bing Webmaster Tools precisa de gente, isto não precisa.

Um post reescrito na Fase 1 do plano de conteúdo hoje espera o rastreamento natural. Com isto, ele
é anunciado no minuto em que sai do Manager.

## O desenho

```
save no Manager
  └─ trigger de LINHA em blog_post / destination
       └─ indexnow_request (fila, guarda CAMINHO)
              │
   pg_cron, 10 em 10 min  ──►  Edge `indexnow`
                                   │ monta a URL absoluta com sitePath()
                                   ▼
                           api.indexnow.org/indexnow
```

Três escolhas que valem registrar.

**A fila guarda caminho, nunca URL absoluta.** O host canônico não mora no banco, e isso é regra do
`CLAUDE.md`: ele vive em `src/lib/site-host.mjs` e em `supabase/functions/_shared/site.ts`, com um
teste de contrato que reprova host repetido à mão. Escrever `https://movepark.co` dentro de uma
função SQL abriria o terceiro lugar, justamente o que a regra existe para impedir.

**Por isso o POST mora na Edge, e não no `pg_net` do cron.** O deploy automático faz o POST direto
do Postgres porque lá a URL é o Deploy Hook, opaca e guardada no Vault. Aqui a URL é do próprio
site, e montá-la exige o `sitePath()` do `_shared`, que só o Deno enxerga.

**O trigger é de linha, ao contrário do trigger do rebuild.** Ali o build é do site inteiro e saber
qual linha mudou não muda nada. Aqui a submissão é por URL, então a linha é exatamente a informação
que interessa.

## O que entra na fila

| Tabela | Caminho | Forma |
|---|---|---|
| `blog_post` | `/blog/<slug>/` | **com** barra final |
| `destination` | `/destinos/<slug>` | **sem** barra final |

As duas formas divergem de propósito, e a spec do blog explica: as URLs do blog são herdadas do
WordPress e valem tráfego, as do Hub nasceram sem barra. Submeter a forma errada faz o buscador
rastrear um redirect em vez da página, então a diferença está travada em pgTAP.

**Despublicar e apagar também entram na fila.** O protocolo serve tanto para "olha a página nova"
quanto para "essa URL mudou de resposta", e avisar é o que tira conteúdo velho do índice mais
rápido. Os 26 posts consolidados que hoje respondem 301 são o caso de uso.

**Regra para crescer a lista:** entra tabela cuja mudança altera **uma URL identificável**. Ficaram
de fora as tabelas de unidade (`location`, `location_amenity`, preço), porque a mudança de uma
delas afeta várias páginas ao mesmo tempo e derivar esse conjunto em SQL erraria. Submeter URL que
responde 404 conta contra a reputação do host no protocolo, então errar aqui custa mais do que
deixar de avisar.

## Dedupe e reentrega

A fila tem índice unique parcial em `path` entre pedidos pendentes, então vinte saves seguidos do
mesmo post viram um pedido só. Depois do despacho, um save novo abre pedido novo.

O `indexnow_claim` carimba `dispatch_id` e `dispatched_at`; o `indexnow_settle` fecha o lote com o
código de resposta. Resposta fora de 2xx devolve os pedidos para a fila, e o teto de três tentativas
impede que um caminho ruim rode para sempre. Um lote carimbado há mais de 15 minutos e ainda sem
`status_code` é retomado, que é o caso da Edge morrer no meio.

## As duas chaves, que têm nomes parecidos e propósitos opostos

| Chave | Onde | É segredo? |
|---|---|---|
| **Chave do protocolo** (`INDEXNOW_KEY`) | `supabase/functions/_shared/indexnow.ts` e o nome do arquivo em `public/` | **Não.** Ela tem que ser pública: é lendo `movepark.co/<chave>.txt` que o buscador confirma a posse |
| **Chave de despacho** (`indexnow_dispatch_key`) | Vault | **Sim.** Impede que qualquer um chame a Edge e submeta em nome do site |

Confundir as duas é o erro fácil aqui. Guardar a do protocolo no Vault quebraria a verificação de
posse; deixar a de despacho no repo abriria a Edge.

A do protocolo aparece em dois lugares que nenhum compilador liga, uma constante e um nome de
arquivo. `src/lib/indexnow.contract.test.ts` solda os dois: se divergirem, toda submissão passaria a
voltar 403 e a fila encheria em silêncio, sem quebrar build nem teste de unidade.

## Ativação (os passos que dependem de gente)

Enquanto faltar qualquer um, a fila enche e nada é submetido. Nada se perde: no dia em que os dois
entrarem, o ciclo seguinte manda tudo o que se acumulou.

1. **Publicar o site com o arquivo de chave.** O `public/<chave>.txt` só existe em produção depois
   de um build da `main`. Submeter antes disso devolve 403, porque o buscador não consegue provar a
   posse. **Esta é a ordem, e ela não é opcional.**
2. **Criar o segredo no Vault**, em Supabase › Integrations › Vault, com o nome exato
   `indexnow_dispatch_key`:
   ```sql
   select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'), 'indexnow_dispatch_key');
   ```

## Observar

```sql
-- o que está pendente e desde quando
select source_table, count(*), min(requested_at)
  from public.indexnow_request where dispatched_at is null group by 1;

-- os últimos lotes, com a resposta do IndexNow
select dispatch_id, min(dispatched_at) as em, count(*) as urls, status_code
  from public.indexnow_request where dispatch_id is not null
 group by dispatch_id, status_code order by em desc limit 10;
```

Códigos do protocolo: **200** aceito, **202** aceito com a chave ainda em validação, **400** corpo
inválido, **403** chave não confere com o arquivo público, **422** URL fora do host, **429** rápido
demais.

Pedido concluído é podado depois de 30 dias (`cron_prune_indexnow_request`, 04:47 diário).

## Limites conhecidos

- **Submeter não é indexar.** O protocolo garante que o buscador foi avisado, não que ele vai
  rastrear, nem que vai indexar. Página fraca continua fora.
- **Só duas tabelas alimentam a fila.** Mudança de preço ou de comodidade de uma unidade não avisa
  ninguém, pelo motivo da seção "Regra para crescer a lista".
- **Não há tela.** A fila responde por SQL, no mesmo estado em que o deploy automático nasceu.
- **O Google não participa.** Ele recusou o IndexNow publicamente e continua dependendo do
  Search Console e do rastreamento normal.

## Testes

- `supabase/tests/indexnow.test.sql` (pgTAP, 18 casos): estrutura e RLS, a constraint que recusa URL
  absoluta, a barra final do blog, o dedupe entre pendentes, o claim que não repete, o settle de
  sucesso e o de erro que devolve à fila, e o `anon` sem grant.
- `supabase/functions/indexnow/index.test.ts` (deno, 4 casos): o host sem esquema, a montagem das
  URLs preservando a barra final, o descarte de repetido e de caminho inválido, e o formato da
  chave.
- `src/lib/indexnow.contract.test.ts` (vitest, 4 casos): a chave do Deno contra o arquivo em
  `public/`, sem chave órfã de troca antiga.

## Referências

- [Protocolo IndexNow](https://www.indexnow.org/documentation)
- [IndexNow no Bing Webmaster Tools](https://www.bing.com/indexnow)
