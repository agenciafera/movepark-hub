# SEO e GEO dos white-labels

> **Status:** diagnóstico feito em 12/11/2026; execução no app de white-label (fora deste repo).
> **Atividade-mãe:** [Conteúdo 105](https://app.clickup.com/t/17tn9ea0h8k) no ClickUp (lista
> Backlog do Movepark HUB), com as subtarefas Conteúdo 106 a 114. Responsáveis: Pedro e Kallef.
> **Relacionadas:** [`seo-indexacao.md`](./seo-indexacao.md) (seção dos white-labels, decisão de
> 18/09/2026), [`reservas-wl-no-hub.md`](./reservas-wl-no-hub.md) (§ 5, o Hub servir o site com a
> marca do parceiro), [`checkout-externo-por-local.md`](./checkout-externo-por-local.md), ADR-002,
> ADR-009.

## 1. Resposta curta

Os white-labels (`<parceiro>.movepark.co`) já aparecem no Google, mas o HTML que o Google recebe
está quase vazio: a home do aeropark tem dez caracteres de texto ("Aeropark"), a página de vaga
tem título ` | Reserva` e o resto do texto é a lista de horários. Não há description, canonical,
JSON-LD, `robots.txt` nem `sitemap.xml`, e telas de login e checkout estão indexadas. O ganho está
em fazer o servidor entregar a página pronta, com os dados vindos do Hub, e em limpar o índice.

A decisão de 18/09/2026 continua valendo: **as páginas que vendem ficam indexadas** e não recebem
canonical para o Hub, porque o parceiro com `checkout_mode = external` fecha a reserva no WL.

## 2. O que foi medido

### 2.1 Tráfego (Search Console, 16 meses até 29/08/2026)

Fonte: [`dados/gsc-baseline-2026-08-29/`](./dados/gsc-baseline-2026-08-29/RESUMO.md).

| Host | Cliques | Impressões | CTR |
|---|---:|---:|---:|
| virapark | 874 | 318.407 | 0,27% |
| garageinn | 366 | 104.264 | 0,35% |
| aeropark | 177 | 45.935 | 0,39% |
| abbapark | 97 | 16.274 | 0,60% |
| aerovalet, plenty, airpark, skypark, nationpark | 98 | 15.746 | |

Somando: cerca de 500 mil impressões e 1.600 cliques. Por tipo de página: home 1.023 cliques em
202.782 impressões; vaga 517 em 267.955; login, conta e checkout 72 em 29.863.

A taxa de clique é baixa para busca de marca. Na consulta "virapark", a home do WL fica na posição
4,5 com 0,4% de CTR, e **cinco URLs nossas dividem a mesma consulta**: home do WL (80 mil
impressões), vaga avulsa do WL (57 mil, posição 10,8, 1 clique), login do WL (20 mil), ficha no
movepark.co (20 mil) e post do blog.

### 2.2 O HTML entregue (medido em 12/11/2026, user-agent do Googlebot)

| Página | Título | Texto fora de script | h1 | JSON-LD |
|---|---|---|---|---|
| `aeropark.movepark.co/` | `Aeropark` | 10 caracteres | nenhum | nenhum |
| `aeropark.movepark.co/aeroporto-guarulhos/vaga-coberta` | ` \| Reserva` | 678 caracteres, quase tudo a lista 00:00 a 23:30 | "Selecione o período da reserva" | nenhum |
| `virapark.movepark.co/` | `Virapark` | 10 caracteres | nenhum | nenhum |
| `aeropark.movepark.co/login` | ` \| Login` | tela de login | "Faça seu login ou cadastre-se no Movepark" | nenhum |

Em todos os hosts:

- Sem `meta description`, sem `link rel=canonical`, sem `hreflang`.
- `og:title` é só o nome da empresa (no login, `Staging`) e `og:image` é o ícone SVG da Movepark.
- `robots.txt` e `sitemap.xml` respondem **404**.
- O nome do site no resultado aparece como `movepark.co`, porque não há `WebSite` com `name`.
- A página de vaga usa `getServerSideProps` (`__N_SSP` no `__NEXT_DATA__`), então o servidor já
  roda por requisição; os dados da unidade é que chegam só no cliente. O snippet que o Google
  mostra ("Veículos grandes (5,3m de comprimento) pagam 2 vagas...") vem da observação da vaga,
  lida depois que o JS roda.
