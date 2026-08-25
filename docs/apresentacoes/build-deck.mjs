import fs from "node:fs";
import path from "node:path";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const fontCss = fs.readFileSync(path.join(DIR, "fonts/inter-embed.css"), "utf8");
const img = (n) => {
  const b = fs.readFileSync(path.join(DIR, `img/deck${n}.jpg`));
  return `data:image/jpeg;base64,${b.toString("base64")}`;
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

/** slide de seção: número gigante + título + imagem 3D */
const section = (num, kick, title, body, imgN) =>
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
    "sec-slide",
  );

/** slide de conteúdo: título grande + corpo livre */
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
          `<tr${r.hl ? ' class="hl"' : ""}>${(r.c || r)
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
       <p class="cv-kick">Plano de conteúdo · agosto de 2026</p>
       <h1 class="h-cover">Dominar a<br>busca de<br><span class="hl-violet">estacionamento</span><br>de aeroporto</h1>
       <p class="cv-sub">Blog e Instagram em cinco fases, escritos para ganhar o Google e para serem citados pelas IAs. A onda 1 começa por Viracopos, Guarulhos, Afonso Pena e Confins.</p>
     </div>
     <div class="cv-img"><img src="${img(1)}" alt=""></div>
   </div>`,
  "cover",
);

/* 2 tese */
push(
  `<div class="statement">
     <p class="st-kick">A tese</p>
     <p class="st">Quem responde a pergunta<br>ganha o clique.<br><span class="st-em">Quem responde com número<br>ganha a citação da IA.</span></p>
   </div>`,
  "violet",
);

/* 3 o que já está pronto */
content(
  "Ponto de partida",
  "A engrenagem já está montada",
  `${lead("Nada aqui precisa ser construído. O cutover já aconteceu e o site responde indexável, com preço vivo e gêmeo markdown para crawler de IA.")}
   ${cards([
     { n: "01", t: "Domínio no ar", d: "O <b>movepark.co</b> serve o Hub e responde 200, sem noindex. O hub. faz 301 para o apex." },
     { n: "02", t: "22 aeroportos", d: "Páginas de destino publicadas, com versão markdown por content negotiation." },
     { n: "03", t: "Preço vivo", d: "/precos, /precos/&lt;slug&gt; e calculadora, com o valor cobrado no checkout." },
     { n: "04", t: "FAQ com URL própria", d: "8 globais + 8 por destino, cada uma com FAQPage e BreadcrumbList no HTML." },
     { n: "05", t: "95 posts herdados", d: "Todos com .md servido para crawler de IA que não executa JavaScript." },
     { n: "06", t: "FAQPage no post", d: "Desde 25/08, a rota lê a FAQ escrita no corpo e emite o schema. 11 dos 95 herdados já entraram." },
     { n: "07", t: "Bots liberados", d: "GPTBot, ClaudeBot, PerplexityBot e companhia com allow desde 15/08." },
   ], "dense")}`,
);

/* 4 acervo torto */
push(
  `<div class="split">
     <div class="split-txt">
       ${kicker("Diagnóstico")}
       <h2 class="h-lg">O acervo está torto</h2>
       ${lead("<b>62 dos 95 posts</b> disputam Guarulhos e Viracopos, quase todos com a mesma intenção. Isso divide sinal em vez de somar. Confins tem 3 posts para um aeroporto de 12 milhões de passageiros.")}
       <p class="note">Publicar mais um texto genérico sobre Guarulhos hoje <b>subtrai</b> tráfego, não soma.</p>
     </div>
     <div class="split-side">
       ${table(
         ["Aeroporto", "Posts", "No ar", "Mais novo"],
         [
           { c: ["Guarulhos", "36", "26", "set/2025"], hl: true },
           { c: ["Viracopos", "26", "18", "abr/2026"], hl: true },
           { c: ["Afonso Pena", "14", "10", "out/2025"] },
           { c: ["Lisboa", "9", "5", "jan/2025"] },
           { c: ["Confins", "3", "3", "fev/2025"] },
           { c: ["Congonhas", "3", "3", "fev/2025"] },
           { c: ["Navegantes", "3", "3", "ago/2026"] },
           { c: ["Recife", "1", "1", "ago/2026"] },
         ],
         { cls: "compact" },
       )}
     </div>
   </div>`,
);

