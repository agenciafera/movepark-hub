/**
 * Bloco de fato por unidade: gera do banco e confere o que está publicado.
 *
 * Por que existe. A visão geral de IA não cita a página mais bonita, cita o trecho mais
 * fácil de extrair: entidade, número, unidade e condição na MESMA frase. Adjetivo não
 * sobrevive à extração, então "seguro" e "ótimo custo-benefício" somem e o concorrente
 * que escreveu "fica a 4,5 km e a semana sai por R$ 111,30" é quem aparece citado.
 *
 * O molde está na skill `blogpost-seo-geo` (Passo 4.1). Este script é o lado executável
 * dele: `--print` monta o bloco a partir do motor, e o modo padrão confere o que já está
 * no ar. Sem isso o bloco envelhece junto com o texto, que é exatamente o problema que o
 * Conteúdo 22 mandou resolver.
 *
 * O que barra e o que avisa, e por quê:
 *
 *   - distância, traslado, frequência da van e estadia mínima  BARRAM o CI. São fatos
 *     SEM data no texto: o bloco afirma no presente. Distância ainda por cima é ADR-001,
 *     medida no PostGIS, e publicar um número que o próprio banco desmente foi o defeito
 *     que a varredura de 08/09/2026 achou no acervo.
 *   - preço  AVISA. Ele é um retrato datado ("em setembro de 2026"), então tabela nova
 *     do parceiro não torna a frase falsa, só velha. Guarda que fica vermelho a cada
 *     revisão de preço de parceiro é guarda que alguém desliga; quem cobra o frescor é a
 *     revisão mensal da Fase 3.
 *
 * Unidade sem bloco publicado nunca reprova: o bloco é obrigatório nas 12 donas da Fase 1
 * e opcional no resto do acervo.
 *
 * Uso: bun run lint:bloco-fato · bun run lint:bloco-fato -- --print GRU
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function env(chave) {
  for (const arquivo of [".env.local", ".env"]) {
    if (!fs.existsSync(arquivo)) continue;
    const linha = fs
      .readFileSync(arquivo, "utf8")
      .split("\n")
      .find((l) => l.startsWith(`${chave}=`));
    if (linha)
      return linha
        .slice(chave.length + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
  }
  return process.env[chave] ?? "";
}

/** O título do bloco. É ele que marca a região gerada, porque HTML sai literal na tela. */
export const TITULO = (nomeDoAeroporto) => `## Os pátios do ${nomeDoAeroporto} em números`;

/** Arredondamento do texto contra a medição. 20 m cobre "1,44 km" virar "1,4 km". */
const TOLERANCIA_METROS = 20;

/** As 12 donas da Fase 1, por praça. Fonte: docs/specs/canonicalizacao-*.md */
export const DONAS = {
  "aeroporto-internacional-de-sao-paulo-guarulhos": [
    "preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui",
    "como-estacionar-barato-no-aeroporto-de-guarulhos",
    "estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes",
  ],
  "aeroporto-afonso-pena": [
    "preco-estacionamento-aeroporto-afonso-pena-curitiba-saiba-tudo-aqui",
    "estacionamento-barato-aeroporto-curitiba",
    "conheca-o-estacionamento-mais-proximo-do-aeroporto-afonso-pena-em-2024",
  ],
  "aeroporto-de-viracopos": [
    "estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica",
    "como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024",
    "onde-deixar-o-carro-estacionado-em-viracopos",
  ],
  "aeroporto-de-confins": [
    "preco-do-estacionamento-no-aeroporto-de-confins",
    "estacionamento-mais-barato-no-aeroporto-de-confins",
    "guia-completo-dos-estacionamentos-proximos-ao-aeoroporto-de-confins",
  ],
};

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "R$ 1.377,00", no formato que o resto do acervo usa. */
export const brl = (v) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** 1441 vira "1,44 km"; 979 vira "0,98 km". Sempre km, para a comparação ser uma só. */
export const km = (metros) => `${(metros / 1000).toFixed(2).replace(".", ",")} km`;

