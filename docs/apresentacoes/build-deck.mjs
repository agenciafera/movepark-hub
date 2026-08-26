import fs from "node:fs";
import path from "node:path";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const fontCss = fs.readFileSync(path.join(DIR, "fonts/inter-embed.css"), "utf8");
/** As artes vêm com fundo transparente, então sentam direto sobre qualquer faixa. */
const img = (n) => {
  const b = fs.readFileSync(path.join(DIR, `img-t/deck${n}.webp`));
  return `data:image/webp;base64,${b.toString("base64")}`;
};

/* ---------- helpers de slide ---------- */
let page = 0;
const slides = [];
const push = (html, cls = "") => {
  page += 1;
  const isCover = cls.includes("cover");
  const foot = isCover
    ? ""
    : `<div class="foot"><span class="fb">Movepark</span><span class="fd">Plano de conteúdo · ago 2026</span><span class="fp">${String(page).padStart(2, "0")}</span></div>`;
  slides.push(`<section class="slide ${cls}">${html}${foot}</section>`);
};

const kicker = (t) => `<p class="kicker">${t}</p>`;
const lead = (t) => `<p class="lead">${t}</p>`;

const section = (num, kick, title, body, imgN, cls = "") =>
  push(
    `<div class="sec">
       <div class="sec-txt">
         <div class="bignum">${num}</div>
         ${kicker(kick)}
         <h1 class="h-xl">${title}</h1>
         ${body ? lead(body) : ""}
       </div>
       <div class="sec-img"><img src="${img(imgN)}" alt=""></div>
     </div>`,
    `sec-slide ${cls}`,
  );

const content = (kick, title, body, opts = {}) =>
  push(
    `<div class="cnt ${opts.wide ? "wide" : ""}">
       ${kicker(kick)}
       <h2 class="h-lg">${title}</h2>
       ${body}
     </div>`,
  );

const table = (head, rows, opts = {}) => `
  <table class="tb ${opts.cls || ""}">
    <thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows
      .map(
        (r) =>
          `<tr${r.hl ? ' class="hl"' : ""}${r.ko ? ' class="ko-row"' : ""}>${(r.c || r)
            .map((c, i) => `<td${i === 0 ? ' class="first"' : ""}>${c}</td>`)
            .join("")}</tr>`,
      )
      .join("")}</tbody>
  </table>`;

const cards = (items, cls = "") => `
  <div class="cards ${cls}">
    ${items
      .map(
        (it) => `<div class="card">
          ${it.n ? `<div class="cn">${it.n}</div>` : ""}
          <h3>${it.t}</h3>
          <p>${it.d}</p>
        </div>`,
      )
      .join("")}
  </div>`;

/* =====================  SLIDES  ===================== */

/* 1 capa */
push(
  `<div class="cover-grid">
     <div>
       <p class="cv-kick">Plano de conteúdo · versão 2 · agosto de 2026</p>
       <h1 class="h-cover">Ser a fonte<br>que a <span class="hl-violet">IA consulta</span><br>sobre estacionamento<br>de aeroporto</h1>
       <p class="cv-sub">Atacando a cabeça da busca primeiro, onde Bandeira Park e xpark já estão. Viracopos e Confins com o Leonardo, Guarulhos e Afonso Pena com o Diego.</p>
     </div>
     <div class="cv-img"><img src="${img(1)}" alt=""></div>
   </div>`,
  "cover",
);

/* 2 tese */
push(
  `<div class="statement">
     <p class="st-kick">A tese, em uma frase</p>
     <p class="st">O concorrente publica<br>o preço que ele diz cobrar.<br><span class="st-em">A Movepark publica<br>o preço que ela cobra.</span></p>
     <p class="st-body">É essa diferença que a IA consegue verificar, e é sobre ela que a estratégia inteira se apoia. Preço saído do motor de reservas, com data ao lado, contra tabela coletada à mão que envelhece sem ninguém perceber.</p>
   </div>`,
  "violet",
);

/* 3 o que mudou */
content(
  "O que mudou desde a primeira versão",
  "Três coisas, e duas são boas",
  `${cards([
    {
      n: "01",
      t: "Confins tem parceiro",
      d: "O <b>Be Park</b> fecha o buraco que travava a praça inteira. A ressalva, que é grande, está no próximo slide.",
    },
    {
      n: "02",
      t: "95 posts emitem FAQPage",
      d: "O acervo inteiro passou a declarar pergunta e resposta em schema, com 422 perguntas escritas de dado verificável.",
    },
    {
      n: "03",
      t: "A prioridade virou",
      d: "A cabeça da busca vem primeiro: preço, valor, diária, proximidade, barato, economia e desconto.",
    },
  ])}
  <p class="note big">A inversão de prioridade é decisão do time e está adotada. O que ela exige em troca, e que não existia no plano anterior, é o slide 8.</p>`,
);

/* 4 o furo do Be Park */
push(
  `<div class="alert">
     <p class="al-kick">O que precisa acontecer antes de escrever uma linha sobre Confins</p>
     <h2 class="h-xl">O Be Park não<br>está no sistema</h2>
     <div class="al-grid">
       <div><span class="al-n">0</span><span class="al-l">unidades de Confins no Hub</span></div>
       <div><span class="al-n">6</span><span class="al-l">lotes mapeados, nenhum é o Be Park</span></div>
       <div><span class="al-n">301</span><span class="al-l">a URL antiga dele redireciona</span></div>
       <div><span class="al-n">1</span><span class="al-l">cadastro destrava a praça</span></div>
     </div>
     <p class="al-body">O Be Park tinha página no site antigo, em <b>/estacionamentos/aeroporto-confins/be-park.../</b>. Hoje essa URL responde 301 para a página de Confins, que lista seis lotes mapeados e <b>não menciona o Be Park</b>. Quem chegava procurando por ele cai numa página que não fala dele. Sem o cadastro não existe tarifa, distância medida nem reserva, e Confins fica sendo a única praça do plano sem número para publicar.</p>
   </div>`,
  "navy",
);