/* 5 furo confins */
push(
  `<div class="alert">
     <p class="al-kick">O que precisa ser dito antes de tudo</p>
     <h2 class="h-xl">Confins não tem<br>nenhum parceiro</h2>
     <div class="al-grid">
       <div><span class="al-n">0</span><span class="al-l">unidades em Confins</span></div>
       <div><span class="al-n">6</span><span class="al-l">lotes só mapeados</span></div>
       <div><span class="al-n">3</span><span class="al-l">parceiros em Guarulhos</span></div>
       <div><span class="al-n">2</span><span class="al-l">em Viracopos e em Curitiba</span></div>
     </div>
     <p class="al-body">O plano segue de pé, o que muda é o CTA. Em Confins o conteúdo alimenta a vitrine de lote mapeado e a captação de parceiro, nunca a reserva. Ranquear antes de ter oferta é o caminho certo, porque a página pronta é o argumento que fecha o parceiro. <b>Meta associada: fechar um parceiro em Confins até a semana 9.</b></p>
   </div>`,
  "navy",
);

/* 6 concorrência */
content(
  "Leitura de SERP em 25/08/2026",
  "Quem já está na frente",
  `${table(
    ["Concorrente", "O que faz bem", "O que não cobre"],
    [
      ["Bandeira Park", "Comparativo com carimbo mensal. Citado na visão geral de IA", "Convênio, tag, terminal, moto"],
      ["ParkMundo", "Uma página por consulta de preço", "Preço vivo, prova de método"],
      ["xpark.ai", "Índice de preços, calculadora e guia por aeroporto", "Cauda longa de benefício e de setor"],
      ["Zul+", "Autoridade de marca em mobilidade", "Especificidade por lote"],
      ["Indigo Neo e GRU Airport", "É o oficial, ganha a consulta oficial por definição", "Comparação honesta com o mais barato"],
    ],
  )}
  <p class="note big">O comparativo de preço já está disputado. A cauda longa de benefício, de setor de terminal e de operação está <b>vazia</b>.</p>`,
  { wide: true },
);

/* 7 as quatro alavancas */
content(
  "O plano em uma tela",
  "As quatro alavancas",
  cards(
    [
      { n: "1", t: "Ganhar o bloco de perguntas", d: "Toda pergunta do bloco “As pessoas também perguntam” vira página própria em /faq, com FAQPage no HTML." },
      { n: "2", t: "Entrar na lista do Modo IA", d: "Bloco de fato citável por unidade: entidade, número, unidade e data. Adjetivo não sobrevive à extração." },
      { n: "3", t: "Medir onde está a demanda", d: "1.282 termos coletados e agrupados em 16 clusters de intenção, com método de calibração declarado." },
      { n: "4", t: "Ocupar a cauda longa órfã", d: "Seis clusters com demanda confirmada e zero conteúdo dedicado na SERP brasileira." },
    ],
    "four",
  ),
);

/* 8 alavanca 1 */
section(
  "1",
  "Alavanca 1",
  "Ganhar o bloco<br>de perguntas",
  "O Google monta o bloco com trechos que respondem de forma isolada, curta e literal. Ele prefere página cujo título é a pergunta inteira, com a resposta em 40 a 60 palavras logo abaixo.",
  3,
);

/* 9 o buraco do PAA */
content(
  "Bloco real de Guarulhos",
  "Das 4 perguntas, a Movepark responde 2",
  `${table(
    ["Pergunta do bloco", "Situação hoje"],
    [
      ["Qual o valor do estacionamento no aeroporto de Guarulhos?", "<span class='ok'>Coberta</span> por “Quanto custa estacionar no Aeroporto de Guarulhos?”"],
      ["Qual o melhor estacionamento para deixar o carro no aeroporto de Guarulhos?", "<span class='ko'>Vazio</span>. Existe só “o mais barato”, que é outra intenção"],
      ["Quanto custa o estacionamento no Terminal 3 do Aeroporto de Guarulhos?", "<span class='ko'>Vazio</span>. Nenhuma página fala de terminal"],
      ["Como pagar mais barato no estacionamento do aeroporto de Guarulhos?", "<span class='ko'>Vazio</span>"],
    ],
  )}
  <p class="note big">A página <b>movepark.co/faq/quanto-custa-estacionar-no-aeroporto-de-guarulhos</b> já ranqueia hoje. O formato funciona, falta cobertura.</p>`,
  { wide: true },
);

/* 10 ação alavanca 1 */
content(
  "A ação",
  "De 8 para 24 perguntas por aeroporto",
  `${lead("As perguntas saem da coleta real de autocomplete, não de brainstorm. Cada uma nasce como página em /faq e vira um título de seção no post do aeroporto. Uma pergunta, duas superfícies, zero resposta duplicada.")}
   ${table(
     ["Aeroporto", "Perguntas com demanda confirmada, prontas para virar FAQ"],
     [
       ["Guarulhos", "quanto custa · qual o valor da diária · qual o melhor · qual o mais barato · qual o mais próximo · como pagar mais barato · precisa reservar · como funciona · é seguro deixar o carro · vale a pena · tem coberto · tem para moto · tem gratuito"],
       ["Viracopos", "quanto custa · quanto custa dentro do aeroporto · qual o melhor · qual o mais barato · qual o mais próximo · como funciona · como reservar · tem gratuito"],
       ["Confins", "quanto custa · quanto custa por hora · qual o valor da diária · qual o melhor · qual o mais barato · o mais barato dentro do aeroporto · qual o mais próximo · como funciona · tem para moto"],
       ["Afonso Pena", "quanto custa a diária · quanto custa a hora · qual o valor · qual o mais barato · como funciona · como reservar · onde deixar o carro · tem gratuito"],
     ],
     { cls: "kw" },
   )}`,
  { wide: true },
);

