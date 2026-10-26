#!/usr/bin/env node
/**
 * Analisador de conteúdo de Instagram da Movepark.
 *
 * Por que existe: "a legenda ficou boa" é opinião. O que quebra a publicação é
 * medível (JPEG, 1.440px, 10 slides, 2.200 caracteres, 30 hashtags) e o que
 * quebra a marca também (travessão, promessa de transação, R$ sem data). Sem
 * medida, o corte escrito por um modelo passa com travessão e com hashtag
 * proibida, e ninguém percebe até estar publicado.
 *
 * Ele não substitui leitura humana: tom, veracidade do número e escolha da foto
 * continuam sendo trabalho de quem escreve. Ver ../SKILL.md.
 *
 * Uso:
 *   node .claude/skills/instagram/scripts/analisar-carrossel.mjs <rascunho.md>
 *   node ... <rascunho.md> --json        # saída para máquina
 *   node ... <rascunho.md> --silencioso  # só o resumo e os problemas
 *   node ... <rascunho.md> --hoje=2026-10-21  # fixa o "hoje" da validade (teste)
 *
 * Entrada: markdown com o front matter descrito no SKILL.md ("O arquivo de
 * trabalho"). O corpo depois do front matter é a legenda, hashtags inclusive.
 * Saída: relatório por grupo. Código de saída 1 se houver qualquer vermelho.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const BANCO = JSON.parse(fs.readFileSync(path.join(AQUI, "hashtags.json"), "utf8"));

const args = process.argv.slice(2);
const arquivo = args.find((a) => !a.startsWith("--"));
const flag = (n) => args.includes(`--${n}`);
const valorFlag = (n) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

if (!arquivo) {
  console.error("uso: analisar-carrossel.mjs <rascunho.md> [--json] [--silencioso]");
  process.exit(2);
}

// ---------------------------------------------------------------- utilidades

const semAcento = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "");
const norm = (s) =>
  semAcento(s).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const kebab = (s) => norm(s).replace(/\s+/g, "-");

/** O texto visível de uma cena HTML do reel: o body sem tags, sem estilo e sem comentário. */
function textoDaCena(html) {
  const corpo = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html.replace(/<!--[\s\S]*?-->/g, ""))?.[1] ?? "";
  return corpo
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Front matter em `chave: valor`, com lista simples em `chave: [a, b]` e a
 * lista de objetos de `slides:` (itens `- chave: valor` indentados).
 */
function lerFrontMatter(bruto) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(bruto);
  if (!m) return { meta: {}, corpo: bruto };
  const meta = {};
  const linhas = m[1].split(/\r?\n/);
  let chaveLista = null;
  for (const linha of linhas) {
    const item = /^\s+-\s+(\w+):\s*(.*)$/.exec(linha);
    if (item && chaveLista) {
      meta[chaveLista].push({ [item[1]]: item[2].trim() });
      continue;
    }
    const cont = /^\s+(\w+):\s*(.*)$/.exec(linha);
    if (cont && chaveLista && meta[chaveLista].length) {
      meta[chaveLista][meta[chaveLista].length - 1][cont[1]] = cont[2].trim();
      continue;
    }
    const par = /^(\w+):\s*(.*)$/.exec(linha);
    if (!par) continue;
    const [, chave, valorBruto] = par;
    const valor = valorBruto.trim();
    if (valor === "") { chaveLista = chave; meta[chave] = []; continue; }
    chaveLista = null;
    meta[chave] = /^\[.*\]$/.test(valor)
      ? valor.slice(1, -1).split(",").map((v) => v.trim()).filter(Boolean)
      : valor;
  }
  return { meta, corpo: bruto.slice(m[0].length) };
}

const achados = [];
const push = (nivel) => (grupo, titulo, texto) => achados.push({ nivel, grupo, titulo, texto });
const verde = push("verde");
const laranja = push("laranja");
const vermelho = push("vermelho");

const G_ENTRADA = "Entrada";
const G_LEGENDA = "Legenda";
const G_CHAVE = "Palavra-chave";
const G_HASH = "Hashtags";
const G_CTA = "CTA";
const G_IMG = "Imagens e alt";
const G_MARCA = "Marca e ADR";
const G_NOTICIA = "Notícia";
const G_VIDEO = "Vídeo";