/** "1,44 km" e "980 m" viram metros. */
export function paraMetros(valor, unidade) {
  const n = Number(valor.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return unidade === "km" ? Math.round(n * 1000) : Math.round(n);
}

/** "R$ 1.377,00" vira 1377. */
export function paraNumero(texto) {
  const n = Number(texto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Agrupa as linhas do índice de preços por pátio.
 *
 * O índice devolve uma linha por tipo de vaga. O bloco fala do pátio, então o tipo
 * escolhido é o MAIS BARATO na semana, que é a referência que o leitor procura, e os
 * demais preços continuam na tabela do corpo do post.
 */
export function patiosDoDestino(destino, distancias = []) {
  // A distância do índice mede até o ponto do destino. Quando a praça tem terminal
  // cadastrado, o texto fala do mais próximo, então é esse que entra no bloco.
  const maisProximo = new Map();
  for (const d of distancias) {
    const atual = maisProximo.get(d.company_name);
    if (atual == null || d.distance_m < atual.distance_m) maisProximo.set(d.company_name, d);
  }
  const porPatio = new Map();
  for (const u of destino?.units ?? []) {
    const nome = u.company_name;
    const semana = Number(u.prices?.find((p) => p.days === 7)?.total ?? NaN);
    if (!Number.isFinite(semana)) continue;
    const atual = porPatio.get(nome);
    if (atual == null || semana < atual.semana) {
      porPatio.set(nome, {
        nome,
        semana,
        tipo: (u.parking_type_name ?? "").toLowerCase().replace(/^vaga\s+/, ""),
        diaria: Number(u.prices?.find((p) => p.days === 1)?.total ?? NaN),
        mes: Number(u.prices?.find((p) => p.days === 30)?.total ?? NaN),
        distanciaM: maisProximo.get(nome)?.distance_m ?? u.distance_m,
        ponto: maisProximo.get(nome)?.point_name ?? null,
        traslado: u.shuttle_minutes,
        minimo: u.min_stay_days,
        caminho: u.public_path,
      });
    }
  }
  return [...porPatio.values()].sort((a, b) => a.distanciaM - b.distanciaM);
}

/**
 * Uma frase por pátio, no molde: entidade, número, unidade e condição.
 *
 * Campo não declarado vira frase que diz que não está declarado, nunca estimativa. É a
 * mesma regra do resto do acervo, e é o que separa o bloco de um folheto.
 */
export function frasePatio(patio, destino, extras, referencia) {
  // O ponto vem da medição: em Guarulhos são três terminais cadastrados, e o texto do
  // acervo fala do mais próximo. Praça com um terminal só devolve `null` e vira "do terminal".
  const ponto = patio.ponto ? `do ${patio.ponto}` : "do terminal";
  const partes = [
    `> **${patio.nome}** fica a **${km(patio.distanciaM)}** ${ponto} do ${destino.nome} (${destino.code})`,
  ];
  if (patio.traslado) {
    partes.push(`declara traslado de **${patio.traslado} minutos**`);
    if (extras?.frequencia) partes.push(`com van a cada **${extras.frequencia} minutos**`);
  } else if (extras?.frequencia) {
    partes.push(
      `declara van a cada **${extras.frequencia} minutos**, sem informar quanto dura o traslado`,
    );
  } else {
    partes.push("não declara o tempo de traslado na ficha");
  }
  const precos = [];
  if (Number.isFinite(patio.diaria)) precos.push(`**${brl(patio.diaria)}** na diária avulsa`);
  precos.push(`**${brl(patio.semana)}** por 7 diárias`);
  if (Number.isFinite(patio.mes)) precos.push(`**${brl(patio.mes)}** por 30`);
  const lista =
    precos.length > 1 ? `${precos.slice(0, -1).join(", ")} e ${precos.at(-1)}` : precos[0];
  partes.push(`e cobra ${lista} na vaga ${patio.tipo}, em ${referencia}`);

  const condicoes = [];
  if (extras?.vinteQuatroHoras) condicoes.push("Opera 24 horas");
  if (extras?.tolerancia) condicoes.push(`com tolerância de **${extras.tolerancia} minutos**`);
  condicoes.push(
    patio.minimo
      ? `e estadia mínima de **${patio.minimo} diárias**`
      : "e sem estadia mínima declarada",
  );
  return `${partes.join(", ")}. ${condicoes.join(" ")}.`;
}

/** O bloco inteiro de uma praça, do título ao parágrafo de origem. */
export function blocoMarkdown(destino, patios, extrasPorPatio, hoje = new Date()) {
  const referencia = `${MESES[hoje.getUTCMonth()]} de ${hoje.getUTCFullYear()}`;
  const frases = patios.map((p) => frasePatio(p, destino, extrasPorPatio.get(p.nome), referencia));
  const origem =
    "Distâncias medidas em linha reta no banco de dados com PostGIS. Traslado, frequência da van, " +
    "tolerância e estadia mínima são declarados por cada unidade na própria ficha. Preços do motor " +
    `de reservas, os mesmos do [índice de preços do ${destino.nome}](/estacionamentos/${destino.publicSlug}/precos), ` +
    "que mostra a data de cada tabela.";
  return [TITULO(destino.nome), "", frases.join("\n\n"), "", origem].join("\n");
}

/** O bloco publicado dentro de um post, do título até o próximo `## `. */
export function extrairBloco(bodyMd, nomeDoAeroporto) {
  const titulo = TITULO(nomeDoAeroporto);
  const inicio = (bodyMd ?? "").indexOf(titulo);
  if (inicio < 0) return null;
  const resto = bodyMd.slice(inicio + titulo.length);
  const fim = resto.search(/\n## /);
  return titulo + (fim < 0 ? resto : resto.slice(0, fim));
}

const RE_DISTANCIA = /fica a \*\*([\d.,]+)\s?(km|m)\*\*/;
const RE_TRASLADO = /traslado de \*\*(\d+) minutos\*\*/;
const RE_FREQUENCIA = /van a cada \*\*(\d+) minutos\*\*/;
const RE_MINIMO = /estadia mínima de \*\*(\d+) diárias\*\*/;
const RE_MOEDA = /R\$\s*([\d.]+,\d{2})/g;

/** Os números que uma frase de pátio afirma. */
export function numerosDaFrase(frase) {
  const d = frase.match(RE_DISTANCIA);
  const t = frase.match(RE_TRASLADO);
  const f = frase.match(RE_FREQUENCIA);
  const m = frase.match(RE_MINIMO);
  return {
    metros: d ? paraMetros(d[1], d[2]) : null,
    traslado: t ? Number(t[1]) : null,
    frequencia: f ? Number(f[1]) : null,
    minimo: m ? Number(m[1]) : null,
    precos: [...frase.matchAll(RE_MOEDA)].map((x) => paraNumero(x[1])).filter((v) => v != null),
  };
}

/**
 * O que o bloco publicado diz de errado sobre cada pátio.
 *
 * `esperado` é um Map de nome do pátio para `{ metros, traslado, frequencia, minimo, precos }`.
 * Devolve achados com `barra: true` para fato sem data e `barra: false` para preço.
 */
export function divergencias(bloco, esperado) {
  const achados = [];
  for (const frase of (bloco ?? "").split("\n").filter((l) => l.startsWith("> **"))) {
    const nome = frase.match(/^> \*\*([^*]+)\*\*/)?.[1];
    const alvo = nome ? esperado.get(nome) : null;
    if (!alvo) continue;
    const diz = numerosDaFrase(frase);
    if (diz.metros != null && Math.abs(diz.metros - alvo.metros) > TOLERANCIA_METROS)
      achados.push({
        nome,
        barra: true,
        detalhe: `o bloco diz ${diz.metros} m e o PostGIS mede ${alvo.metros} m`,
      });
    if (diz.traslado != null && diz.traslado !== alvo.traslado)
      achados.push({
        nome,
        barra: true,
        detalhe: `o bloco diz traslado de ${diz.traslado} min e a ficha declara ${alvo.traslado ?? "nada"}`,
      });
    if (diz.frequencia != null && diz.frequencia !== alvo.frequencia)
      achados.push({
        nome,
        barra: true,
        detalhe: `o bloco diz van a cada ${diz.frequencia} min e a ficha declara ${alvo.frequencia ?? "nada"}`,
      });
    if (diz.minimo != null && diz.minimo !== alvo.minimo)
      achados.push({
        nome,
        barra: true,
        detalhe: `o bloco diz mínimo de ${diz.minimo} diárias e a ficha declara ${alvo.minimo ?? "nenhum"}`,
      });
    const forasDaTabela = diz.precos.filter((v) => !alvo.precos.includes(v));
    if (forasDaTabela.length > 0)
      achados.push({
        nome,
        barra: false,
        detalhe: `o bloco cita ${forasDaTabela.map(brl).join(", ")} e o motor hoje tem ${alvo.precos.map(brl).join(" / ")}`,
      });
  }
  return achados;
}

const SUPABASE_URL = env("VITE_SUPABASE_URL");
const ANON = env("VITE_SUPABASE_ANON_KEY");

async function rest(caminho) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!r.ok) throw new Error(`REST ${caminho}: ${r.status}`);
  return r.json();
}

async function rpc(nome, corpo) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo ?? {}),
  });
  if (!r.ok) throw new Error(`RPC ${nome}: ${r.status}`);
  return r.json();
}