/* 11 alavanca 2 */
section(
  "2",
  "Alavanca 2",
  "Entrar na lista<br>do Modo IA",
  "A visão geral de IA cita o bloco de fato mais fácil de extrair. Bandeira Park e Airport Park entraram no print porque suas páginas trazem entidade, preço e traslado na mesma frase.",
  4,
);

/* 12 formato citável */
content(
  "O formato que a IA copia",
  "Entidade, número, unidade e condição",
  `<div class="formula">
     <div class="fx-bad"><span class="fx-tag">Não sobrevive à extração</span><p>“Estacionamento seguro, prático e com ótimo custo-benefício perto do aeroporto.”</p></div>
     <div class="fx-good"><span class="fx-tag good">Vira citação</span><p>“O <b>Aerovalet Guarulhos</b> fica a <b>4,5 km</b> do terminal e a diária online sai por <b>R$ 18,90</b> em agosto de 2026, com <b>R$ 111,30</b> na semana.”</p></div>
   </div>
   ${table(
     ["Aeroporto", "Menor diária online", "7 diárias", "Distância", "Traslado"],
     [
       { c: ["Guarulhos", "R$ 18,90 <span class='mut'>Aerovalet, descoberta</span>", "R$ 111,30 <span class='mut'>R$ 15,90/dia</span>", "4,5 km", "conforme a unidade"], hl: true },
       { c: ["Viracopos", "R$ 40,00 <span class='mut'>Virapark, coberta</span>", "R$ 174,30 <span class='mut'>R$ 24,90/dia</span>", "3,7 km", "sim"] },
       { c: ["Afonso Pena", "a partir de 3 diárias <span class='mut'>Abbapark</span>", "R$ 118,30 <span class='mut'>R$ 16,90/dia</span>", "2,6 km", "5 min"] },
       { c: ["Confins", "<span class='ko'>sem parceiro</span>", "<span class='ko'>sem parceiro</span>", "6 lotes mapeados", "a confirmar"] },
     ],
   )}
   <p class="note">Motor de reservas em 25/08/2026. Todo valor publicado carrega data e link para o preço vivo: é o que separa a Movepark de um índice coletado à mão.</p>`,
  { wide: true },
);

/* 13 alavanca 3 */
section(
  "3",
  "Alavanca 3",
  "Medir onde<br>está a demanda",
  "Não existe ferramenta de volume ligada ao projeto, e volume sem fonte é chute. No lugar disso, 1.282 termos únicos coletados do autocomplete do Google. O Google só sugere consulta que tem volume real.",
  5,
);

/* 14 matriz de clusters */
content(
  "1.282 termos coletados em 25/08/2026",
  "Onde está a demanda, cluster a cluster",
  `${table(
    ["Cluster de intenção", "GRU", "VCP", "CNF", "CWB", "Total", "Leitura"],
    [
      { c: ["preço, valor, diária", "70", "29", "27", "37", "<b>163</b>", "maior demanda, já disputado"] },
      { c: ["proximidade", "38", "33", "21", "17", "<b>109</b>", "casa com a vitrine"] },
      { c: ["barato, economia, desconto", "33", "15", "23", "17", "<b>88</b>", "disputado por comparador"] },
      { c: ["terminal e setor", "61", "3", "11", "4", "<b>79</b>", "<span class='ko'>quase ninguém cobre</span>"], hl: true },
      { c: ["convênio e benefício", "40", "8", "14", "6", "<b>68</b>", "<span class='ko'>ninguém cobre</span>"], hl: true },
      { c: ["reserva e como funciona", "15", "3", "10", "8", "<b>36</b>", "fundo de funil"] },
      { c: ["melhor, comparativo", "13", "3", "5", "7", "<b>28</b>", "é a pergunta do bloco"] },
      { c: ["segurança e prova social", "13", "4", "5", "3", "<b>25</b>", "quebra de objeção"] },
      { c: ["coberto e descoberto", "13", "7", "2", "2", "<b>24</b>", "casa com tipo de vaga"] },
      { c: ["tag de pedágio", "6", "1", "5", "4", "<b>16</b>", "<span class='ko'>ninguém cobre</span>"], hl: true },
      { c: ["mensal e longa estadia", "10", "1", "3", "1", "<b>15</b>", "ticket alto"] },
      { c: ["moto", "4", "1", "3", "3", "<b>11</b>", "<span class='ko'>ninguém cobre</span>"], hl: true },
      { c: ["24 horas e horário", "4", "3", "2", "2", "<b>11</b>", ""] },
      { c: ["traslado e transfer", "5", "3", "1", "1", "<b>10</b>", ""] },
      { c: ["gratuito", "1", "2", "1", "3", "<b>7</b>", "responder e redirecionar"] },
      { c: ["serviço extra", "2", "0", "1", "1", "<b>4</b>", ""] },
    ],
    { cls: "num tight" },
  )}`,
  { wide: true },
);

