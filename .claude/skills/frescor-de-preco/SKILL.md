---
name: frescor-de-preco
description: >
  Método para "parceiro mudou a tabela de preço" no Movepark Hub: descobrir por onde o preço
  entra (espelho do white-label ou edição nativa), confirmar que o Hub já tem a tabela nova,
  varrer FAQ, blog e traduções pelos valores velhos e seus múltiplos, reescrever com cifra que
  sai só do simulate_price, gravar por migration com trava de md5, trocar o bloco "em números",
  conferir o carimbo e registrar a rodada na spec. Use SEMPRE que um parceiro virar tabela, a
  Movepark propor e o parceiro aceitar preço novo, o espelho acusar `change`, ou o usuário disser
  "a Aeropark virou tabela", "atualiza o preço do Garageinn no site", "o preço no post está
  velho", "rodada de frescor", "revisa os valores de Viracopos", "o parceiro mudou o preço".
  Também use na rotina mensal (docs/specs/rotina-mensal-frescor.md) e antes de editar qualquer
  texto publicado que cite R$ de parceiro. NÃO decide preço (isso é propor-preco-movepark) e NÃO
  mexe no motor de preço (pricing-engine.md).
user-invocable: true
---

# Frescor de preço: o parceiro mudou a tabela

## Por que esta skill existe

Em 12/11/2026 a Aeropark (GRU) virou tabela e o pedido foi "skills para atualizar isso". Não
existia nenhuma: o procedimento morava em prosa no fim de `docs/specs/rotina-mensal-frescor.md`
e em `espelhamento-preco-wl.md`, e cada rodada redescobria as mesmas armadilhas. Quatro rodadas
já foram feitas (17/09, 19/10, 03/11 e 12/11/2026), e o custo de errar é conhecido: em 17/09 uma
tarifa inventada ("Premium cerca de R$ 120/dia") sobreviveu a duas consolidações, e em 19/10 uma
dúzia de frases dependia de um empate entre Aeropark e Aerovalet que já não existia.

O princípio que rege tudo: **o Hub exibe, nunca decide.** Em unidade espelhada, quem define preço
é o parceiro no white-label; o Hub copia. E **cifra sem data e sem fonte é invenção com cara de
dado.** Toda cifra publicada carrega a data da tabela que a gerou, e a data é a da mudança real,
não a de quando o texto foi editado.

## Regra número um: a única fonte de cifra é o `simulate_price`

Nenhum R$ entra num texto vindo de cálculo de cabeça, de planilha do parceiro, de print do WL ou
do texto antigo. Todo valor novo sai de `public.simulate_price(p_company, p_location,
p_parking_type, p_days)` lido **no dia da rodada**, para 1 a 31 diárias, em **todas as vagas da
praça** (não só da que mudou, porque as comparações entre parceiros também mudam). Diferença,
percentual e degrau são calculados sobre essa saída e conferidos de volta.

**Nunca gere o esperado a partir de um snapshot.** Se a "ficha de preço" sair de um dump antigo,
de um JSON salvo ou da própria página no ar, você crava o erro como verdade. A ficha é lida ao
vivo, e o verificador compara o texto revisado contra ela, não contra o texto anterior.

## Como ler o banco durante a rodada

- **Leitura rápida por PostgREST com a anon key** (`curl` em `/rest/v1/<tabela>` com `apikey`
  e `Authorization: Bearer <anon>`) funciona para `faq`, `faq_i18n`, `blog_post`,
  `blog_post_i18n`, `location`, `location_parking_type`, `pricing_rule`, `pricing_tier`,
  `destination` e para as RPCs `simulate_price` e `destination_price_freshness`.
- **`company` e `pricing_mirror_run` não são legíveis por anon.** `company` só expõe colunas
  escolhidas, e `pricing_mirror_run` tem policy só para `hub_admin` autenticado. Para o
  `before`/`after` do espelho e para `wl_domain`/`take_rate` use o `execute_sql` do MCP do
  Supabase (projeto `mgaigbezdalbyuqiofcf`, só leitura) ou um JWT de `developer@fera.ag`.
