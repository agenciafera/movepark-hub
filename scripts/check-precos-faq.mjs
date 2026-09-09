/**
 * Guarda de preço: número de lote mapeado em texto de FAQ tem que bater com o pesquisado.
 *
 * Por que existe. Em 08/09/2026 a página de Viracopos publicava DOIS preços para o mesmo
 * pátio: a tabela do destino lia `prospect_location.researched_*` e dizia KM64 R$ 19,00,
 * e a FAQ logo abaixo repetia R$ 23,99 de um guia de julho. O oficial aparecia como
 * R$ 31,00 na tabela e R$ 28,00 na FAQ, que ainda divergia da própria resposta curta dela.
 * Em Congonhas era o inverso: a FAQ cotava Grand Parking e Congonhas Park, que não abrem
 * tarifa em canal nenhum, e omitia os três pátios que abrem.
 *
 * As duas foram corrigidas à mão. Este script existe para a correção não se desfazer em
 * silêncio na próxima edição, que é o mesmo motivo do `check-distancias-faq.mjs`.
 *
 * O preço tem quatro moradas hoje (motor, `researched_*`, ficha do lote e a tabela escrita
 * à mão dentro de `faq.body_md`). As três primeiras leem o mesmo dado; a quarta é prosa e é
 * a única que pode divergir sem nada quebrar. É nela que este guarda olha.
 *
 * Como decide. Só compara LINHA DE TABELA, nunca prosa: numa linha `| Nome | R$ X | ... |`
 * a atribuição do número ao pátio é inequívoca, e em prosa não é. E só reclama quando o
 * valor da FAQ não bate com NENHUMA das quatro durações pesquisadas, para a FAQ poder citar
 * legitimamente o total de 7 diárias em vez da diária.
 *
 * Duas checagens, com pesos diferentes de propósito:
 *   1. divergência  o valor citado não é nenhum dos pesquisados para aquele pátio.
 *                   BARRA o CI: é a página se contradizendo, e o autor do PR consegue
 *                   corrigir na hora.
 *   2. sem lastro   a FAQ cita preço de um pátio sem nenhum valor pesquisado. NÃO barra:
 *                   em 09/09/2026 já havia 18 casos, dívida de pesquisa que ninguém fecha
 *                   dentro de um PR. Guarda que nasce vermelho é guarda que alguém desliga.
 *                   Quem cobra essa dívida é a issue diária do `preco-health.yml`.
 *
 * Com `--validade`, checa também o vencimento dos 90 dias (`PRECO_PESQUISADO_TTL_DIAS` em
 * `src/features/destinations/destinoPrices.logic.ts`, gêmeo em SQL na
 * `public.preco_pesquisado_fresco`). Vencido, a linha some da página em silêncio, então
 * quem avisa é o cron de `preco-health.yml`, não o CI de um PR.
 *
 * Parceiro fica de fora: o preço dele sai do motor de reservas e não pode divergir.
 *
 * Uso: bun run lint:precos  ·  bun run lint:precos -- --validade
 */

import fs from "node:fs";

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

/** Gêmeo de `PRECO_PESQUISADO_TTL_DIAS`. Se um dia mudar, os dois mudam juntos. */
export const TTL_DIAS = 90;
/** Antecedência do aviso: 14 dias dá tempo de reconferir antes de a linha sumir. */
export const AVISO_DIAS = 14;

/** Palavras que nunca identificam um pátio, porque descrevem a praça ou a categoria. */
const GENERICAS = new Set([
  "estacionamento",
  "estacionamentos",
  "aeroporto",
  "internacional",
  "oficial",
  "parceiro",
  "movepark",
  "vaga",
  "vagas",
  "park",
  "parking",
  "terminal",
]);

const normalizar = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** "KM64 - Estacionamento Aeroporto Viracopos" vira "KM64". */
export function nomeCurto(publicName) {
  return (publicName ?? "").split(" - ")[0].trim();
}

/**
 * Os tokens que identificam um pátio SEM ambiguidade dentro do seu destino.
 *
 * Um token só serve se aparecer em um único pátio da praça (senão "Parking" casaria
 * BR Parking com Yellow Parking) e se não for palavra da praça ou da categoria (senão
 * "Viracopos" casaria qualquer célula que mencione a cidade). Pátio que não sobra com
 * nenhum token é PULADO, nunca reprovado: o guarda erra para o lado de não reclamar.
 */