/* 15 calibração */
content(
  "Honestidade de método",
  "Como calibrar o volume absoluto",
  `${cards([
    { n: "01", t: "Search Console", d: "O movepark.co já é propriedade de domínio. Exportar 16 meses por consulta dá volume real de impressão, melhor que estimativa de terceiro." },
    { n: "02", t: "Keyword Planner", d: "Conta de Google Ads, mesmo sem campanha ativa, devolve faixa de volume. Faixa larga, mas ancora a ordem de grandeza." },
    { n: "03", t: "A regra de decisão", d: "Cluster entra na pauta quando aparece no autocomplete, tem impressão no Search Console e a SERP não tem resposta específica. Dois de três já justifica teste." },
  ])}
  <p class="note big">A contagem de variações do autocomplete é proxy de <b>amplitude</b> de demanda, não de volume absoluto. Isso está declarado de propósito: o plano não finge precisão que não tem.</p>`,
);

/* 16 alavanca 4 */
section(
  "4",
  "Alavanca 4",
  "Ocupar a cauda<br>longa órfã",
  "Seis clusters com demanda confirmada no autocomplete e nenhum conteúdo dedicado na SERP brasileira. É aqui que o plano ganha em vez de empatar.",
  6,
);

/* 17 seis clusters */
content(
  "Demanda confirmada, zero concorrência",
  "Os seis clusters vazios",
  cards(
    [
      { n: "68", t: "Convênio e cartão", d: "Itaú Personnalité, Porto Seguro, OAB, Latam, Livelo, Mastercard Black, Azul Diamante. Público com cartão premium, que viaja mais e não olha centavo." },
      { n: "79", t: "Terminal e setor", d: "T1, T2, T3, edifício garagem, portão 2, P1 e P3 em Confins, área C em Curitiba, bolsão F em Viracopos. Ninguém fala essa língua." },
      { n: "25", t: "Prova social", d: "“é seguro”, “confiável”, “avaliação”, “reddit”. Buscar reddit é o sinal de que a pessoa não confia no conteúdo comercial que achou." },
      { n: "16", t: "Tag de pedágio", d: "Aceita Sem Parar, ConectCar, Veloe, Velox. Pergunta binária, custo de produção baixíssimo, vira FAQ, post e reels." },
      { n: "15", t: "Mensalista", d: "Estacionamento mensal de aeroporto, 20 e 30 dias. Ticket alto e recorrente, com spec de recorrência já no projeto." },
      { n: "11", t: "Moto", d: "O motor já tem tipo motorcycle e o índice de preços já separa moto de carro. É conteúdo com produto pronto atrás." },
    ],
    "six",
  ),
);

/* 18 aviso convênio */
push(
  `<div class="statement small">
     <p class="st-kick">O cuidado que não pode ser esquecido</p>
     <p class="st">Só publique benefício<br>que a Movepark ou o parceiro<br><span class="st-em">realmente pratica.</span></p>
     <p class="st-body">O ângulo seguro é o guia comparativo honesto: quais convênios existem no estacionamento oficial, quanto valem na prática, e em que faixa de diárias o desconto do convênio ainda perde para a reserva online em lote parceiro. Isso é comparação de fato, não promessa. ADR-009 vale para toda peça, no blog e no Instagram.</p>
   </div>`,
  "violet",
);

/* 19 fases */
section(
  "5",
  "Execução",
  "Cinco fases,<br>28 semanas",
  "Ritmo de 2 blogposts e 4 posts de Instagram por semana, sustentável por uma pessoa com apoio de IA. Cada fase tem entrega fechada, e a seguinte só começa quando a anterior está publicada.",
  9,
);