- Memória do projeto: migration e Edge vão pela CLI (`supabase db push`, `supabase functions
  deploy`); o MCP é plano B e é o caminho da leitura administrativa.

## Passo 1: a unidade é espelhada (WL) ou nativa?

Decida isso antes de qualquer coisa, porque muda onde o preço entra e o que você pode tocar.

```sql
select c.slug as company, l.slug as location, l.checkout_mode,
       c.wl_domain is not null as tem_wl,
       lpt.id as lpt_id, lpt.wl_category_slug, lpt.wl_product_slug,
       pr.mirror_source, pr.mirror_status, pr.mirror_error,
       pr.mirror_sampled_at, pr.mirror_verified_at, pr.updated_at
from location l
join company c on c.id = l.company_id
join location_parking_type lpt on lpt.location_id = l.id and lpt.is_active
left join pricing_rule pr on pr.location_parking_type_id = lpt.id
where c.slug = '<slug-da-empresa>' and l.deleted_at is null;
```

| Sinal | Espelhada (WL) | Nativa |
| --- | --- | --- |
| `company.wl_domain` + `lpt.wl_category_slug`/`wl_product_slug` | preenchidos | vazios |
| `pricing_rule.mirror_source` | preenchido, com `mirror_sampled_at` | nulo |
| Por onde o preço entra | o parceiro muda no **white-label**; a Edge `wl-price-mirror` copia | editor de preço do `/operator` ou do Manager (`operator_set_pricing`), ou agendamento (`pricing_schedule_create`, troca às 0h do fuso da unidade pela data da **compra**) |
| Data da tabela | `mirror_sampled_at` (só muda quando o fingerprint muda) | `updated_at` da regra |
| O que você NÃO faz | editar `pricing_rule`/`pricing_tier` à mão (o espelho sobrescreve em até 20 minutos) nem agendar (a RPC recusa, D6 de `agendamento-de-preco.md`) | mexer no motor; agendamento não cancela por edição manual (D7) |

Desde 23/09/2026 o espelho também cobre unidades `hub` de empresa com site WL, então
`checkout_mode = 'hub'` não prova que a unidade é nativa: olhe o `mirror_source`.

Na nativa, se a tabela nova tem data futura ("vale a partir de 01/12"), o caminho é o agendamento,
e a rodada de texto espera a aplicação (`pricing_schedule.status = 'applied'`). Texto que
antecipa preço que ainda não vale é promessa que o checkout não cumpre (ADR-009).

## Passo 2: o Hub já tem a tabela nova?

Nada de texto antes de o motor devolver o preço novo. Três leituras, nesta ordem:

1. **Por praça:** `select * from public.destination_price_freshness('<slug-do-destino>')`.
   `price_updated_at` é a data da mudança real (vem de `mirror_sampled_at` na espelhada e de
   `updated_at` na nativa); `price_verified_at` é só a última conferência do robô. Para a rotina
   mensal, `select d.short_name, f.* from destination d cross join lateral
   public.destination_price_freshness(d.slug) f` lista quem virou desde a última rodada.
2. **Por vaga:** `pricing_rule.mirror_sampled_at`, `mirror_status` e `mirror_error`. Status
   `error` significa que o preço gravado é o da **última passada boa**, e a tabela nova ainda não
   chegou. `divergent` significa que o motor do Hub não reproduz o parceiro: pare e leia
   `pricing_mirror_run.detail` antes de escrever qualquer cifra.
3. **O que exatamente mudou:** `pricing_mirror_run` com `kind = 'change'` desde a última rodada,
   por `location_parking_type_id`. O `before` e o `after` são o fingerprint da regra (faixas,
   `unit_price`/`total_price`, balcão) e dizem **quais valores sumiram**: é essa a lista que o
   Passo 3 vai procurar.