/* 5 quem vamos desbancar */
content(
  "O alvo declarado",
  "Bandeira Park e xpark, e onde eles são frágeis",
  `${table(
    ["Concorrente", "A força dele", "A fragilidade estrutural"],
    [
      {
        c: [
          "Bandeira Park",
          "Citado na visão geral de IA. Comparativo com carimbo mensal, bem indexado",
          "<b>É juiz e parte.</b> Compara o mercado publicando o preço do próprio pátio, e a IA já trata isso como fonte interessada",
        ],
        hl: true,
      },
      {
        c: [
          "xpark",
          "Índice de preços e calculadora, blog por aeroporto, formato parecido com o nosso",
          "<b>Coleta à mão.</b> Preço que ninguém cobra no fim, sem data confiável, e célula vazia onde falta dado",
        ],
        hl: true,
      },
      ["ParkMundo", "Uma página por consulta de preço", "Sem preço vivo e sem método declarado"],
      ["Indigo e o oficial", "Ganha a consulta “oficial” por definição", "Não compara com a alternativa mais barata, porque é ela"],
    ],
  )}
  <p class="note big">Nenhum dos quatro serve markdown para crawler de IA, expõe tool de MCP ou publica preço saído de um motor de reservas. É por aí que a Movepark passa.</p>`,
  { wide: true },
);

/* 6 os fossos */
content(
  "O que já é nosso e ninguém copia rápido",
  "Quatro fossos",
  `${cards(
    [
      {
        n: "01",
        t: "Preço vivo",
        d: "O valor publicado é o que o motor cobra no fechamento, com a data da tabela ao lado. Copiar isso exige ter um motor de reservas, não um editor de texto.",
      },
      {
        n: "02",
        t: "Gêmeo markdown",
        d: "Todo post e toda página de destino respondem em text/markdown por content negotiation. Crawler de IA não executa JavaScript, e nós entregamos texto puro.",
      },
      {
        n: "03",
        t: "Tools de MCP",
        d: "search_blog e get_blog_post no MCP consumidor. Um agente conectado lê o acervo direto, sem passar pelo Google e sem disputar posição com ninguém.",
      },
      {
        n: "04",
        t: "422 perguntas em schema",
        d: "Os 95 posts e as páginas de /faq emitem FAQPage, no formato pergunta e resposta que o modelo já produz. É o que mais rende citação.",
      },
    ],
    "four",
  )}
  <p class="note big">Os quatro já estão no ar. A estratégia daqui em diante é transformar fosso em citação, publicando na cabeça da busca com esses ativos por trás.</p>`,
);

/* 7 a virada de prioridade */
section(
  "1",
  "A virada",
  "A cabeça<br>vem primeiro",
  "Preço, valor, diária, proximidade, barato, economia e desconto. São os três maiores clusters da coleta e é onde Bandeira Park e xpark já respondem hoje. Atacar por ali é mais lento e mais caro que a cauda longa, e é a decisão certa quando o objetivo é ser a fonte principal, não ganhar tráfego residual.",
  5,
);

/* 8 o que a cabeça exige */
push(
  `<div class="statement small">
     <p class="st-kick">O preço da inversão</p>
     <p class="st">Para ganhar<br>“estacionamento aeroporto<br>guarulhos preço”,<br><span class="st-em">é preciso uma página.<br>Hoje existem 36.</span></p>
     <p class="st-body">A cauda longa tolerava o acervo do jeito que está, porque cada post pegava uma intenção diferente. A cabeça não tolera: 36 posts sobre Guarulhos disputando a mesma consulta dividem sinal e nenhum chega ao topo. A consolidação deixa de ser higiene e vira pré-requisito, e é por isso que ela virou a Fase 1.</p>
   </div>`,
  "violet",
);

/* 9 os clusters de cabeça */
content(
  "A cabeça em número, da coleta de 25/08/2026",
  "Onde a briga acontece",
  `${table(
    ["Cluster de cabeça", "GRU", "VCP", "CNF", "CWB", "Total", "Quem responde hoje"],
    [
      { c: ["preço, valor, diária", "70", "29", "27", "37", "<b>163</b>", "Bandeira Park, xpark, ParkMundo"], hl: true },
      { c: ["proximidade, perto, mais próximo", "38", "33", "21", "17", "<b>109</b>", "Google Maps e o oficial"], hl: true },
      { c: ["barato, economia, desconto", "33", "15", "23", "17", "<b>88</b>", "Bandeira Park, xpark"], hl: true },
      { c: ["<span class='mut'>subtotal da cabeça</span>", "141", "77", "71", "71", "<b>360</b>", "<span class='mut'>28% de todos os termos coletados</span>"] },
      ["terminal e setor", "61", "3", "11", "4", "79", "ninguém"],
      ["convênio e benefício", "40", "8", "14", "6", "68", "ninguém"],
      ["tag de pedágio, moto, mensalista", "20", "3", "11", "8", "42", "ninguém"],
    ],
    { cls: "num tight" },
  )}
  <p class="note">A cauda longa não sai do plano, desce para a Fase 4. Ela continua sendo o terreno vazio, e continua barata de ocupar depois que a cabeça estiver de pé.</p>`,
  { wide: true },
);