/* 20 fases 0-2 */
content(
  "Semanas 1 a 9",
  "Fundação, pergunta e preço",
  `${table(
    ["Fase", "Quando", "Entrega", "Alvo"],
    [
      { c: ["<b>Fase 0</b><br>Fundação", "semana 1", "Baseline do Search Console · calibração de volume · auditoria de canibalização · decisão sobre os 33 posts fora do ar · painel de acompanhamento · kit de marca do Instagram", "instrumentar antes de publicar"] },
      { c: ["<b>Fase 1</b><br>A pergunta", "semanas 2 a 5", "2 posts e 8 FAQ por aeroporto, na ordem GRU, VCP, CWB, CNF. Nenhum post novo sobre intenção já coberta: atualizar vence criar, e slug publicado nunca muda", "bloco de perguntas e featured snippet"], hl: true },
      { c: ["<b>Fase 2</b><br>O preço", "semanas 6 a 9", "Comparativo por aeroporto com carimbo mensal · Guarulhos por terminal (T1, T2, T3) · Confins por setor · Viracopos bolsão F · Curitiba áreas A, B e C · post “dentro ou fora do aeroporto”", "lista de opções da visão geral de IA"], hl: true },
    ],
    { cls: "fases" },
  )}`,
  { wide: true },
);

/* 21 fases 3-5 */
content(
  "Semanas 10 a 28 e depois",
  "Cauda longa, escala e defesa",
  `${table(
    ["Fase", "Quando", "Entrega", "Alvo"],
    [
      { c: ["<b>Fase 3</b><br>Cauda longa", "semanas 10 a 15", "Convênio de cartão · tags de pedágio · moto · mensalista · “é seguro deixar o carro” · voo de madrugada", "ocupar terreno sem concorrente"] },
      { c: ["<b>Fase 4</b><br>Escala nacional", "semanas 16 a 28", "Trio fixo por aeroporto: guia âncora, página de preço e 8 FAQ. Ordem por demanda e por lote mapeado: Congonhas, Galeão, Brasília, Recife, Salvador, Porto Alegre, Fortaleza e mais 11", "os 18 aeroportos com zero ou um post"] },
      { c: ["<b>Fase 5</b><br>Defesa", "contínua, a partir da 16", "Carimbo e valores atualizados por mês · revisão quinzenal das 10 páginas em queda · teste mensal de citação em ChatGPT, Gemini, Perplexity e Google · consolidação de 4 posts canibais por mês · nova coleta de autocomplete por trimestre", "conteúdo de preço apodrece rápido"] },
    ],
    { cls: "fases" },
  )}`,
  { wide: true },
);

/* 22 blogpost seção */
section(
  "6",
  "Contrato de produção",
  "A estrutura<br>obrigatória<br>do blogpost",
  "Isto não é sugestão. O analisador da skill mede a maior parte e bloqueia o que quebra o site. Post que não passa não é publicado.",
  7,
);