/** Dia corrido (inteiro) de uma data `AAAA-MM-DD`, com ou sem hora depois. */
const dia = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ""));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86_400_000 : null;
};
const HOJE = valorFlag("hoje") ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

// ------------------------------------------------------------------- leitura

const bruto = fs.readFileSync(arquivo, "utf8");
const { meta, corpo } = lerFrontMatter(bruto);

const linhasCorpo = corpo.split(/\r?\n/);
const linhaHashtags = [...linhasCorpo].reverse().find((l) => /^\s*#\w/.test(l)) || "";
const legenda = corpo.replace(linhaHashtags, "").trim();
const primeiraLinha = (legenda.split(/\r?\n/).find((l) => l.trim()) || "").trim();
const gancho = legenda.slice(0, 125);
const legendaCompleta = corpo.trim();

// ------------------------------------------------------------------- entrada

const TIPOS = ["carrossel", "post", "reel", "story"];
if (!meta.tipo) vermelho(G_ENTRADA, "tipo", "Front matter sem `tipo`.");
else if (!TIPOS.includes(meta.tipo)) vermelho(G_ENTRADA, "tipo", `\`${meta.tipo}\` não é válido. Use: ${TIPOS.join(", ")}.`);
else verde(G_ENTRADA, "tipo", meta.tipo);

for (const campo of ["origem_post", "destination", "keyphrase", "publicar_em"]) {
  if (!meta[campo]) laranja(G_ENTRADA, campo, `Front matter sem \`${campo}\`.`);
  else verde(G_ENTRADA, campo, String(meta[campo]));
}

const slides = Array.isArray(meta.slides) ? meta.slides : [];
const ehCarrossel = meta.tipo === "carrossel";
// O prefixo `fato-` é o formato de origem da fila de publicação (draft_key) para
// a pauta de notícia. Ver ../references/noticias.md.
const ehNoticia = String(meta.origem_post || "").startsWith("fato-");
if (ehCarrossel && !slides.length) vermelho(G_ENTRADA, "slides", "Carrossel sem lista de `slides`.");

// ------------------------------------------------------------------- legenda

if (!legendaCompleta) {
  vermelho(G_LEGENDA, "Legenda", "Arquivo sem legenda depois do front matter.");
} else if (legendaCompleta.length > 2200) {
  vermelho(G_LEGENDA, "Tamanho", `${legendaCompleta.length} caracteres. O limite duro do Instagram é 2.200.`);
} else if (legendaCompleta.length < 180) {
  laranja(G_LEGENDA, "Tamanho", `${legendaCompleta.length} caracteres. Curto demais para sustentar gancho, corpo e CTA.`);
} else {
  verde(G_LEGENDA, "Tamanho", `${legendaCompleta.length} de 2.200 caracteres.`);
}

if (primeiraLinha.length > 125) {
  laranja(G_LEGENDA, "Gancho", `A primeira linha tem ${primeiraLinha.length} caracteres e só 125 aparecem antes do "mais". Corte ou quebre.`);
} else if (primeiraLinha.length < 25) {
  laranja(G_LEGENDA, "Gancho", `Primeira linha com ${primeiraLinha.length} caracteres. Curta demais para prender.`);
} else {
  verde(G_LEGENDA, "Gancho", `${primeiraLinha.length} caracteres, dentro dos 125 visíveis.`);
}

const blocos = legenda.split(/\n\s*\n/).filter((b) => b.trim()).length;
if (blocos < 3) laranja(G_LEGENDA, "Blocos", `${blocos} blocos. A legenda escaneável tem gancho, corpo e CTA separados por linha em branco.`);
else verde(G_LEGENDA, "Blocos", `${blocos} blocos.`);

const linhaLonga = legenda.split(/\r?\n/).find((l) => l.trim().length > 200);
if (linhaLonga) laranja(G_LEGENDA, "Linha longa", `Uma linha passa de 200 caracteres. No celular vira parede de texto.`);
else verde(G_LEGENDA, "Linha longa", "Nenhuma linha acima de 200 caracteres.");

const emojis = (legendaCompleta.match(/\p{Extended_Pictographic}/gu) || []).length;
if (emojis > 6) laranja(G_LEGENDA, "Emoji", `${emojis} emojis. A voz da marca usa no máximo um por bloco de lista.`);
else verde(G_LEGENDA, "Emoji", `${emojis} emojis.`);

// -------------------------------------------------------------- palavra-chave

const chave = meta.keyphrase ? norm(meta.keyphrase) : "";

// A frase-chave raramente cabe inteira e contígua num alt ou num nome de
// arquivo, que não repetem preposição. Exigir substring exata reprovaria alt
// bom, então o critério é cobertura das palavras de conteúdo. O mesmo critério
// serve aos dois lugares, para não existirem duas definições de "carrega a
// frase-chave" divergindo entre si.
const STOP = new Set(["no", "na", "de", "do", "da", "em", "o", "a", "os", "as", "para", "por", "com", "que"]);
const relevantes = chave.split(" ").filter((w) => w.length > 2 && !STOP.has(w));
const alvo = Math.min(2, relevantes.length);
const cobreChave = (texto) =>
  relevantes.filter((w) => norm(texto).includes(w)).length >= alvo;

if (!chave) {
  vermelho(G_CHAVE, "Frase-chave", "Front matter sem `keyphrase`. Sem ela o corte não herda a busca do post.");
} else {
  const noGancho = norm(gancho).includes(chave);
  if (!noGancho) vermelho(G_CHAVE, "No gancho", `"${meta.keyphrase}" não aparece nos primeiros 125 caracteres. É o trecho que o Google mostra.`);
  else verde(G_CHAVE, "No gancho", "Presente nos 125 caracteres visíveis.");

  const ocorrencias = norm(legendaCompleta).split(chave).length - 1;
  if (ocorrencias === 0) vermelho(G_CHAVE, "Na legenda", "A frase-chave não aparece na legenda.");
  else if (ocorrencias > 4) laranja(G_CHAVE, "Na legenda", `${ocorrencias} ocorrências. Acima de 4 soa robótico e não sobe nada.`);
  else verde(G_CHAVE, "Na legenda", `${ocorrencias} ocorrências.`);

  const alts = slides.map((s) => s.alt || "");
  if (alts.length && !alts.some(cobreChave))
    laranja(G_CHAVE, "No alt", `Nenhum alt cobre ${alvo} das palavras de conteúdo da frase-chave. O alt é indexado pelo Google desde 07/2025.`);
  else if (alts.length) verde(G_CHAVE, "No alt", "Presente em pelo menos um alt.");
}

// ------------------------------------------------------------------ hashtags

const tags = (linhaHashtags.match(/#[\wÀ-ſ]+/g) || []).map((t) => norm(t.slice(1)).replace(/\s/g, ""));
if (!tags.length) {
  vermelho(G_HASH, "Quantidade", "Nenhuma hashtag na legenda.");
} else if (tags.length > 30) {
  vermelho(G_HASH, "Quantidade", `${tags.length} hashtags. O limite duro do Instagram é 30 e a publicação é recusada.`);
} else if (tags.length > 5) {
  laranja(G_HASH, "Quantidade", `${tags.length} hashtags. O recomendado é de 3 a 5; bloco grande lê como spam.`);
} else if (tags.length < 3) {
  laranja(G_HASH, "Quantidade", `${tags.length} hashtags. Faltam camadas (praça, intenção, marca).`);
} else {
  verde(G_HASH, "Quantidade", `${tags.length} hashtags.`);
}

const todasPraca = Object.values(BANCO.praca).flat();
const todasIntencao = Object.values(BANCO.intencao).flat();
const temPraca = tags.some((t) => todasPraca.includes(t));
const temIntencao = tags.some((t) => todasIntencao.includes(t));
const temMarca = tags.some((t) => BANCO.marca.includes(t));
if (!temPraca) laranja(G_HASH, "Camada de praça", "Nenhuma hashtag de aeroporto ou cidade. É onde mora a intenção de viagem.");
else verde(G_HASH, "Camada de praça", "Presente.");
if (!temIntencao) laranja(G_HASH, "Camada de intenção", "Nenhuma hashtag do problema que a pessoa resolve.");
else verde(G_HASH, "Camada de intenção", "Presente.");
if (!temMarca) laranja(G_HASH, "Camada de marca", "Sem `#movepark`. É acervo próprio e vai sempre por último.");
else verde(G_HASH, "Camada de marca", "Presente.");

const proibidas = tags.filter((t) => BANCO.proibidas[t]);
if (proibidas.length)
  vermelho(G_HASH, "Proibidas", proibidas.map((t) => `#${t} (${BANCO.proibidas[t]})`).join("; "));
else verde(G_HASH, "Proibidas", "Nenhuma.");

const genericasSozinhas = tags.filter((t) => BANCO.genericas_sozinhas_nao.includes(t));
if (genericasSozinhas.length && !temPraca)
  laranja(G_HASH, "Genéricas", `${genericasSozinhas.map((t) => "#" + t).join(", ")} sem hashtag de praça. Volume sem intenção.`);

const noComentario = /coment[áa]rio/i.test(corpo) && /#\w+/.test(corpo.split(/\n/).slice(-3).join("\n")) === false;
if (noComentario) laranja(G_HASH, "Local", "Hashtag parece destinada ao primeiro comentário. Ela vai na legenda: o comentário sai da indexação.");

// ----------------------------------------------------------------------- CTA

const ACOES = [
  ["ir ao link da bio", [/link da bio/i, /link na bio/i]],
  ["comentar", [/nos coment[áa]rios/i, /comenta a[íi]/i, /me conta nos coment/i]],
  ["salvar", [/salva esse post/i, /salve esse post/i]],
  ["compartilhar", [/manda para quem/i, /manda pra quem/i, /compartilha com/i]],
];
const acoesPedidas = ACOES.filter(([, rs]) => rs.some((r) => r.test(legendaCompleta)));
const ctasEncontrados = acoesPedidas.length;
if (ctasEncontrados === 0) vermelho(G_CTA, "Presença", "Nenhum CTA reconhecido. Todo post fecha com uma ação.");
else if (ctasEncontrados > 1) laranja(G_CTA, "Quantidade", `${ctasEncontrados} ações pedidas (${acoesPedidas.map(([n]) => n).join(", ")}). Uma por post: duas fazem a pessoa não escolher nenhuma.`);
else verde(G_CTA, "Presença", `Um CTA (${acoesPedidas[0][0]}).`);

if (!meta.cta_url) {
  laranja(G_CTA, "URL", "Front matter sem `cta_url`. Sem ela a atribuição do link da bio não fecha.");
} else {
  const url = String(meta.cta_url);
  if (!/utm_source=instagram/.test(url)) vermelho(G_CTA, "UTM", "`cta_url` sem `utm_source=instagram`. O tráfego chega como direto e some do relatório.");
  else if (!/utm_campaign=/.test(url)) laranja(G_CTA, "UTM", "`cta_url` sem `utm_campaign`. Não dá para separar um post do outro.");
  else verde(G_CTA, "UTM", "Completa.");
  if (/movepark\.com\.br|hub\.movepark\.co/.test(url)) vermelho(G_CTA, "Domínio", "A URL usa domínio antigo ou o `hub.`. O canônico do consumidor é `movepark.co`.");
  if (/movepark\.co\/destinos(\/|\?|$)/.test(url)) laranja(G_CTA, "Caminho", "`/destinos/` é o endereço antigo e passa por um 301. O canônico é `/estacionamentos/<public_slug>`.");
}

// ------------------------------------------------------------------- notícia

// A notícia é o único conteúdo que escreve do zero, e o que mais erra em
// público: dado velho ou sem fonte sai com a marca embaixo. Por isso cobra fonte
// citada, data e prazo de validade, que nenhum outro corte precisa.
if (ehNoticia) {
  const TEMAS = ["crise", "operacao", "acesso", "demanda", "regra", "internacional"];
  if (!meta.tema) laranja(G_NOTICIA, "Tema", `Front matter sem \`tema\`. Use: ${TEMAS.join(", ")}.`);
  else if (!TEMAS.includes(meta.tema)) laranja(G_NOTICIA, "Tema", `\`${meta.tema}\` não é tema conhecido. Use: ${TEMAS.join(", ")}.`);
  else verde(G_NOTICIA, "Tema", meta.tema);

  const fonte = meta.fonte_nome ? String(meta.fonte_nome) : "";
  if (!fonte) vermelho(G_NOTICIA, "Fonte", "Front matter sem `fonte_nome`. Notícia sem fonte não sai.");
  // Palavra inteira: "ANA" não pode passar por estar dentro de "semana".
  else if (!` ${norm(legenda)} `.includes(` ${norm(fonte)} `)) vermelho(G_NOTICIA, "Fonte na legenda", `"${fonte}" não aparece na legenda. Quem lê precisa saber quem disse.`);
  else verde(G_NOTICIA, "Fonte na legenda", fonte);

  if (!meta.fonte_url) vermelho(G_NOTICIA, "Link da fonte", "Front matter sem `fonte_url`. É ele que permite reabrir a fonte no dia de publicar.");
  else if (!/^https?:\/\/[^\s/]+\.[^\s]+/.test(meta.fonte_url)) vermelho(G_NOTICIA, "Link da fonte", "`fonte_url` não é um endereço http.");
  else verde(G_NOTICIA, "Link da fonte", String(meta.fonte_url));

  // "em 20/10", "20 de outubro": a data que acompanha a fonte no corpo.
  const DATA_NA_LEGENDA = /\b\d{1,2}\/\d{1,2}\b|\b\d{1,2}º? de (janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i;
  if (!DATA_NA_LEGENDA.test(legenda)) vermelho(G_NOTICIA, "Data na legenda", 'A legenda não traz data junto da fonte ("em 20/10", "20 de outubro").');
  else verde(G_NOTICIA, "Data na legenda", "Presente.");

  const dFonte = dia(meta.fonte_data);
  const dValidade = dia(meta.validade);
  const dPublicar = dia(meta.publicar_em);
  const dHoje = dia(HOJE);

  if (dValidade === null) {
    vermelho(G_NOTICIA, "Validade", "Front matter sem `validade` (AAAA-MM-DD). Todo fato tem prazo: a obra termina, a greve acaba.");
  } else if (dPublicar !== null && dPublicar > dValidade) {
    vermelho(G_NOTICIA, "Validade", `Agendado para ${meta.publicar_em}, depois da validade (${meta.validade}).`);
  } else if (dHoje > dValidade) {
    vermelho(G_NOTICIA, "Validade", `A validade (${meta.validade}) já passou.`);
  } else {
    verde(G_NOTICIA, "Validade", `Vale até ${meta.validade}.`);
  }

  if (dFonte === null) {
    vermelho(G_NOTICIA, "Data da fonte", "Front matter sem `fonte_data` (AAAA-MM-DD).");
  } else {
    const idade = (dPublicar ?? dHoje) - dFonte;
    if (dFonte > dHoje) vermelho(G_NOTICIA, "Data da fonte", `\`fonte_data\` (${meta.fonte_data}) está no futuro.`);
    else if (idade < 0) vermelho(G_NOTICIA, "Data da fonte", `Agendado para antes da data da fonte (${meta.fonte_data}).`);
    else if (meta.tema === "crise" && idade > 1) vermelho(G_NOTICIA, "Crise", `${idade} dias entre a fonte e a publicação. Crise sai no mesmo dia ou no seguinte, senão descarta.`);
    else if (idade > 7) laranja(G_NOTICIA, "Idade da fonte", `${idade} dias entre a fonte e a publicação. Reabra a fonte e confira se não saiu atualização.`);
    else verde(G_NOTICIA, "Idade da fonte", `${idade} dia(s) entre a fonte e a publicação.`);
  }
}

// ------------------------------------------------------------- imagens e alt

if (slides.length) {
  if (slides.length > 10) vermelho(G_IMG, "Quantidade", `${slides.length} slides. A API publica no máximo 10 por carrossel.`);
  else if (ehCarrossel && slides.length < (ehNoticia ? 3 : 4)) laranja(G_IMG, "Quantidade", `${slides.length} slides. Carrossel curto demais raramente segura o arraste.`);
  else if (ehNoticia && slides.length > 5) laranja(G_IMG, "Quantidade", `${slides.length} slides. Notícia envelhece antes de alguém arrastar até o fim: de 3 a 5.`);
  else verde(G_IMG, "Quantidade", `${slides.length} slides.`);

  const naoJpeg = slides.filter((s) => s.arquivo && !/\.jpe?g$/i.test(s.arquivo));
  if (naoJpeg.length) vermelho(G_IMG, "Formato", `${naoJpeg.length} arquivo(s) fora de JPEG. A API recusa webp e png.`);
  else verde(G_IMG, "Formato", "Todos em JPEG.");

  const semAlt = slides.filter((s) => !s.alt || s.alt.length < 15);
  if (meta.tipo === "reel" || meta.tipo === "story") {
    verde(G_IMG, "Alt", "Reel e story não aceitam o campo, então não se cobra.");
  } else if (semAlt.length) {
    vermelho(G_IMG, "Alt", `${semAlt.length} slide(s) sem alt utilizável. É acessibilidade e é indexado pelo Google.`);
  } else {
    const alts = slides.map((s) => norm(s.alt));
    const repetidos = alts.length - new Set(alts).size;
    if (repetidos) laranja(G_IMG, "Alt repetido", `${repetidos} alt(s) repetido(s). Alt idêntico é sinal ruim de busca.`);
    else verde(G_IMG, "Alt", "Presente em todos e sem repetição.");
    const altLongo = slides.find((s) => s.alt.length > 1000);
    if (altLongo) vermelho(G_IMG, "Alt longo", "Um alt passa de 1.000 caracteres, o limite do campo.");
  }

  const comAltIniciandoErrado = slides.filter((s) => /^(imagem|foto)\s+(de|do|da)\b/i.test(s.alt || ""));
  if (comAltIniciandoErrado.length) laranja(G_IMG, "Alt redundante", `${comAltIniciandoErrado.length} alt(s) começando com "imagem de" ou "foto de".`);

  if (chave) {
    const nomeGenerico = slides.filter((s) => s.arquivo && !cobreChave(s.arquivo.replace(/\.\w+$/, "").replace(/-/g, " ")));
    if (nomeGenerico.length) laranja(G_IMG, "Nome do arquivo", `${nomeGenerico.length} arquivo(s) sem a palavra-chave no nome. O nome é sinal de busca de imagem.`);
    else verde(G_IMG, "Nome do arquivo", "Todos carregam a palavra-chave.");
  }

  const textoLongo = slides.filter((s) => s.texto && s.texto.trim().split(/\s+/).length > 12);
  if (textoLongo.length) laranja(G_IMG, "Texto no slide", `${textoLongo.length} slide(s) com mais de 12 palavras. No feed não se lê.`);
  else verde(G_IMG, "Texto no slide", "Todos dentro de 12 palavras.");
}

// --------------------------------------------------------------------- reel

// Reel é vídeo: não tem slide nem alt (a API não aceita o campo), então o que se confere é o
// MP4, a capa e as cenas. O vídeo não tem narração, e leitor de tela não lê texto queimado no
// quadro: todo valor que aparece na tela precisa estar escrito na legenda. É a acessibilidade
// possível no reel, e é também a regra de um número por fato.
if (meta.tipo === "reel") {
  const video = meta.video ? String(meta.video) : "";
  if (!video) vermelho(G_VIDEO, "Arquivo", "Reel sem `video` no front matter.");
  else if (!/\.(mp4|mov)$/i.test(video)) vermelho(G_VIDEO, "Arquivo", `\`${video}\` não é MP4 nem MOV, os formatos que a Meta aceita em reel.`);
  else verde(G_VIDEO, "Arquivo", video);
  if (video && chave) {
    if (!cobreChave(video.replace(/\.\w+$/, "").replace(/-/g, " ")))
      laranja(G_VIDEO, "Nome do arquivo", "O nome do MP4 não carrega a palavra-chave. O nome é sinal de busca.");
    else verde(G_VIDEO, "Nome do arquivo", "Carrega a palavra-chave.");
  }

  const capa = meta.capa ? String(meta.capa) : "";
  if (!capa) laranja(G_VIDEO, "Capa", "Sem `capa`. A Meta usa um quadro qualquer, e é a capa que aparece na grade do perfil.");
  else if (!/\.jpe?g$/i.test(capa)) vermelho(G_VIDEO, "Capa", `\`${capa}\` não é JPEG, o único formato de imagem que a API aceita.`);
  else verde(G_VIDEO, "Capa", capa);

  // O texto da cena sai do HTML que o render-reel.mjs transforma em vídeo, quando ele existe:
  // um resumo escrito à mão no front matter pode divergir do que vai para a tela.
  const pastaDoRascunho = path.dirname(path.resolve(arquivo));
  const cenas = (Array.isArray(meta.cenas) ? meta.cenas : []).map((c) => {
    const html = c.html ? path.resolve(pastaDoRascunho, c.html) : null;
    if (!html) return c;
    if (!fs.existsSync(html)) {
      vermelho(G_VIDEO, "Cena", `Não achei ${c.html}, a cena que o vídeo renderiza.`);
      return c;
    }
    return { ...c, tela: textoDaCena(fs.readFileSync(html, "utf8")) };
  });
  if (!cenas.length) {
    laranja(G_VIDEO, "Cenas", "Sem a lista de `cenas`. Sem ela não dá para conferir o texto que aparece na tela.");
  } else {
    const segundos = cenas.reduce((s, c) => s + (Number(String(c.segundos ?? "").replace(",", ".")) || 0), 0);
    if (segundos && segundos < 3) vermelho(G_VIDEO, "Duração", `${segundos.toFixed(1)} s. O reel tem no mínimo 3 s.`);
    else if (segundos > 90) laranja(G_VIDEO, "Duração", `${segundos.toFixed(0)} s. Reel de número funciona abaixo de 90 s.`);
    else if (segundos) verde(G_VIDEO, "Duração", `${segundos.toFixed(1)} s em ${cenas.length} cenas.`);

    // A frase principal da cena (o `texto` do front matter), como o slide. A tabela e a fonte do
    // rodapé ficam fora da conta: quem para o vídeo para ler o número consegue ler.
    const longas = cenas.filter((c) => c.texto && c.texto.trim().split(/\s+/).length > 12);
    if (longas.length) laranja(G_VIDEO, "Texto na cena", `${longas.length} cena(s) com frase de mais de 12 palavras. Não dá tempo de ler.`);
    else verde(G_VIDEO, "Texto na cena", "Todas as frases dentro de 12 palavras.");

    const naTela = [...new Set(cenas.flatMap((c) => String(c.tela ?? c.texto ?? "").match(/R\$\s?\d[\d.,]*\d|R\$\s?\d/g) ?? []))]
      .map((v) => v.replace(/\s/g, ""));
    // Valor inteiro: "R$ 20" na tela não pode passar por "R$ 200" na legenda.
    const legendaSemEspaco = legendaCompleta.replace(/\s/g, "");
    const escrito = (v) => new RegExp(`${v.replace(/[$.]/g, "\\$&")}(?![\\d]|[.,]\\d)`).test(legendaSemEspaco);
    const fora = naTela.filter((v) => !escrito(v));
    if (fora.length) laranja(G_VIDEO, "Tela na legenda", `${fora.join(", ")} aparece(m) na tela e não na legenda. Leitor de tela não lê o vídeo.`);
    else if (naTela.length) verde(G_VIDEO, "Tela na legenda", `Os ${naTela.length} valores da tela estão escritos na legenda.`);

    if (naTela.length && !meta.price_date)
      vermelho(G_VIDEO, "Data do preço", "As cenas mostram R$ e o front matter não tem `price_date`.");
  }
}

// ------------------------------------------------------------- marca e ADRs

const travessoes = (bruto.match(/[—–]/g) || []).length;
if (travessoes) vermelho(G_MARCA, "Travessão", `${travessoes} ocorrência(s) de "—" ou "–". Proibido no projeto inteiro (CLAUDE.md).`);
else verde(G_MARCA, "Travessão", "Nenhum.");

const grafiaErrada = bruto.match(/\b(MovePark|Move Park|MOVEPARK)\b/g) || [];
if (grafiaErrada.length) vermelho(G_MARCA, "Grafia da marca", `${grafiaErrada.length} ocorrência(s) de ${[...new Set(grafiaErrada)].join(", ")}. É "Movepark".`);
else verde(G_MARCA, "Grafia da marca", "Correta.");

const PROMESSAS = [
  [/vaga garantida/i, "vaga garantida"],
  [/cancelamento (gr[áa]tis|gratuito|sem custo)/i, "cancelamento grátis"],
  [/pre[çc]o fixo/i, "preço fixo"],
  [/garanta sua vaga/i, "garanta sua vaga"],
  [/reserva garantida/i, "reserva garantida"],
  [/[úu]ltimas vagas/i, "últimas vagas"],
  [/vagas? (acabando|esgotando)/i, "vagas acabando"],
];
const promessas = PROMESSAS.filter(([r]) => r.test(bruto)).map(([, n]) => n);
if (promessas.length) vermelho(G_MARCA, "Promessa de transação", `${promessas.join(", ")}. ADR-009: a capacidade mora na unidade, não na legenda.`);
else verde(G_MARCA, "Promessa de transação", "Nenhuma.");

const valores = legendaCompleta.match(/R\$\s?\d[\d.,]*/g) || [];
if (valores.length) {
  const temData = /\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?\s*(de\s*)?20\d{2}|\b\d{2}\/\d{2}\/20\d{2}|\b20\d{2}\b/i.test(legendaCompleta);
  if (!temData) vermelho(G_MARCA, "Preço sem data", `${valores.length} valor(es) em R$ sem data de referência na legenda. Tarifa sem data vira promessa que ninguém retira.`);
  else verde(G_MARCA, "Preço com data", `${valores.length} valor(es), com data de referência.`);
}

const VICIOS = [
  [/n[ãa]o [ée] (s[óo] )?\w+[^.]{0,40},? [ée] /i, 'construção "não é X, é Y"'],
  [/voc[êe] sabia que/i, '"você sabia que"'],
  [/\b(incr[íi]vel|imperd[íi]vel|revolucion[áa]ri[oa]|surpreendente)\b/i, "superlativo vazio"],
  [/\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{5,}\b(?!\s*\))/, "palavra em CAIXA ALTA"],
];
const vicios = VICIOS.filter(([r]) => r.test(legendaCompleta)).map(([, n]) => n);
if (vicios.length) laranja(G_MARCA, "Vício de IA", `${vicios.join("; ")}. Passe pela skill \`revisar-texto\`.`);
else verde(G_MARCA, "Vício de IA", "Nenhum dos padrões conhecidos.");

// ------------------------------------------------------------------ relatório

const ORDEM = { vermelho: 0, laranja: 1, verde: 2 };
const MARCA_ = { verde: "  ok ", laranja: "  !! ", vermelho: "  XX " };
const grupos = [...new Set(achados.map((a) => a.grupo))];
const vermelhos = achados.filter((a) => a.nivel === "vermelho").length;
const laranjas = achados.filter((a) => a.nivel === "laranja").length;
const verdes = achados.filter((a) => a.nivel === "verde").length;

if (flag("json")) {
  console.log(JSON.stringify({ arquivo, meta, achados, resumo: { verdes, laranjas, vermelhos } }, null, 2));
} else {
  console.log(`\nAnálise de ${path.basename(arquivo)}  (${meta.tipo || "?"}, ${legendaCompleta.length} caracteres, ${slides.length} slides)\n`);
  for (const g of grupos) {
    const doGrupo = achados
      .filter((a) => a.grupo === g)
      .filter((a) => !flag("silencioso") || a.nivel !== "verde")
      .sort((a, b) => ORDEM[a.nivel] - ORDEM[b.nivel]);
    if (!doGrupo.length) continue;
    console.log(g);
    for (const a of doGrupo) console.log(`${MARCA_[a.nivel]}${a.titulo}: ${a.texto}`);
    console.log("");
  }
  const nota = vermelhos ? "VERMELHO" : laranjas > 2 ? "LARANJA" : "VERDE";
  console.log(`Resultado: ${nota}  (${verdes} ok, ${laranjas} atenção, ${vermelhos} bloqueio)\n`);
  if (vermelhos) console.log("Corrija os bloqueios antes de publicar.\n");
}

process.exit(vermelhos ? 1 : 0);