/* 10 divisão de praças */
content(
  "Quem responde por quê",
  "As praças, divididas",
  `<div class="pracas">
     <div class="praca">
       <div class="pr-nome">Leonardo</div>
       <div class="pr-aero">Viracopos <span>VCP</span></div>
       <div class="pr-aero">Confins <span>CNF</span></div>
       <ul class="pr-lista">
         <li><b>2 parceiros em VCP</b>, com R$ 147,00 de diferença na semana entre eles, a maior da rede</li>
         <li><b>CNF depende do cadastro do Be Park</b>, e esse é o primeiro entregável da praça</li>
         <li>21 posts de VCP e 3 de CNF no acervo, com consolidação pesada em Viracopos</li>
         <li>Confins é a praça com maior distância até a capital, 38 km, o que torna o carro mais competitivo</li>
       </ul>
     </div>
     <div class="praca alt">
       <div class="pr-nome">Diego</div>
       <div class="pr-aero">Guarulhos <span>GRU</span></div>
       <div class="pr-aero">Afonso Pena <span>CWB</span></div>
       <ul class="pr-lista">
         <li><b>3 parceiros em GRU</b> e a menor diária da rede, R$ 18,90 em agosto de 2026</li>
         <li><b>GRU tem a maior consolidação a fazer</b>: 36 posts disputando as mesmas consultas</li>
         <li>CWB tem os dois parceiros com piso de três diárias, argumento de conteúdo que ninguém explica</li>
         <li>Guarulhos concentra 141 dos 360 termos de cabeça, o maior prêmio isolado do plano</li>
       </ul>
     </div>
   </div>
   <p class="note big">Cada um responde pela cabeça, pela consolidação e pela FAQ da própria praça. O que é comum aos quatro aeroportos, como o schema e o índice de preços, sai uma vez e serve para todos.</p>`,
  { wide: true },
);

/* 11 fase 0 */
section(
  "0",
  "Fase 0 · semana 1",
  "Munição<br>e medição",
  "Nada é publicado antes disso. São seis entregas que destravam o resto e criam o placar contra Bandeira Park e xpark.",
  9,
);

/* 12 detalhe fase 0 */
content(
  "Fase 0, entrega por entrega",
  "O que sai na semana 1",
  `${table(
    ["Entrega", "Por quê", "Quem"],
    [
      { c: ["<b>Cadastrar o Be Park no Hub</b>", "Sem ele Confins não tem tarifa, distância nem reserva, e a praça inteira fica sem número para publicar", "Leonardo"], hl: true },
      { c: ["<b>Mapa de canonicalização</b>", "Definir, por aeroporto, qual URL vai ganhar cada termo de cabeça e o que será redirecionado para ela", "Leonardo e Diego"], hl: true },
      ["Baseline do Search Console", "16 meses por consulta e por página, congelados como marco zero", "Leonardo e Diego"],
      { c: ["<b>Placar de citação em IA</b>", "12 consultas rodadas por mês em ChatGPT, Gemini, Perplexity e visão geral do Google, registrando quem foi citado", "Leonardo e Diego"], hl: true },
      ["Bing Webmaster Tools", "A busca do ChatGPT se apoia no índice da Microsoft, e ninguém checou se estamos lá", "Diego"],
      ["Kit de marca do Instagram", "Grid, tipografia grande, molde de carrossel e de reels", "Diego"],
    ],
    { cls: "fases" },
  )}`,
  { wide: true },
);

/* 13 fase 1 */
section(
  "1",
  "Fase 1 · semanas 2 a 6",
  "Uma URL<br>por termo<br>de cabeça",
  "Três páginas canônicas por aeroporto, doze ao todo, cada uma dona de um cluster. Todo post que hoje disputa a mesma consulta é redirecionado para a dona.",
  7,
);

/* 14 detalhe fase 1 */
content(
  "Fase 1, o desenho das doze páginas",
  "Cada cluster ganha uma dona",
  `${table(
    ["Cluster", "A página dona", "O que ela precisa ter", "Redireciona"],
    [
      {
        c: [
          "preço, valor, diária",
          "<b>/precos/&lt;aeroporto&gt;</b> reforçada, mais o post âncora de preço",
          "Tabela por faixa de permanência, os dois ou três parceiros lado a lado, balcão contra online, data da tabela e método aberto",
          "os posts de preço duplicados",
        ],
        hl: true,
      },
      {
        c: [
          "barato, economia, desconto",
          "<b>/estacionamento-mais-barato/&lt;aeroporto&gt;</b>",
          "O menor total por duração, quanto se economiza contra o balcão, e o que se abre mão para chegar nele",
          "os posts de economia e de cupom",
        ],
        hl: true,
      },
      {
        c: [
          "proximidade, perto, mais próximo",
          "Post âncora de proximidade por aeroporto",
          "Distância em km medida no motor, minutos de traslado, frequência da van e a conta do que a proximidade custa a mais",
          "os posts de “mais próximo” e “ao lado”",
        ],
        hl: true,
      },
    ],
    { cls: "fases" },
  )}
  <p class="note big">Doze páginas, quatro por pessoa em cada quinzena. O trabalho pesado está em decidir o que morre: cada dona absorve de dois a seis posts existentes.</p>`,
  { wide: true },
);

/* 15 fase 2 */
section(
  "2",
  "Fase 2 · semanas 7 a 10",
  "A camada<br>de máquina",
  "O que faz a IA preferir a Movepark quando duas fontes dizem a mesma coisa. Aqui nada é escrito para humano: é formato, schema e endpoint.",
  4,
);