/* 23 esqueleto */
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
      { c: ["11", "<b>FAQ no fim</b>", "5 a 8 perguntas reais, pergunta em H3, resposta de 40 a 60 palavras", "bloco de perguntas"], hl: true },
      ["12", "Links", "1 para /destinos, 2 ou 3 internos, 1 externo com rótulo. Nunca para quem vende vaga", "SEO"],
      ["13", "Autoria e data visíveis", "Quem escreveu e quando", "E-E-A-T"],
      ["14", "CTA final", "Para /destinos/&lt;slug&gt;, sem prometer o que a unidade não declara", "conversão"],
    ],
    { cls: "esq tight" },
  )}`,
  { wide: true },
);

/* 24 limites */
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

/* 25 instagram seção */
section(
  "7",
  "Distribuição",
  "O Instagram,<br>sem ilusão",
  "Instagram não transfere autoridade para o Google e link em legenda não é backlink. O que ele entrega é busca de marca, superfície própria de busca, prova social em vídeo e reaproveitamento sem escrever nada novo.",
  8,
);

/* 26 formatos */
content(
  "Quatro formatos, molde fechado",
  "A semana de Instagram",
  cards(
    [
      { n: "A", t: "Carrossel de resposta<br><span class='cf'>2 por semana</span>", d: "O cavalo de batalha. Nasce direto do H2 do blogpost. Oito cards: a pergunta, a resposta em uma frase, quatro argumentos com número, uma tabela de no máximo 4 linhas e o convite." },
      { n: "B", t: "Reels de prova<br><span class='cf'>1 por semana</span>", d: "15 a 30 segundos gravados no lote. Gancho falado nos 2 primeiros segundos, resposta com número na tela, a prova (o carro entrando, a van saindo, o cronômetro) e o fechamento." },
      { n: "C", t: "Story de bastidor<br><span class='cf'>2 por semana</span>", d: "Enquete direta e caixa de pergunta. A resposta vira o carrossel da semana seguinte. Story serve para descobrir pauta, e a entrega vem no carrossel." },
      { n: "D", t: "Post estático de dado<br><span class='cf'>1 a cada 15 dias</span>", d: "Um número grande, uma frase de contexto, a data. É o formato mais compartilhado e o que mais gera salvamento." },
    ],
    "four",
  ),
);

/* 27 regras instagram */
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

/* 28 pipeline */
content(
  "O reaproveitamento",
  "Um blogpost vira uma semana inteira",
  `<div class="pipe">
     <div class="pipe-src"><span class="ps-k">Fonte única</span><span class="ps-t">Blogpost<br>publicado</span></div>
     <div class="pipe-arrow"></div>
     <div class="pipe-out">
       <div class="po"><span class="po-in">H2 principal</span><span class="po-out">Carrossel de 8 cards</span></div>
       <div class="po"><span class="po-in">Tabela de preço</span><span class="po-out">Post estático de um número</span></div>
       <div class="po"><span class="po-in">FAQ mais buscada</span><span class="po-out">Reels de 30 segundos no lote</span></div>
       <div class="po"><span class="po-in">Objeção do texto</span><span class="po-out">Story com enquete e caixa de pergunta</span></div>
     </div>
   </div>
   <p class="note big">Nada é escrito duas vezes. O post é a fonte, o Instagram é a distribuição.</p>`,
  { wide: true },
);

/* 29 métricas */
content(
  "Como saber se está funcionando",
  "Métricas e metas",
  `${table(
    ["Métrica", "Hoje", "90 dias", "180 dias"],
    [
      ["Consultas em posição 1 a 3", "a medir na Fase 0", "25", "80"],
      { c: ["Blocos de perguntas ocupados nos 4 aeroportos", "2 de 16", "10 de 16", "14 de 16"], hl: true },
      { c: ["Citações em visão geral de IA e Modo IA", "0 conhecidas", "4", "12"], hl: true },
      ["Cliques orgânicos do blog por mês", "a medir", "+40%", "+120%"],
      ["Páginas de FAQ indexadas", "a medir", "96", "200"],
      ["Posts canibais consolidados", "0 de cerca de 30", "12", "30"],
      ["Aeroportos com trio completo", "0", "4", "12"],
    ],
    { cls: "num" },
  )}
  <p class="note big">Não existe painel de citação em IA. O método é manual e é o único confiável hoje: rodar as 12 consultas principais em ChatGPT, Gemini, Perplexity e no Google todo mês, e registrar com print quem foi citado.</p>`,
  { wide: true },
);

/* 30 escala */
section(
  "8",
  "Fase 4",
  "Depois dos<br>quatro, o país",
  "18 aeroportos publicados com zero ou um post. O molde já validado nas fases 1 a 3 vira produção industrial: guia âncora, página de preço e 8 FAQ por aeroporto. Ordem de ataque por demanda e por lote já mapeado.",
  10,
);

/* 31 fechamento */
push(
  `<div class="close">
     <p class="cl-kick">O que precisa ser decidido agora</p>
     <h2 class="h-xl">Três decisões<br>destravam a semana 1</h2>
     <div class="cl-grid">
       <div class="cl-item"><span class="cl-n">01</span><h3>Confins tem prazo comercial?</h3><p>O conteúdo de CNF entra na Fase 1 de qualquer jeito. A pergunta é se existe meta de fechar parceiro até a semana 9, porque isso muda o CTA de captação para reserva.</p></div>
       <div class="cl-item"><span class="cl-n">02</span><h3>Quem escreve e quem grava?</h3><p>2 posts e 4 peças de Instagram por semana é o teto de uma pessoa com apoio de IA. O reels exige alguém no lote, com celular, uma vez por semana.</p></div>
       <div class="cl-item"><span class="cl-n">03</span><h3>Os outros 84 ganham FAQ?</h3><p>O post já emite FAQPage da FAQ escrita nele, e 11 dos 95 herdados já entraram sozinhos. Retrofitar a FAQ nos mais clicados entre os 84 restantes é trabalho de escrita, não de código.</p></div>
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

/* rodapé */
.foot{position:absolute;left:110px;right:110px;bottom:44px;display:flex;align-items:center;
  gap:24px;font-size:20px;color:var(--mut2);font-weight:500;border-top:1px solid var(--hair);padding-top:22px}