async function main() {
  const args = process.argv.slice(2);
  const imprimir = args.includes("--print");
  const so = args.find((a) => /^[A-Z]{3}$/.test(a));

  if (!SUPABASE_URL || !ANON) {
    console.log("bloco-de-fato: sem VITE_SUPABASE_*, pulando (isto não é falha).");
    return 0;
  }

  const slugs = Object.keys(DONAS);
  const [indice, unidades, posts, ...medicoes] = await Promise.all([
    rpc("destination_price_index", { p_days: [1, 7, 30] }),
    rest(
      "location?select=public_name,shuttle_frequency_minutes,tolerance_minutes,is_24h," +
        "destination:destination!inner(slug)&is_listed=eq.true&status=eq.active&deleted_at=is.null",
    ),
    rest(
      `blog_post?select=slug,body_md&is_published=eq.true&deleted_at=is.null&slug=in.(${Object.values(DONAS).flat().join(",")})`,
    ),
    ...slugs.map((slug) => rpc("destination_unit_distances", { p_destination_slug: slug })),
  ]);
  const distanciasPorDestino = new Map(slugs.map((slug, i) => [slug, medicoes[i] ?? []]));

  const extras = new Map();
  for (const u of unidades) {
    // "Aeropark - Estacionamento Aeroporto Guarulhos" vira "Aeropark", que é como o
    // índice de preços chama a empresa e como o bloco a nomeia.
    extras.set((u.public_name ?? "").split(" - ")[0].trim(), {
      frequencia: u.shuttle_frequency_minutes,
      tolerancia: u.tolerance_minutes,
      vinteQuatroHoras: u.is_24h,
    });
  }

  const porSlug = new Map((posts ?? []).map((p) => [p.slug, p.body_md]));
  let barrados = 0;
  let avisos = 0;
  let conferidos = 0;

  for (const slug of slugs) {
    const destinoJson = (indice?.destinations ?? []).find((d) => d.slug === slug);
    if (!destinoJson) continue;
    const destino = {
      nome: destinoJson.name,
      code: destinoJson.code,
      publicSlug: destinoJson.public_slug,
    };
    const patios = patiosDoDestino(destinoJson, distanciasPorDestino.get(slug));
    if (patios.length === 0) continue;

    if (imprimir) {
      if (so && so !== destino.code) continue;
      console.log(`\n${"=".repeat(70)}\n${destino.code} · ${DONAS[slug].length} donas\n`);
      console.log(blocoMarkdown(destino, patios, extras));
      continue;
    }

    const esperado = new Map(
      patios.map((p) => [
        p.nome,
        {
          metros: p.distanciaM,
          traslado: p.traslado,
          frequencia: extras.get(p.nome)?.frequencia ?? null,
          minimo: p.minimo,
          precos: [p.diaria, p.semana, p.mes].filter((v) => Number.isFinite(v)),
        },
      ]),
    );

    for (const postSlug of DONAS[slug]) {
      const body = porSlug.get(postSlug);
      if (!body) continue;
      const bloco = extrairBloco(body, destino.nome);
      if (!bloco) continue;
      conferidos += 1;
      for (const a of divergencias(bloco, esperado)) {
        const linha = `  ${postSlug} · ${a.nome}: ${a.detalhe}`;
        if (a.barra) {
          barrados += 1;
          console.error(linha);
        } else {
          avisos += 1;
          console.warn(`  (aviso) ${linha.trim()}`);
        }
      }
    }
  }

  if (imprimir) return 0;

  if (barrados > 0) {
    console.error(
      `\nbloco-de-fato: ${barrados} fato(s) do bloco divergindo da ficha ou do PostGIS.\n` +
        "Esses números são afirmados sem data, então divergência é a página se contradizendo.\n" +
        "Regenere com `bun run lint:bloco-fato -- --print <CODE>` ou corrija a ficha da unidade.",
    );
    return 1;
  }
  if (avisos > 0)
    console.warn(
      `bloco-de-fato: ${avisos} preço(s) do bloco diferentes da tabela de hoje. O bloco é datado,\n` +
        "então isto é frescor, não contradição. Entra na revisão mensal das páginas de cabeça.",
    );
  console.log(`bloco-de-fato: ok, ${conferidos} bloco(s) conferidos.`);
  return 0;
}

// Só roda a checagem quando chamado direto; o teste importa as funções puras.
if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? ""))
  process.exit(await main());