/* 16 detalhe fase 2 */
content(
  "Fase 2, o que entra",
  "Cinco entregas que falam com máquina",
  `${cards([
    {
      n: "01",
      t: "Bloco de fato padronizado",
      d: "Toda menção a parceiro sai no mesmo molde: nome, distância em km, minutos de traslado e diária com mês. É o formato que a visão geral de IA copia inteiro.",
    },
    {
      n: "02",
      t: "Product e Offer no preço",
      d: "As páginas de preço passam a emitir preço em schema, e não só em tabela. Hoje só a FAQ e o breadcrumb saem estruturados.",
    },
    {
      n: "03",
      t: "Índice de preços em JSON",
      d: "Um endpoint público com o índice completo, datado, para agente ler sem raspar HTML. Nenhum concorrente oferece isso.",
    },
    {
      n: "04",
      t: "llms.txt apontando o endpoint",
      d: "O arquivo já existe. Falta ele dizer, em uma linha, onde está o preço legível por máquina e com que frequência muda.",
    },
    {
      n: "05",
      t: "Carimbo automático de frescor",
      d: "Data da última atualização visível em toda página de preço, saída do banco. É o campo que decide o desempate quando duas fontes divergem.",
    },
    {
      n: "06",
      t: "FAQPage no post âncora",
      d: "Já entregue nos 95 posts do acervo. As doze páginas novas da Fase 1 nascem com ele.",
    },
  ])}`,
);

/* 17 fase 3 */
section(
  "3",
  "Fase 3 · semanas 11 a 14",
  "Prova social<br>e frescor",
  "A cabeça exige confiança, e confiança tem cluster próprio: 25 termos de “é seguro”, “avaliação”, “reddit”. Some a isso a rotina que mantém o preço mais fresco que o do concorrente.",
  6,
);

/* 18 detalhe fase 3 */
content(
  "Fase 3, o que entra",
  "Confiança e frescor",
  `${table(
    ["Frente", "Entrega", "Contra quem joga"],
    [
      ["Prova social", "Post por aeroporto respondendo “é seguro deixar o carro”, com o que verificar antes e o que acontece quando dá problema", "A busca por “reddit”, que é o sinal de quem não confia no conteúdo comercial"],
      { c: ["<b>Frescor mensal</b>", "Carimbo e valores revistos todo mês nas doze páginas de cabeça, com a data visível", "O carimbo mensal do Bandeira Park, que hoje é o mais fresco da praça"], hl: true },
      ["Avaliação real", "Publicar avaliação de cliente onde existir, com data e volume, em vez de adjetivo", "O comparador que fala de qualidade sem nenhum dado por trás"],
      ["Metodologia aberta", "Uma página explicando de onde vem cada número e com que frequência ele muda", "A coleta à mão do xpark, que não consegue publicar isso"],
    ],
    { cls: "fases" },
  )}`,
  { wide: true },
);

/* 19 fase 4 */
section(
  "4",
  "Fase 4 · semanas 15 a 20",
  "A cauda longa<br>que ninguém vê",
  "Depois que a cabeça estiver de pé, o terreno vazio continua vazio e fica barato de ocupar. Foi o que a coleta encontrou e nenhum concorrente cobre.",
  6,
);

/* 20 detalhe fase 4 */
content(
  "Fase 4, os clusters órfãos",
  "189 termos sem dono",
  `${cards(
    [
      { n: "79", t: "Terminal e setor", d: "T1, T2, T3, edifício garagem, portão 2, P1 e P3 em Confins, área C em Curitiba, bolsão F em Viracopos. Sessenta e um deles são de Guarulhos." },
      { n: "68", t: "Convênio e cartão", d: "Itaú Personnalité, Porto Seguro, OAB, Latam, Livelo, Azul Diamante. Público que viaja mais e não conta centavo." },
      { n: "16", t: "Tag de pedágio", d: "Aceita Sem Parar, ConectCar, Veloe. Pergunta binária, resposta curta, vira FAQ e reels no mesmo dia." },
      { n: "15", t: "Mensalista", d: "Estacionamento mensal de aeroporto, 20 e 30 dias. Ticket alto e recorrente." },
      { n: "11", t: "Moto", d: "O motor já tem o tipo motorcycle e o índice já separa moto de carro. Conteúdo com produto pronto atrás." },
      { n: "!", t: "Regra da fase", d: "Cada peça sai de um dado que já existe no sistema. Cluster sem dado por trás não entra na pauta." },
    ],
    "six",
  )}`,
);

/* 21 fase 5 */
section(
  "5",
  "Fase 5 · semanas 21 a 34",
  "Escala<br>nacional",
  "Os 18 aeroportos publicados que hoje têm zero ou um post. O molde já validado vira produção: trio de guia âncora, página de preço e FAQ por aeroporto.",
  10,
);

/* 22 defesa */
content(
  "Contínua, a partir da semana 7",
  "A rotina que não pode parar",
  `${table(
    ["Rotina", "Frequência", "Por quê"],
    [
      { c: ["<b>Placar de citação em IA</b>", "mensal", "É o único jeito de saber se estamos ganhando de Bandeira Park e xpark. Não existe painel: é print e planilha"], hl: true },
      { c: ["<b>Carimbo e valores das páginas de cabeça</b>", "mensal", "Frescor é critério de desempate entre fontes que dizem a mesma coisa"], hl: true },
      ["Revisão das dez páginas em maior queda", "quinzenal", "Perda de posição na cabeça custa caro e se recupera devagar"],
      ["Consolidação dos posts canibais restantes", "4 por mês", "O acervo tem cerca de 30 duplicatas além das que a Fase 1 absorve"],
      ["Nova coleta de autocomplete", "trimestral", "A demanda muda, e a lista de 1.282 termos envelhece"],
    ],
    { cls: "fases" },
  )}`,
  { wide: true },
);