.fb{color:var(--violet);font-weight:700}
.fd{flex:1}
.fp{font-weight:700;color:var(--mut)}
.navy .foot,.violet .foot{border-color:rgba(255,255,255,.18);color:rgba(255,255,255,.55)}
.navy .fb,.violet .fb{color:#fff}
.navy .fp,.violet .fp{color:rgba(255,255,255,.8)}

/* tipografia */
.kicker{font-size:24px;font-weight:600;color:var(--violet);letter-spacing:.2px;margin-bottom:18px}
.h-cover{font-size:126px;font-weight:800;line-height:.98;letter-spacing:-4px;color:#fff}
.h-xl{font-size:104px;font-weight:800;line-height:1.02;letter-spacing:-3px;color:var(--navy)}
.h-lg{font-size:76px;font-weight:800;line-height:1.05;letter-spacing:-2px;color:var(--navy);margin-bottom:26px}
.lead{font-size:29px;line-height:1.5;color:var(--body);max-width:1180px;font-weight:400}
.lead b{font-weight:700;color:var(--ink)}
.note{font-size:24px;line-height:1.5;color:var(--mut);margin-top:22px}
.note.big{font-size:27px;color:var(--body);margin-top:30px;padding-left:22px;border-left:5px solid var(--violet)}
.note b{color:var(--ink);font-weight:700}
.mut{color:var(--mut2);font-weight:500;font-size:.82em}
.ok{color:var(--ok);font-weight:700}
.ko{color:var(--ko);font-weight:700}
.hl-violet{color:var(--violet-l)}

/* capa */
.cover{background:var(--navy);padding:0}
.cover-grid{display:grid;grid-template-columns:1fr 810px;height:100%;align-items:center;
  padding:0 0 0 120px;gap:40px}
.cv-kick{font-size:26px;font-weight:600;color:var(--violet-l);margin-bottom:44px;letter-spacing:.3px}
.cv-sub{font-size:31px;line-height:1.48;color:rgba(255,255,255,.72);max-width:800px;margin-top:52px;font-weight:400}
.cv-img{height:100%;display:flex;align-items:center;justify-content:center;position:relative;padding-right:110px}
.cv-img::before{content:'';position:absolute;width:880px;height:880px;border-radius:50%;right:20px;
  background:radial-gradient(circle,rgba(93,95,239,.55) 0%,rgba(41,38,63,0) 70%)}
.cv-img img{width:100%;max-width:700px;position:relative;border-radius:40px;
  box-shadow:0 50px 120px rgba(0,0,0,.45)}

/* statement */
.violet{background:var(--violet)}
.navy{background:var(--navy)}
.statement{flex:1;display:flex;flex-direction:column;justify-content:center;padding-bottom:60px}
.st-kick{font-size:26px;font-weight:600;color:rgba(255,255,255,.62);margin-bottom:40px}
.st{font-size:96px;font-weight:800;line-height:1.08;letter-spacing:-2.5px;color:rgba(255,255,255,.55)}
.st-em{color:#fff}
.statement.small .st{font-size:80px}
.st-body{font-size:28px;line-height:1.55;color:rgba(255,255,255,.78);max-width:1360px;margin-top:52px}
.st-body b{color:#fff;font-weight:700}

/* seção com imagem */
.sec{display:grid;grid-template-columns:1fr 640px;gap:70px;flex:1;align-items:center;padding-bottom:70px}
.sec-txt{max-width:1000px}
.bignum{font-size:150px;font-weight:800;line-height:.8;color:var(--violet-l);letter-spacing:-6px;margin-bottom:26px}
.sec-txt .kicker{margin-bottom:14px}
.sec-txt .lead{margin-top:34px;font-size:30px}
.sec-img{display:flex;align-items:center;justify-content:center}
.sec-img img{width:100%;max-height:700px;object-fit:contain}

/* conteúdo */
.cnt{flex:1;padding-bottom:110px;display:flex;flex-direction:column;justify-content:center}
.cnt.wide .h-lg{font-size:66px;margin-bottom:22px}

/* split */
.split{display:grid;grid-template-columns:1fr 780px;gap:80px;flex:1;align-items:center;padding-bottom:110px}
.split-txt .lead{margin-top:8px}

/* cards */
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:26px;margin-top:38px}
.cards.four{grid-template-columns:repeat(4,1fr);gap:24px;margin-top:46px}
.cards.six{grid-template-columns:repeat(3,1fr);gap:24px;margin-top:36px}
.cards.dense{grid-template-columns:repeat(4,1fr);gap:20px;margin-top:34px}
.cards.dense .card{padding:26px 24px}
.cards.dense .cn{font-size:40px;margin-bottom:12px}
.cards.dense .card h3{font-size:25px;margin-bottom:10px}
.cards.dense .card p{font-size:20px;line-height:1.45}
.card{background:var(--soft);border:1px solid var(--hair);border-radius:22px;padding:34px 32px}
.cards.four .card{padding:38px 32px}
.cn{font-size:44px;font-weight:800;color:var(--violet);line-height:1;margin-bottom:18px;letter-spacing:-1.5px}
.cards.four .cn{font-size:56px}
.card h3{font-size:29px;font-weight:700;color:var(--navy);margin-bottom:12px;line-height:1.2}
.cards.four .card h3{font-size:31px}
.card p{font-size:23px;line-height:1.48;color:var(--body)}
.cards.four .card p{font-size:22px}
.cf{display:block;font-size:20px;font-weight:600;color:var(--violet);margin-top:6px}

/* tabelas */
.tb{width:100%;border-collapse:collapse;margin-top:28px;font-size:25px}
.tb th{text-align:left;font-size:20px;font-weight:700;color:var(--mut);
  padding:0 20px 16px;border-bottom:2px solid var(--navy);letter-spacing:.3px}
.tb td{padding:18px 20px;border-bottom:1px solid var(--hair);color:var(--body);line-height:1.4;vertical-align:top}
.tb td.first{font-weight:600;color:var(--ink)}
.tb tr.hl td{background:var(--violet-xl)}
.tb tr.hl td.first{color:var(--violet-d)}
.tb.compact td{padding:13px 20px;font-size:23px}
.tb.compact{font-size:23px}
.tb.num td:not(.first){text-align:center}
.tb.num td:last-child{text-align:left}
.tb.num th:not(:first-child){text-align:center}
.tb.num th:last-child{text-align:left}
.tb.kw td{font-size:22px;line-height:1.5}
.tb.kw td.first{font-size:26px;white-space:nowrap}
.tb.esq td{padding:11px 18px;font-size:22px}
.tb.esq th{font-size:19px}
.tb.esq.tight td{padding:7px 16px;font-size:20px}
.tb.esq td:first-child{color:var(--violet);font-weight:800;width:56px;text-align:center}
.tb.tight{font-size:20px;margin-top:20px}
.tb.tight th{font-size:18px;padding:0 16px 12px}
.tb.tight td{padding:7px 16px;font-size:20px;line-height:1.3}
.tb.fases td{padding:26px 22px}
.tb.fases td.first{font-size:28px;line-height:1.25;white-space:nowrap}
.tb b{color:var(--ink);font-weight:700}

/* fórmula citável */
.formula{display:grid;grid-template-columns:1fr 1fr;gap:26px;margin:34px 0 8px}
.fx-bad,.fx-good{border-radius:20px;padding:30px 32px}
.fx-bad{background:#fdf2f0;border:1px solid #f5d5cf}
.fx-good{background:var(--violet-xl);border:1px solid var(--violet-l)}
.fx-tag{display:inline-block;font-size:19px;font-weight:700;color:var(--ko);margin-bottom:14px}
.fx-tag.good{color:var(--violet-d)}
.fx-bad p,.fx-good p{font-size:26px;line-height:1.45;color:var(--body)}
.fx-good p b{color:var(--navy);font-weight:800}

/* alerta navy */
.alert{flex:1;padding-bottom:80px;display:flex;flex-direction:column;justify-content:center}
.al-kick{font-size:26px;font-weight:600;color:var(--violet-l);margin-bottom:22px}
.alert .h-xl{color:#fff;font-size:96px}
.al-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;margin:56px 0 44px}
.al-grid>div{border-left:4px solid var(--violet);padding-left:26px}
.al-n{display:block;font-size:88px;font-weight:800;color:#fff;line-height:1;letter-spacing:-3px}
.al-l{display:block;font-size:23px;color:rgba(255,255,255,.6);margin-top:12px;line-height:1.35}
.al-body{font-size:28px;line-height:1.55;color:rgba(255,255,255,.75);max-width:1500px}
.al-body b{color:#fff;font-weight:700}

/* pipeline */
.pipe{display:grid;grid-template-columns:340px 90px 1fr;gap:0;align-items:center;margin-top:44px}
.pipe-src{background:var(--navy);border-radius:24px;padding:44px 36px;color:#fff}
.ps-k{display:block;font-size:20px;font-weight:600;color:var(--violet-l);margin-bottom:14px}
.ps-t{display:block;font-size:44px;font-weight:800;line-height:1.1;letter-spacing:-1px}
.pipe-arrow{height:4px;background:linear-gradient(90deg,var(--navy),var(--violet))}
.pipe-out{display:flex;flex-direction:column;gap:16px}
.po{display:grid;grid-template-columns:340px 1fr;gap:24px;align-items:center;
  background:var(--soft);border:1px solid var(--hair);border-radius:18px;padding:24px 30px}
.po-in{font-size:24px;font-weight:700;color:var(--violet);}
.po-out{font-size:26px;color:var(--body)}

/* fechamento */
.close{flex:1;display:flex;flex-direction:column;justify-content:center;padding-bottom:70px}
.cl-kick{font-size:26px;font-weight:600;color:var(--violet-l);margin-bottom:22px}
.close .h-xl{color:#fff;font-size:92px}
.cl-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:30px;margin:60px 0 46px}
.cl-item{border-top:3px solid var(--violet);padding-top:26px}
.cl-n{display:block;font-size:24px;font-weight:800;color:var(--violet-l);margin-bottom:14px}
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