- Quem serve é a Vercel (`server: Vercel`), com o CNAME fora do proxy da Cloudflare: nada passa
  pelo `src/worker.ts`.

### 2.3 Lixo e duplicata no índice

- Login e conta indexados em 9 hosts (`virapark.../login` com 24.631 impressões).
- A rota-modelo `/[category]/[product]` e `/[category]/[product]/vehicle` indexadas, com colchetes.
- Etapas `/vehicle` e `/payment` do checkout.
- `/pt-br/<categoria>/<vaga>` e `/<categoria>/<vaga>` coexistindo, mais variações com `utm_*`,
  `startDateTime` e `endDateTime` na URL.

## 3. Regras (travadas)

1. **Página que vende fica indexada; o resto sai.** `noindex` em login, conta, recuperação de
   senha e etapas do checkout. O `robots.txt` **libera** o crawl dessas rotas, senão o Google não lê
   o `noindex` (mesma regra do movepark.co, ver `seo-indexacao.md`).
2. **Uma URL por conteúdo.** Canonical para a própria página, sem query de rastreamento ou de data
   e sem a duplicata de idioma. A rota-modelo responde 404.
3. **O servidor entrega a página pronta.** Título, description, h1, conteúdo e JSON-LD saem no HTML
   da resposta, porque crawler de IA não executa JS (a mesma razão do ADR-002 para o FAQ).
4. **Uma fonte de verdade.** Fato da unidade (endereço, traslado, fotos, amenidades, FAQ, nota) vem
   do Hub (`/v1/locations/{id}`, `/v1/faq` da Public API ou a Edge `get-faq`), e não de cópia no WL.
   A FAQ segue as camadas do ADR-002; promessa de transação segue capacidade (ADR-009). Nada de
   `Offer` com preço que o checkout do WL não cobre.
5. **Cada URL tem um papel.** Busca de marca ("aeropark", "aeropark guarulhos") é do WL; busca
   genérica e de comparação ("estacionamento aeroporto guarulhos") é do movepark.co.

## 4. Plano

| # | Atividade | Onde |
|---|---|---|
| 106 | Tirar do índice login, conta, checkout e a rota-modelo | app WL |
| 107 | Canonical, `robots.txt` e `sitemap.xml` por host | app WL |
| 108 | Título, description, Open Graph e favicon por parceiro no servidor | app WL |
| 109 | Conteúdo da home e da vaga no HTML do servidor, com dados do Hub | app WL + Hub |
| 110 | Dados estruturados (`ParkingFacility`, `Offer`, `AggregateRating`, `FAQPage`, `BreadcrumbList`, `WebSite`) | app WL |
| 111 | GEO: `llms.txt` e versão Markdown por host | app WL |
| 112 | Papel de cada URL: Google Meu Negócio com URL limpa, link do movepark.co para o WL | Hub + GMN |
| 113 | Medição: baseline por host e revisões de 30 e 90 dias | Search Console |
| 114 | Avaliar o Hub servir os white-labels com a marca do parceiro | decisão |

Ordem: 106 e 107 primeiro (limpeza, risco baixo), depois 108 a 111, que dependem de o servidor ter
os dados da unidade. A 113 tira o baseline antes de qualquer deploy.

## 5. Onde implementar

O app de white-label não está neste repositório: é o Next.js legado na Vercel. Há três caminhos:

- **A. No app WL** (escolhido para 106 a 111). É o lugar certo e o trabalho é pequeno em Next.js.
- **B. Proxy da Cloudflare com Worker injetando cabeçalho.** Descartado: mexe em DNS e TLS de sites
  que fecham reserva (mesma conclusão de 18/09/2026).
- **C. O Hub servir os sites WL com a marca do parceiro.** Resolve tudo reaproveitando a borda, o
  SSG e o JSON-LD do Hub, mas é a opção grande de `reservas-wl-no-hub.md` § 5. Fica como decisão na
  atividade 114.

## 6. Como verificar

```bash
curl -sL -A "Mozilla/5.0 (compatible; Googlebot/2.1)" https://aeropark.movepark.co/aeroporto-guarulhos/vaga-coberta | grep -o '<title>[^<]*</title>\|rel="canonical"[^>]*\|application/ld+json\|name="description"[^>]*'
```

Pronto quando, em todos os hosts: título e description reais, canonical, um JSON-LD válido no Rich
Results Test, `robots.txt` e `sitemap.xml` com 200, e `X-Robots-Tag` ou meta `noindex` em login,
conta e checkout.