/* 23 placar */
content(
  "O placar",
  "Como saber se estamos ganhando",
  `${lead("Não existe ferramenta que meça citação em IA. O método é manual e é o único confiável: doze consultas, quatro motores, uma vez por mês, com print.")}
   ${table(
     ["Consulta rodada todo mês", "Onde", "O que se registra"],
     [
       ["estacionamento aeroporto guarulhos preço", "ChatGPT com busca", "Movepark citada? Bandeira Park? xpark?"],
       ["qual o estacionamento mais barato em viracopos", "Gemini", "idem"],
       ["quanto custa estacionar em confins", "Perplexity", "idem"],
       ["estacionamento mais próximo do afonso pena", "Google, visão geral de IA", "idem"],
       ["<span class='mut'>mais oito, cobrindo os três clusters de cabeça nos quatro aeroportos</span>", "<span class='mut'>os quatro motores</span>", "<span class='mut'>print e data em planilha</span>"],
     ],
   )}
   <p class="note big">A meta é simples de enunciar: em 180 dias, a Movepark aparece em mais respostas que Bandeira Park e xpark somados, nas doze consultas.</p>`,
  { wide: true },
);

/* 24 blogpost seção */
section(
  "6",
  "Contrato de produção",
  "A estrutura<br>obrigatória<br>do blogpost",
  "Não é sugestão. O analisador mede a maior parte e bloqueia o que quebra o site. Post que não passa não é publicado.",
  8,
);

/* 25 esqueleto */
content(
  "O esqueleto, bloco a bloco",
  "14 blocos, nesta ordem",
  `${table(
    ["#", "Bloco", "Regra dura", "Serve a"],
    [
      ["1", "Título H1", "Frase-chave inteira, até 60 caracteres, sem promessa de transação", "SEO"],
      ["2", "Meta description", "Frase-chave, até 155 caracteres, com o benefício concreto", "SEO"],
      { c: ["3", "<b>Abertura autossuficiente</b>", "Até 90 palavras, frase-chave na primeira frase. Sem “neste artigo você vai descobrir”", "GEO e snippet"], hl: true },
      ["4", "Entidade por extenso", "Nome completo do aeroporto, cidade, região e código IATA, ao menos uma vez", "GEO"],
      { c: ["5", "<b>Resposta rápida em tabela</b>", "Logo depois da abertura: opções, preço, distância, traslado", "GEO e rich result"], hl: true },
      { c: ["6", "<b>H2 em forma de pergunta</b>", "Do jeito que a pessoa pergunta, com um parágrafo que responde sozinho abaixo", "bloco de perguntas"], hl: true },
      ["7", "Tabela onde houver dado comparável", "Preço por faixa de diárias, comparativo de opções e tempo", "GEO"],
      ["8", "Número com unidade e data", "“12 minutos de traslado”, “R$ 18,90 em agosto de 2026”. Adjetivo não é citável", "GEO"],
      ["9", "Lista com item autoexplicativo", "“Cobertura: protege do sol e do granizo, e custa de 10% a 20% a mais”", "GEO"],
      ["10", "Bloco de método", "Como o preço foi apurado e quando. Separa fonte confiável de folheto", "E-E-A-T"],
      { c: ["11", "<b>FAQ no fim</b>", "5 a 8 perguntas reais, pergunta em H3 terminada em “?”, resposta de 40 a 60 palavras", "FAQPage automático"], hl: true },
      ["12", "Links", "1 para /destinos, 2 ou 3 internos, 1 externo com rótulo. Nunca para quem vende vaga", "SEO"],
      ["13", "Autoria e data visíveis", "Quem escreveu e quando", "E-E-A-T"],
      ["14", "CTA final", "Para /destinos/&lt;slug&gt;, sem prometer o que a unidade não declara", "conversão"],
    ],
    { cls: "esq tight" },
  )}`,
  { wide: true },
);

/* 26 limites */
content(
  "Os limites que bloqueiam a publicação",
  "Onze regras que não se negociam",
  `${table(
    ["Regra", "Limite"],
    [
      ["Extensão", "mínimo de <b>3.000 palavras</b>"],
      ["Densidade da frase-chave", "entre 0,5% e 2,5%, distribuída, nunca forçada"],
      ["Frase-chave obrigatória em", "título, primeira frase, ao menos 2 H2, slug, meta description e ao menos um alt de imagem"],
      ["Corpo", "markdown puro, <b>zero HTML</b>. O render imprime a tag na tela"],
      ["Blocos permitidos", "H2 a H4, parágrafo, lista com um nível, citação, imagem, linha e tabela"],
      { c: ["Travessão e traço", "<b>zero</b>. Regra de marca do projeto inteiro"], hl: true },
      { c: ["Promessa de transação", "<b>zero</b> (ADR-009). Nada de vaga garantida, cancelamento grátis ou preço fixo"], hl: true },
      { c: ["Valor em R$", "sempre com data de referência e link para o preço vivo"], hl: true },
      ["Slug publicado", "nunca muda. É o contrato de URL que guarda o tráfego"],
      { c: ["Gêmeo markdown", "public/blog/&lt;slug&gt;.md commitado junto. Sem ele o post não existe para IA nenhuma"], hl: true },
      ["Imagens", "WebP no Storage, máximo 1600px, alt com a frase-chave"],
    ],
    { cls: "tight" },
  )}
  <p class="note big">Checagem final de GEO: se eu respondesse “qual o melhor estacionamento em X” usando só este texto, <b>qual parágrafo eu copiaria inteiro?</b> Se a resposta for “nenhum”, o post ainda não está citável.</p>`,
  { wide: true },
);

/* 27 instagram seção */
section(
  "7",
  "Distribuição",
  "O Instagram,<br>sem ilusão",
  "Instagram não transfere autoridade para o Google e link em legenda não é backlink. O que ele entrega é busca de marca, superfície própria de busca, prova social em vídeo e reaproveitamento sem escrever nada novo.",
  8,
);