export function tokensDistintivos(nomesCurtos, palavrasDaPraca = []) {
  const proibidas = new Set([...GENERICAS, ...palavrasDaPraca.map(normalizar)]);
  const frequencia = new Map();
  const porNome = nomesCurtos.map((nome) => {
    const tokens = [
      ...new Set(
        normalizar(nome)
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length >= 4),
      ),
    ];
    for (const t of tokens) frequencia.set(t, (frequencia.get(t) ?? 0) + 1);
    return { nome, tokens };
  });
  const saida = new Map();
  for (const { nome, tokens } of porNome) {
    const uteis = tokens.filter((t) => frequencia.get(t) === 1 && !proibidas.has(t));
    if (uteis.length > 0) saida.set(nome, uteis);
  }
  return saida;
}

const MOEDA = /R\$\s*([\d.]+,\d{2})/g;

/** "R$ 1.234,56" vira 1234.56. */
export function paraNumero(texto) {
  const n = Number(texto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * As linhas de tabela markdown de um texto, já quebradas em células.
 *
 * Descarta a linha separadora (`|---|---|`) e as linhas sem nenhum `R$`, que são
 * cabeçalho ou tabela de outro assunto.
 */
export function linhasComPreco(md) {
  return (md ?? "")
    .split("\n")
    .filter((l) => l.trimStart().startsWith("|") && /R\$/.test(l) && !/^[\s|:-]+$/.test(l))
    .map((l) =>
      l
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => c.trim()),
    );
}

/** Formata para leitura no log do CI. */
const brl = (v) => `R$ ${v.toFixed(2).replace(".", ",")}`;

/**
 * Os problemas de uma FAQ contra o dado pesquisado da sua praça.
 *
 * `pesquisado` é um Map de nome curto para `{ valores: number[], temData: boolean }`.
 */
export function divergencias(md, pesquisado, palavrasDaPraca = []) {
  const tokens = tokensDistintivos([...pesquisado.keys()], palavrasDaPraca);
  const achados = [];
  for (const celulas of linhasComPreco(md)) {
    // Palavra inteira, nunca substring: "Aero Viracopos" e "Viracopos Aeroparking" são
    // pátios diferentes, e um `includes("aero")` acusava um pela linha do outro.
    const rotulo = new Set(
      normalizar(celulas[0] ?? "")
        .split(/[^a-z0-9]+/)
        .filter(Boolean),
    );
    if (rotulo.size === 0) continue;
    for (const [nome, uteis] of tokens) {
      if (!uteis.some((t) => rotulo.has(t))) continue;
      const resto = celulas.slice(1).join(" | ");
      const citados = [...resto.matchAll(MOEDA)]
        .map((m) => paraNumero(m[1]))
        .filter((v) => v != null);
      if (citados.length === 0) continue;
      const { valores, temData } = pesquisado.get(nome);
      if (valores.length === 0 || !temData) {
        achados.push({
          tipo: "sem lastro",
          nome,
          detalhe: `a FAQ cita ${citados.map(brl).join(" e ")} e não há preço pesquisado com data para este pátio`,
        });
        continue;
      }
      // Basta UM dos valores citados bater: a linha pode trazer diária e semanal juntas.
      if (!citados.some((v) => valores.includes(v))) {
        achados.push({
          tipo: "divergência",
          nome,
          detalhe: `a FAQ cita ${citados.map(brl).join(" e ")} e o pesquisado é ${valores.map(brl).join(" / ")}`,
        });
      }
    }
  }
  return achados;
}

/** Dias desde a pesquisa. Usa a data de hoje passada de fora, para o teste não depender do relógio. */
export function diasDesde(iso, hoje) {
  return Math.floor((hoje.getTime() - new Date(`${iso}T00:00:00Z`).getTime()) / 86400000);
}

async function main() {
  const validade = process.argv.includes("--validade");
  const SUPABASE_URL = env("VITE_SUPABASE_URL");
  const ANON_KEY = env("VITE_SUPABASE_ANON_KEY");

  if (!SUPABASE_URL || !ANON_KEY) {
    console.log("check-precos-faq: sem VITE_SUPABASE_*, pulando (isto não é falha).");
    return 0;
  }

  async function rest(caminho) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    if (!res.ok) throw new Error(`REST ${caminho}: ${res.status}`);
    return res.json();
  }

  const [lotes, faqs] = await Promise.all([
    rest(
      "prospect_location?select=public_name,researched_daily_brl,researched_weekly_brl," +
        "researched_biweekly_brl,researched_monthly_brl,researched_at," +
        "destination:destination(slug,name,city)&is_published=eq.true",
    ),
    rest(
      "faq?select=question,body_md,destination:destination(slug)" +
        "&scope=eq.destination&is_published=eq.true&deleted_at=is.null",
    ),
  ]);

  const porDestino = new Map();
  for (const l of lotes) {
    const slug = l.destination?.slug;
    if (!slug) continue;
    if (!porDestino.has(slug)) {
      porDestino.set(slug, {
        pesquisado: new Map(),
        palavras: `${l.destination.name ?? ""} ${l.destination.city ?? ""}`
          .split(/\s+/)
          .filter(Boolean),
      });
    }
    const valores = [
      l.researched_daily_brl,
      l.researched_weekly_brl,
      l.researched_biweekly_brl,
      l.researched_monthly_brl,
    ]
      .map((v) => (v == null ? null : Number(v)))
      .filter((v) => v != null && Number.isFinite(v));
    porDestino.get(slug).pesquisado.set(nomeCurto(l.public_name), {
      valores,
      temData: Boolean(l.researched_at),
      researchedAt: l.researched_at ?? null,
    });
  }

  const divergentes = [];
  const semLastro = [];
  for (const f of faqs) {
    const slug = f.destination?.slug;
    const praca = slug ? porDestino.get(slug) : null;
    if (!praca || praca.pesquisado.size === 0) continue;
    for (const a of divergencias(f.body_md, praca.pesquisado, praca.palavras)) {
      const linha = `  ${slug} · "${f.question}"\n    ${a.nome}: ${a.detalhe}`;
      (a.tipo === "divergência" ? divergentes : semLastro).push(linha);
    }
  }

  const hoje = new Date();
  const vencendo = [];
  if (validade) {
    for (const [slug, praca] of porDestino) {
      for (const [nome, dados] of praca.pesquisado) {
        if (!dados.researchedAt || dados.valores.length === 0) continue;
        const dias = diasDesde(dados.researchedAt.slice(0, 10), hoje);
        if (dias >= TTL_DIAS) {
          vencendo.push(
            `  ${slug} · ${nome}: VENCIDO há ${dias - TTL_DIAS} dia(s), a linha já sumiu da página`,
          );
        } else if (dias >= TTL_DIAS - AVISO_DIAS) {
          vencendo.push(`  ${slug} · ${nome}: vence em ${TTL_DIAS - dias} dia(s)`);
        }
      }
    }
  }

  const lotesComPreco = [...porDestino.values()].reduce(
    (n, p) => n + [...p.pesquisado.values()].filter((d) => d.valores.length > 0).length,
    0,
  );
  const vencidos = vencendo.filter((v) => v.includes("VENCIDO"));

  // O cron consome isto para montar a issue; por isso sai sempre com 0, mesmo com achado.
  if (process.argv.includes("--json")) {
    console.log(
      JSON.stringify(
        {
          ok: divergentes.length === 0 && vencidos.length === 0,
          divergencias: divergentes.length,
          sem_lastro: semLastro.length,
          vencidos: vencidos.length,
          vencendo: vencendo.length - vencidos.length,
          faqs: faqs.length,
          lotes_com_preco: lotesComPreco,
          detalhe: { divergencias: divergentes, sem_lastro: semLastro, validade: vencendo },
        },
        null,
        2,
      ),
    );
    return 0;
  }

  if (semLastro.length > 0) {
    console.log(
      `check-precos-faq: ${semLastro.length} preço(s) de FAQ sem lastro no pesquisado (não barra o CI).\n\n` +
        semLastro.join("\n") +
        "\n\nCada um é um número que a Movepark afirma sobre o preço de outra empresa sem ter\n" +
        "de onde tirar a data. Pesquise no site do próprio operador e grave em `researched_*`,\n" +
        "ou tire o valor da FAQ. A issue diária cobra esta fila.\n",
    );
  }
  if (vencendo.length > 0) {
    console.log(`check-precos-faq: validade\n${vencendo.join("\n")}\n`);
  }

  if (divergentes.length > 0) {
    console.error(
      `check-precos-faq: ${divergentes.length} preço(s) de FAQ divergindo do pesquisado.\n\n` +
        divergentes.join("\n") +
        "\n\nO número da FAQ tem que repetir o de `prospect_location.researched_*`, que é o que\n" +
        "a tabela do destino e a ficha do lote publicam. Duas respostas para a mesma pergunta\n" +
        "na mesma página é o que a auditoria de 08/09/2026 apontou como a maior fraqueza do\n" +
        "comparador concorrente. Corrija a FAQ, ou pesquise o preço e grave em `researched_*`.",
    );
    return 1;
  }

  if (validade && vencidos.length > 0) {
    console.error(
      `check-precos-faq: ${vencidos.length} preço(s) pesquisado(s) VENCIDO(s).\n\n${vencidos.join("\n")}\n\n` +
        "Preço vencido some da página sem avisar, e o destino volta a não responder\n" +
        '"quanto custa". Reconfira no site do próprio operador e regrave com a data de hoje.',
    );
    return 1;
  }

  console.log(
    `check-precos-faq: ok, ${faqs.length} perguntas conferidas contra ${lotesComPreco} lote(s) com preço pesquisado.`,
  );
  return 0;
}

// Só roda a checagem quando chamado direto; o teste importa as funções puras.
if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