```sql
select r.created_at, l.slug, cpt.slug as vaga, r.before, r.after, r.anomalies
from pricing_mirror_run r
join location_parking_type lpt on lpt.id = r.location_parking_type_id
join location l on l.id = lpt.location_id
join company_parking_type cpt on cpt.id = lpt.company_parking_type_id
where r.kind = 'change' and r.created_at > '<data da última rodada>'
order by r.created_at;
```

**Como forçar o espelho** quando o parceiro avisou e você não quer esperar: o cron roda de 20 em
20 minutos e pega **uma vaga por passada, a mais velha pelo `mirror_verified_at`**, então uma
praça com oito vagas pode levar quase três horas para girar inteira. O atalho é o botão
"Sincronizar agora" em `/manager/white-label` (ou na tela de tipos de vaga da unidade), que chama
a RPC `wl_mirror_trigger(p_location_parking_type_id)`, só para `hub_admin`. É assíncrona
(`net.http_post` devolve só o `request_id`), leva uns 40 segundos por vaga, e a tela reconsulta
sozinha. Dispare uma vaga por vez e confira `mirror_sampled_at` depois.

Depois do espelho, **cote no site do parceiro 1, 7, 15 e 30 diárias e compare com o
`simulate_price`** antes de escrever. A âncora da amostragem é um dia fixo 30 dias à frente, ao
meio-dia: preço sazonal fora dessa data o espelho não vê, e a verificação diferencial é quem
denuncia depois. Se não bater, o problema é do espelho, não do texto; abra isso antes.

Duas armadilhas desta etapa:

- **`updated_at` não é a data da tabela na espelhada.** O trigger `set_updated_at` empurra
  `updated_at` a cada passada, mesmo sem mudança. Só `mirror_sampled_at` vale como "mudou".
- **O toggle "Integração White-label" (`wl_sync_enabled`) não pausa o espelho de preço.** Ele
  só pausa disponibilidade. Empresa com o toggle desligado continua tendo o preço copiado.

## Passo 3: varrer tudo que está publicado

### Onde procurar

Todo campo que sai em página pré-renderizada, nos três idiomas:

| Tabela | Campos |
| --- | --- |
| `faq` | `answer`, `body_md` |
| `faq_i18n` (en, es) | `answer`, `body_md` |
| `blog_post` | `body_md`, `excerpt`, `meta_description`, `meta_title`, `ai_summary` |
| `blog_post_i18n` (en, es) | `body_md`, `excerpt`, `meta_description`, `meta_title` |

Filtre por `is_published` e `deleted_at is null`, mas leia o acervo **inteiro da praça e dos
posts que comparam praças**: o post de preço de Curitiba citava a semana de Guarulhos, e o de
convênio cita cinco aeroportos. Filtrar só pelo `destination_id` do parceiro deixa esses para trás.

### O que procurar

Monte a lista de valores vencidos a partir do `before` do espelho (ou da tabela antiga nativa):

- cada diária antiga (`unit_price`) e cada total fechado (`total_price`) de cada faixa;
- **todo múltiplo de 1 a 31 diárias** respeitando a faixa (R$ 56,90 × n para n de 2 a 31 deu
  R$ 398,30 na semana e R$ 1.707,00 no mês), mais os totais por faixa fechada;
- o balcão antigo e os múltiplos dele;
- **toda diferença e percentual** entre esses totais e os do outro parceiro ou do oficial na
  mesma duração ("R$ 189,00 acima do Virapark na semana", "5,2% contra o balcão");