/* 28 formatos */
content(
  "Quatro formatos, molde fechado",
  "A semana de Instagram",
  cards(
    [
      { n: "A", t: "Carrossel de resposta<br><span class='cf'>2 por semana</span>", d: "O cavalo de batalha. Nasce direto do H2 do post de cabeça. Oito cards: a pergunta, a resposta em uma frase, quatro argumentos com número, uma tabela de no máximo 4 linhas e o convite." },
      { n: "B", t: "Reels de prova<br><span class='cf'>1 por semana</span>", d: "15 a 30 segundos gravados no lote. Gancho falado nos 2 primeiros segundos, resposta com número na tela, a prova (o carro entrando, a van saindo, o cronômetro) e o fechamento." },
      { n: "C", t: "Story de bastidor<br><span class='cf'>2 por semana</span>", d: "Enquete direta e caixa de pergunta. A resposta vira o carrossel da semana seguinte. Story serve para descobrir pauta, e a entrega vem no carrossel." },
      { n: "D", t: "Post estático de dado<br><span class='cf'>1 a cada 15 dias</span>", d: "Um número grande, uma frase de contexto, a data. É o formato mais compartilhado e o que mais gera salvamento." },
    ],
    "four",
  ),
);

/* 29 regras instagram */
content(
  "As regras duras",
  "O que trava um post no Instagram",
  `${table(
    ["Regra", "Por quê"],
    [
      { c: ["Título grande ocupando ao menos 40% do primeiro card", "O feed é visto a 15 cm do rosto, com uma mão, em 4G"], hl: true },
      { c: ["Palavra-chave inteira na primeira linha da legenda", "É o trecho indexado e o que aparece antes do “mais”"], hl: true },
      ["Máximo 20 palavras por card", "Card cheio não é lido"],
      ["Paleta travada: violeta, navy e branco", "Uma marca, três superfícies"],
      ["Inter, peso 700 nos títulos", "Mesmo sistema tipográfico do site"],
      ["Sem travessão, sem emoji na prosa, sem exclamação em série", "Regra de marca do projeto"],
      { c: ["Nenhuma promessa de transação", "ADR-009 vale para o Instagram também"], hl: true },
      { c: ["Todo valor em R$ com o mês na arte", "Preço sem data envelhece e vira reclamação no direct"], hl: true },
      ["De 3 a 5 hashtags específicas", "#estacionamentoguarulhos funciona, #viagem não"],
      ["Alt text preenchido em toda imagem", "Acessibilidade e indexação interna"],
    ],
    { cls: "tight" },
  )}`,
  { wide: true },
);

/* 30 pipeline */
content(
  "O reaproveitamento",
  "Um post de cabeça vira uma semana inteira",
  `<div class="pipe">
     <div class="pipe-src"><span class="ps-k">Fonte única</span><span class="ps-t">Página<br>de cabeça</span></div>
     <div class="pipe-arrow"></div>
     <div class="pipe-out">
       <div class="po"><span class="po-in">H2 principal</span><span class="po-out">Carrossel de 8 cards</span></div>
       <div class="po"><span class="po-in">Tabela de preço</span><span class="po-out">Post estático de um número</span></div>
       <div class="po"><span class="po-in">FAQ mais buscada</span><span class="po-out">Reels de 30 segundos no lote</span></div>
       <div class="po"><span class="po-in">Objeção do texto</span><span class="po-out">Story com enquete e caixa de pergunta</span></div>
     </div>
   </div>
   <p class="note big">Nada é escrito duas vezes. A página é a fonte, o Instagram é a distribuição.</p>`,
  { wide: true },
);

/* 31 métricas */
content(
  "Como saber se está funcionando",
  "Métricas e metas",
  `${table(
    ["Métrica", "Hoje", "90 dias", "180 dias"],
    [
      { c: ["<b>Citações em IA nas 12 consultas</b>", "0 medidas", "6 de 12", "10 de 12"], hl: true },
      { c: ["<b>Movepark acima de Bandeira Park e xpark</b>", "não medido", "empate", "vantagem nas 12"], hl: true },
      ["Termos de cabeça em posição 1 a 3", "a medir na Fase 0", "12", "30"],
      ["Páginas canônicas de cabeça no ar", "0 de 12", "12 de 12", "36 (com a Fase 5)"],
      ["Posts canibais absorvidos por redirect", "0 de cerca de 40", "24", "40"],
      ["Cliques orgânicos do blog por mês", "a medir", "+40%", "+120%"],
      ["Aeroportos com trio completo", "0", "4", "12"],
    ],
    { cls: "num" },
  )}`,
  { wide: true },
);

/* 32 fechamento */
push(
  `<div class="close">
     <p class="cl-kick">O que destrava a semana 1</p>
     <h2 class="h-xl">Três decisões,<br>uma delas urgente</h2>
     <div class="cl-grid">
       <div class="cl-item urg"><span class="cl-n">01 · urgente</span><h3>Cadastrar o Be Park</h3><p>Confins é a única praça sem número para publicar, e a URL antiga do Be Park já manda gente para uma página que não fala dele. Sem esse cadastro, metade da praça do Leonardo fica parada.</p></div>
       <div class="cl-item"><span class="cl-n">02</span><h3>Aprovar o mapa de redirects</h3><p>A cabeça exige uma URL por termo. Isso significa aposentar de dois a seis posts por cluster, com 301 para a página dona. É a decisão que dói e a que faz a estratégia funcionar.</p></div>
       <div class="cl-item"><span class="cl-n">03</span><h3>Quem grava o reels</h3><p>Duas páginas e quatro peças de Instagram por semana por pessoa é o teto com apoio de IA. O reels exige alguém no lote, com celular, uma vez por semana, em cada praça.</p></div>
     </div>
     <p class="cl-foot">Plano completo em <b>docs/specs/plano-conteudo-aeroportos.md</b> · dados brutos em <b>docs/specs/dados/cauda-longa-aeroportos.json</b></p>
   </div>`,
  "navy",
);

/* =====================  CSS  ===================== */
const css = `
${fontCss}
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --violet:#5D5FEF; --violet-d:#4041A3; --violet-l:#C5C4F6; --violet-xl:#EEEEFD;
  --navy:#29263F; --ink:#222; --body:#3f3f3f; --mut:#6a6a6a; --mut2:#929292;
  --hair:#e4e4ea; --soft:#F7F8FC; --ok:#008a05; --ko:#c13515;
}
html,body{background:#fff}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;color:var(--ink);
  -webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.slide{width:1920px;height:1080px;position:relative;overflow:hidden;background:#fff;
  padding:96px 110px 0;page-break-after:always;break-after:page;display:flex;flex-direction:column}
.slide:last-child{page-break-after:auto}

.foot{position:absolute;left:110px;right:110px;bottom:44px;display:flex;align-items:center;
  gap:24px;font-size:20px;color:var(--mut2);font-weight:500;border-top:1px solid var(--hair);padding-top:22px}
.fb{color:var(--violet);font-weight:700}
.fd{flex:1}
.fp{font-weight:700;color:var(--mut)}
.navy .foot,.violet .foot{border-color:rgba(255,255,255,.18);color:rgba(255,255,255,.55)}
.navy .fb,.violet .fb{color:#fff}
.navy .fp,.violet .fp{color:rgba(255,255,255,.8)}

.kicker{font-size:24px;font-weight:600;color:var(--violet);letter-spacing:.2px;margin-bottom:18px}
.h-cover{font-size:118px;font-weight:800;line-height:.99;letter-spacing:-3.6px;color:#fff}
.h-xl{font-size:100px;font-weight:800;line-height:1.02;letter-spacing:-3px;color:var(--navy)}
.h-lg{font-size:72px;font-weight:800;line-height:1.05;letter-spacing:-2px;color:var(--navy);margin-bottom:24px}
.lead{font-size:29px;line-height:1.5;color:var(--body);max-width:1180px;font-weight:400}
.lead b{font-weight:700;color:var(--ink)}
.note{font-size:24px;line-height:1.5;color:var(--mut);margin-top:22px}
.note.big{font-size:27px;color:var(--body);margin-top:28px;padding-left:22px;border-left:5px solid var(--violet)}
.note b{color:var(--ink);font-weight:700}
.mut{color:var(--mut2);font-weight:500;font-size:.9em}
.ko{color:var(--ko);font-weight:700}
.hl-violet{color:var(--violet-l)}

/* capa: arte transparente sentando direto no navy, com brilho atrás */
.cover{background:var(--navy);padding:0}
.cover-grid{display:grid;grid-template-columns:1fr 760px;height:100%;align-items:center;
  padding:0 90px 0 120px;gap:30px}
.cv-kick{font-size:26px;font-weight:600;color:var(--violet-l);margin-bottom:40px;letter-spacing:.3px}
.cv-sub{font-size:30px;line-height:1.48;color:rgba(255,255,255,.72);max-width:820px;margin-top:48px;font-weight:400}
.cv-img{height:100%;display:flex;align-items:center;justify-content:center;position:relative}
.cv-img::before{content:'';position:absolute;width:840px;height:840px;border-radius:50%;
  background:radial-gradient(circle,rgba(93,95,239,.5) 0%,rgba(41,38,63,0) 70%)}
.cv-img img{width:100%;max-width:720px;position:relative;filter:drop-shadow(0 40px 70px rgba(0,0,0,.45))}

.violet{background:var(--violet)}
.navy{background:var(--navy)}
.statement{flex:1;display:flex;flex-direction:column;justify-content:center;padding-bottom:60px}
.st-kick{font-size:26px;font-weight:600;color:rgba(255,255,255,.62);margin-bottom:36px}
.st{font-size:88px;font-weight:800;line-height:1.08;letter-spacing:-2.5px;color:rgba(255,255,255,.55)}
.st-em{color:#fff}
.statement.small .st{font-size:76px}
.st-body{font-size:28px;line-height:1.55;color:rgba(255,255,255,.78);max-width:1400px;margin-top:44px}
.st-body b{color:#fff;font-weight:700}

/* seção com arte transparente */
.sec{display:grid;grid-template-columns:1fr 600px;gap:70px;flex:1;align-items:center;padding-bottom:70px}
.sec-txt{max-width:1020px}
.bignum{font-size:150px;font-weight:800;line-height:.8;color:var(--violet-l);letter-spacing:-6px;margin-bottom:26px}
.sec-txt .kicker{margin-bottom:14px}
.sec-txt .lead{margin-top:32px;font-size:29px}
.sec-img{display:flex;align-items:center;justify-content:center;position:relative}
.sec-img::before{content:'';position:absolute;width:640px;height:640px;border-radius:50%;
  background:radial-gradient(circle,rgba(93,95,239,.13) 0%,rgba(255,255,255,0) 70%)}
.sec-img img{width:100%;max-height:660px;object-fit:contain;position:relative;
  filter:drop-shadow(0 26px 44px rgba(41,38,63,.16))}

.cnt{flex:1;padding-bottom:110px;display:flex;flex-direction:column;justify-content:center}
.cnt.wide .h-lg{font-size:64px;margin-bottom:20px}

.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:26px;margin-top:36px}
.cards.four{grid-template-columns:repeat(4,1fr);gap:24px;margin-top:44px}
.cards.six{grid-template-columns:repeat(3,1fr);gap:24px;margin-top:34px}
.card{background:var(--soft);border:1px solid var(--hair);border-radius:22px;padding:32px 30px}
.cards.four .card{padding:36px 30px}
.cn{font-size:44px;font-weight:800;color:var(--violet);line-height:1;margin-bottom:16px;letter-spacing:-1.5px}
.cards.four .cn{font-size:54px}
.card h3{font-size:28px;font-weight:700;color:var(--navy);margin-bottom:12px;line-height:1.2}
.cards.four .card h3{font-size:30px}
.card p{font-size:22px;line-height:1.48;color:var(--body)}
.cf{display:block;font-size:20px;font-weight:600;color:var(--violet);margin-top:6px}

.tb{width:100%;border-collapse:collapse;margin-top:26px;font-size:24px}
.tb th{text-align:left;font-size:20px;font-weight:700;color:var(--mut);
  padding:0 20px 16px;border-bottom:2px solid var(--navy);letter-spacing:.3px}
.tb td{padding:17px 20px;border-bottom:1px solid var(--hair);color:var(--body);line-height:1.4;vertical-align:top}
.tb td.first{font-weight:600;color:var(--ink)}
.tb tr.hl td{background:var(--violet-xl)}
.tb tr.hl td.first{color:var(--violet-d)}
.tb.tight{font-size:20px;margin-top:20px}
.tb.tight th{font-size:18px;padding:0 16px 12px}
.tb.tight td{padding:7px 16px;font-size:20px;line-height:1.3}
.tb.num td:not(.first){text-align:center}
.tb.num td:last-child{text-align:left}
.tb.num th:not(:first-child){text-align:center}
.tb.num th:last-child{text-align:left}
.tb.esq td{padding:11px 18px;font-size:22px}
.tb.esq th{font-size:19px}
.tb.esq.tight td{padding:7px 16px;font-size:20px}
.tb.esq td:first-child{color:var(--violet);font-weight:800;width:56px;text-align:center}
.tb.fases td{padding:22px 20px;font-size:23px}
.tb.fases td.first{font-size:26px;line-height:1.25}
.tb b{color:var(--ink);font-weight:700}

/* divisão de praças */
.pracas{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:34px}
.praca{border-radius:24px;padding:36px 34px;background:var(--violet-xl);border:1px solid var(--violet-l)}
.praca.alt{background:var(--soft);border-color:var(--hair)}
.pr-nome{font-size:44px;font-weight:800;color:var(--navy);letter-spacing:-1.4px;margin-bottom:18px}
.pr-aero{display:inline-block;font-size:26px;font-weight:700;color:var(--violet-d);
  background:#fff;border-radius:999px;padding:8px 20px;margin:0 10px 18px 0;border:1px solid var(--violet-l)}
.praca.alt .pr-aero{color:var(--navy);border-color:var(--hair)}
.pr-aero span{font-weight:500;color:var(--mut);margin-left:8px}
.pr-lista{list-style:none;margin-top:10px}
.pr-lista li{font-size:22px;line-height:1.45;color:var(--body);padding-left:24px;position:relative;margin-bottom:14px}
.pr-lista li::before{content:'';position:absolute;left:0;top:11px;width:9px;height:9px;
  border-radius:50%;background:var(--violet)}
.pr-lista b{color:var(--ink);font-weight:700}

.alert{flex:1;padding-bottom:80px;display:flex;flex-direction:column;justify-content:center}
.al-kick{font-size:26px;font-weight:600;color:var(--violet-l);margin-bottom:22px}
.alert .h-xl{color:#fff;font-size:92px}
.al-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;margin:52px 0 42px}
.al-grid>div{border-left:4px solid var(--violet);padding-left:26px}
.al-n{display:block;font-size:80px;font-weight:800;color:#fff;line-height:1;letter-spacing:-3px}
.al-l{display:block;font-size:22px;color:rgba(255,255,255,.6);margin-top:12px;line-height:1.35}
.al-body{font-size:27px;line-height:1.55;color:rgba(255,255,255,.75);max-width:1560px}
.al-body b{color:#fff;font-weight:700}

.pipe{display:grid;grid-template-columns:340px 90px 1fr;gap:0;align-items:center;margin-top:40px}
.pipe-src{background:var(--navy);border-radius:24px;padding:44px 36px;color:#fff}
.ps-k{display:block;font-size:20px;font-weight:600;color:var(--violet-l);margin-bottom:14px}
.ps-t{display:block;font-size:44px;font-weight:800;line-height:1.1;letter-spacing:-1px}
.pipe-arrow{height:4px;background:linear-gradient(90deg,var(--navy),var(--violet))}
.pipe-out{display:flex;flex-direction:column;gap:16px}
.po{display:grid;grid-template-columns:340px 1fr;gap:24px;align-items:center;
  background:var(--soft);border:1px solid var(--hair);border-radius:18px;padding:22px 30px}
.po-in{font-size:24px;font-weight:700;color:var(--violet)}
.po-out{font-size:26px;color:var(--body)}

.close{flex:1;display:flex;flex-direction:column;justify-content:center;padding-bottom:70px}
.cl-kick{font-size:26px;font-weight:600;color:var(--violet-l);margin-bottom:22px}
.close .h-xl{color:#fff;font-size:88px}
.cl-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:30px;margin:56px 0 42px}
.cl-item{border-top:3px solid rgba(255,255,255,.25);padding-top:26px}
.cl-item.urg{border-top-color:var(--violet)}
.cl-n{display:block;font-size:22px;font-weight:800;color:rgba(255,255,255,.5);margin-bottom:14px}
.cl-item.urg .cl-n{color:var(--violet-l)}
.cl-item h3{font-size:33px;font-weight:700;color:#fff;line-height:1.2;margin-bottom:14px}
.cl-item p{font-size:23px;line-height:1.5;color:rgba(255,255,255,.68)}
.cl-foot{font-size:22px;color:rgba(255,255,255,.5)}
.cl-foot b{color:rgba(255,255,255,.85);font-weight:600}
`;

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Plano de conteúdo Movepark</title><style>${css}</style></head>
<body>${slides.join("\n")}</body></html>`;

fs.writeFileSync(path.join(DIR, "deck.html"), html);
console.log("slides:", page, "| html:", (html.length / 1024 / 1024).toFixed(1), "MB");