- as datas da tabela velha por extenso e em `dd/mm/aaaa` ("tabela de 20/10/2026", "conferidos
  em 11/09/2026").

A busca é por regex sobre o formato brasileiro (`R$ 1.707,00`), que é o mesmo nos textos em en
e es. Uma varredura de 03/11 achou 1.900 ocorrências em 71 documentos; a de 12/11, 35 campos.
Espere volume e automatize a listagem campo a campo, nunca leia só os posts que "devem" citar.

### Falsos positivos que a varredura sempre traz

Todo resíduo é conferido um a um e anotado na spec. Os conhecidos:

- **Tarifa do oficial ou de terceiro igual a um valor antigo do parceiro.** Bandeira Park e
  MultiPark em GRU coincidiam com a tabela velha; R$ 120,00 é o balcão do Virapark e a semana da
  BePark. Essas ficam, com a data delas.
- **Condição de convênio** (R$ 270,00 da Azul no Garageinn) que não acompanha a tabela.
- **Número novo de uma praça igual a número antigo de outra.**
- **Diferença calculada que coincide com um total antigo.**
- **`ilike '%aeropark%'` casa com `aeroparking`**, que é lote de terceiro em VCP e slug de post
  (`viracopos-aeroparking`), e o guia GRU Airport escreve "AeroParking". Filtre por slug exato da
  empresa, por `destination_id` ou por regex com fronteira de palavra; nunca por substring.

### O que mudou de sentido, não só de número

Trocar cifra e deixar a frase é o erro mais caro. Para cada afirmação comparativa, pergunte à
ficha se ela ainda é verdade: "empata de sete diárias em diante", "o mais barato da região",
"na véspera do degrau um dia a mais sai mais barato", "até o valet do parceiro ganha do oficial",
ranking do top 5, "quem escolhe pela distância paga quase duas vezes". Em 19/10 e 03/11 todas
essas se inverteram ao menos uma vez. O que o parceiro entrega de fato (vaga coberta, 24 horas,
distância, van) é fato da unidade e continua dito; o que é promessa de preço só fica se a ficha
sustentar (ADR-009).

Regras de data: a cifra do parceiro leva a data da tabela dele ("na tabela de 12/11/2026"); a
tarifa do oficial e a de terceiro **ficam com a data delas**; comparação entre datas diferentes
escreve as duas; "conferido na mesma data" vira a data por extenso. Dois parceiros com datas
diferentes na mesma frase nunca viram "na mesma tabela".

Erro antigo que a reescrita expõe (diária "a partir da sétima" quando o motor cai na segunda,
balcão vendido como online, `meta_description` com preço do concorrente) é corrigido na mesma
passada e listado na spec como "corrigido de passagem".

### O verificador

Antes de gerar a migration, rode uma conferência automática: **todo R$ do texto revisado tem que
ser** preço, valor por dia ou balcão do `simulate_price`; tarifa do oficial ou de terceiro já
publicada com data; ou diferença entre dois deles. E **nenhum valor da lista de vencidos pode
sobrar** em nenhum idioma, salvo os resíduos justificados. Texto que falha no verificador não é
gravado.

Toda frase nova passa pela regra de escrita do projeto: sem travessão, voz Movepark, e a skill
`revisar-texto` para o que for lido pelo cliente.

## Passo 4: gravar por migration, campo inteiro, com trava de md5

O modelo é `supabase/migrations/20261203120000_frescor_garageinn_flat_novembro.sql`. Copie a
forma, não só a ideia:

```sql
do $frescor$
declare
  n int;
  total int := 0;
begin
  -- Guarda de replay: no db reset do CI não há acervo, e a migration vira no-op.
  if not exists (select 1 from public.faq where id = '<id de um campo da rodada>') then
    raise notice 'frescor <parceiro>: banco sem o acervo de <data>, nada a revisar';
    return;
  end if;

  -- faq · <slug> · pt · answer
  update public.faq set answer = $f1$<texto revisado inteiro>$f1$
   where id = '<id>' and md5(answer) = '<md5 do texto lido na rodada>';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor <parceiro>: % · % · % mudou desde a leitura de <data>', 'faq', '<slug>', 'pt answer'; end if;
  total := total + 1;

  -- ... um bloco por campo; i18n filtra por (faq_id|blog_post_id, locale) ...

  if total <> <N> then raise exception 'frescor <parceiro>: % de <N> campos gravados', total; end if;
end
$frescor$;
```

Por que assim:

- **Campo inteiro, não `replace()`.** A rodada de 19/10 usou `replace()` por parágrafo e exigiu
  um gerador que provasse a reprodução byte a byte e a idempotência. Trocar o campo inteiro
  dispensa isso: o texto da migration **é** o texto final.
- **Trava de `md5` do texto lido.** Se alguém editou o documento no Manager entre a leitura e a
  aplicação, a migration aborta inteira e nada é sobrescrito. Calcule o md5 sobre os bytes exatos
  que o banco devolveu (`select md5(answer)`), não sobre o JSON do PostgREST, que escapa aspas e
  quebras de linha.
- **Contador final.** Um `update` que casou zero linhas já aborta, mas o total protege contra
  bloco esquecido ao gerar o arquivo.
- **Guarda de replay** para o `supabase db reset` do CI, que não tem o acervo.
- Cabeçalho em comentário com o que mudou, a data do WL, a hora do espelho e a referência da spec.
- Delimitador `$fN$` único por campo: texto com `$$` ou com `$f1$` dentro quebraria.
- **Carimbo com `HHMMSS` real.** Confira duplicata com
  `ls supabase/migrations/ | sed 's/_.*//' | sort | uniq -d` antes de criar o arquivo.

Não há mudança de schema, então `gen:types` não entra. O trigger de rebuild dispara sozinho em
`faq`, `faq_i18n`, `blog_post` e `blog_post_i18n` (as duas `_i18n` ganharam o trigger em
`20261201160000`).

### Aplicar: inline quando couber, `pg_net` quando não

As migrations de frescor pesam de 348 KB a 1,7 MB, e isso não cabe no `apply_migration` do MCP
nem num `execute_sql` colado. O caminho usado em 19/10, 03/11 e 12/11:

1. Commite e dê push do arquivo na `main`. Anote o SHA do commit.
2. O repo é público, então o banco lê o arquivo direto do commit fixo:
   `select net.http_get('https://raw.githubusercontent.com/agenciafera/movepark-hub/<sha>/supabase/migrations/<arquivo>.sql')`,
   e o corpo chega em `net._http_response` pelo `id` devolvido (a resposta é assíncrona; aguarde
   alguns segundos antes de ler).
3. **Trava de md5 do arquivo:** compare `md5(content)` da resposta com `md5 -q <arquivo>` local.
   Só então faça `execute` do conteúdo (num bloco `do` que lê a resposta e executa o texto). Se
   não bater, não executa.
4. Feche o par no ledger: na mesma transação, `insert into supabase_migrations.schema_migrations
   (version, name, statements) values ('<carimbo>', '<nome>', array['<...>'])`, para o
   `migration list` não acusar órfã. Confira antes que a versão não existe lá.

Quando o arquivo for pequeno, `supabase db push` (linkado, sem `--project-ref`) faz tudo isso.

### Conferir depois de aplicar

Leia de volta **todos** os campos pela API e compare com o texto revisado: `md5` de cada um tem
que ser o do texto novo. Em 03/11 foram 255 campos idênticos byte a byte; em 12/11, 35. Sem essa
leitura, "aplicou" é suposição.

## Passo 5: o bloco "em números" sai do script, nunca da mão

Nos posts donas de praça existe o bloco `## Os pátios do <aeroporto> em números`. Ele é
substituído pela saída de:

```bash
bun run lint:bloco-fato -- --print <PRAÇA>
```

colada **sem edição** (`GRU`, `CGH`, `VCP`, `CWB`, `CNF`...). Depois de gravar, `bun run
lint:bloco-fato` sem argumento confere o que está no ar: distância, traslado e estadia mínima
barram; preço só avisa, porque é retrato datado. Precisa de `VITE_SUPABASE_*` no `.env.local`.

## Passo 6: carimbo e publicação

1. `select public.site_rebuild_health();` logo depois de aplicar. Cada `update` enfileira um
   pedido; com muitos campos ela acusa `fila_grande` até o pg_cron despachar, e aí coalesce num
   build só (em 03/11 levou quatro minutos; o build do Workers sai uns dois minutos depois). Se
   ficar fora de `ok` por mais que isso, leia `deploy-automatico.md`: sem o segredo
   `cloudflare_deploy_hook_url` no Vault a fila só cresce.
2. No build seguinte, abra **um post com preço** e confira a linha
   `Preços conferidos no motor de reservas em <data da tabela>`: a data tem que ser a de
   `price_updated_at`, não a de hoje. Abra **um post sem preço** e confira que a linha não
   aparece. O `dateModified` do `BlogPosting` é a maior entre a edição do texto e a tabela.
3. Lembre do SSG: o banco atualizado muda a navegação client-side na hora, mas o HTML
   pré-renderizado (o que o Google e as IAs leem) só muda depois do build. Não declare "no ar"
   antes de ver o HTML servido.

## Passo 7: registrar a rodada na spec

Em `docs/specs/rotina-mensal-frescor.md`, uma seção `## Rodada extra de <dd/mm/aaaa>: <parceiro>`
(ou a seção da rodada mensal), com:

- o que mudou, "de → para", data em que o WL virou, hora em que o espelho copiou, hora do build,
  link do card do ClickUp;
- a contagem de campos por tabela e idioma e o nome da migration;
- os valores procurados e os resíduos que ficaram, com a justificativa de cada falso positivo;
- **o que mudou de sentido**, frase por frase que virou;
- erros antigos corrigidos de passagem;
- o que ficou aberto (fato de ficha divergente, tarifa de oficial a reler, praça adiada).

Se o procedimento mudou (passo novo, armadilha nova), atualize a seção "O procedimento, para a
próxima rodada" e esta skill no mesmo commit. Mensagem de commit no padrão
`content(<praça>): FAQs e posts de <praça> na tabela <x> do <parceiro>`.

## Armadilhas, reunidas

- **Leitura por anon não alcança `company` nem `pricing_mirror_run`.** Use o MCP ou JWT de admin.
- **`aeropark` casa com `aeroparking`** em `ilike`. Slug exato ou fronteira de palavra.
- **Tarifa do oficial igual a valor antigo do parceiro** é falso positivo, e fica com a data dela.
- **Nunca gere o esperado a partir de snapshot.** Ficha ao vivo, verificador contra a ficha.
- **`updated_at` não é data de tabela espelhada**; `mirror_sampled_at` é.
- **O espelho pega uma vaga por passada**, de 20 em 20 minutos; force pelo `wl_mirror_trigger`
  por vaga se o texto não pode esperar.
- **Âncora de 30 dias à frente:** sazonalidade fora da âncora não é vista pelo espelho.
- **`wl_sync_enabled` não pausa o espelho de preço.**
- **Unidade espelhada não agenda e não se edita à mão**; o espelho desfaz em minutos.
- **Posts de outra praça citam esta praça** (comparações e convênio). Varra o acervo inteiro.
- **md5 sobre bytes do banco**, não sobre o JSON da API.
- **Carimbo de migration com `HHMMSS` real**, ou o `db reset` do CI para na PK duplicada.
- **Migration grande não cabe inline**; `pg_net` do commit fixo, com md5 do arquivo, e o par
  fechado no ledger.
- **SSG congela o loader:** só o build publica o HTML.
- **Sem travessão** em nenhum texto gravado.

## Checklist antes de dizer "feito"

1. Espelhada ou nativa decidido, com a query do Passo 1 anotada.
2. `destination_price_freshness` e `mirror_sampled_at` mostram a data nova; `simulate_price`
   bate com o site do parceiro em 1, 7, 15 e 30 diárias.
3. Lista de valores vencidos montada do `before`/`after`; varredura nos três idiomas e em todos os
   campos; resíduos justificados um a um.
4. Verificador verde: todo R$ novo tem origem na ficha, nenhum vencido sobrou.
5. Migration no padrão (campo inteiro, md5, contador, guarda de replay), aplicada, par no ledger,
   e **leitura de volta idêntica byte a byte**.
6. Bloco "em números" é a saída do `lint:bloco-fato --print`, e o lint passa.
7. `site_rebuild_health()` em `ok`, carimbo conferido no HTML servido.
8. Spec atualizada, commit e push na `main`, `bun run test` verde.
