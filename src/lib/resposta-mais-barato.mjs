/**
 * O texto que responde "qual é o estacionamento mais barato em <aeroporto>?", olhando o MERCADO:
 * parceiro com reserva pela Movepark (preço do motor) e lote mapeado com preço pesquisado.
 *
 * Existe por causa de Confins (Conteúdo 39, 29/09/2026): a página dizia "a diária mais barata perto
 * do Aeroporto de Confins custa R$ 45,00, no BePark" porque só enxergava parceiro, e o mercado
 * cobrava R$ 20,00. Com um parceiro só na praça, ele virava "o mais barato" por falta de
 * concorrente na conta, e a página contradizia os nossos próprios posts e FAQs.
 *
 * É `.mjs` pelo mesmo motivo do `site-host.mjs`: dois consumidores sem runtime comum. A página
 * React (`src/routes/estacionamento-mais-barato.tsx`, via `maisBarato.logic.ts`) e o gêmeo
 * Markdown que o `scripts/generate-geo-artifacts.mjs` escreve em node puro depois do build. A
 * mesma pergunta tem que ter a mesma resposta nas duas, ou a IA lê a contradição e descarta a
 * fonte.
 *
 * Preço pesquisado é fato de terceiro com data (ADR-010): entra no texto sempre com a data ao
 * lado, e nunca vira `Offer` nem passa pelo motor. A validade (90 dias) é filtrada antes de
 * chegar aqui: a RPC já não entrega o vencido e a página confere de novo na renderização.
 */

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Igual ao `formatBRL` de `src/lib/format.ts`: mesmo `Intl`, mesmo espaço não separável. */
const brl = (v) => BRL.format(v);

/** `2026-09-08` → `08/09/2026`, igual ao `formatDate` do front. */
const dataBR = (iso) => String(iso).slice(0, 10).split("-").reverse().join("/");

const diarias = (d) => (d === 1 ? "1 diária" : `${d} diárias`);

/** O menor preço pesquisado de uma duração, com os empatados juntos, em ordem alfabética. */
export function menorPesquisado(rows, days, d) {
  const i = days.indexOf(d);
  if (i < 0) return null;
  const comPreco = rows.filter((r) => r.totals[i] != null);
  if (comPreco.length === 0) return null;
  const total = Math.min(...comPreco.map((r) => r.totals[i]));
  const lotes = comPreco
    .filter((r) => r.totals[i] === total)
    .sort((a, b) => a.shortLabel.localeCompare(b.shortLabel, "pt-BR"))
    .map((r) => ({ label: r.shortLabel, path: r.path ?? null, researchedAt: r.researchedAt }));
  return { total, perDay: total / d, lotes };
}

/** "no A e no B (preço pesquisado em 08/09/2026)", ou a data por lote quando elas diferem. */
export function ondePesquisado(v, complemento = "") {
  const extra = complemento ? `, ${complemento}` : "";
  const datas = new Set(v.lotes.map((l) => l.researchedAt));
  if (datas.size === 1) {
    const nomes = v.lotes.map((l) => `no ${l.label}`).join(" e ");
    return `${nomes} (preço pesquisado em ${dataBR(v.lotes[0].researchedAt)}${extra})`;
  }
  const nomes = v.lotes
    .map((l) => `no ${l.label} (pesquisado em ${dataBR(l.researchedAt)})`)
    .join(" e ");
  return complemento ? `${nomes}, ${complemento}` : nomes;
}

/**
 * Quando o pesquisado é mais barato, a resposta nomeia ele (com a data e o aviso de que não tem
 * reserva online) e diz em seguida qual é o menor com reserva pela Movepark. Quando o parceiro é
 * o mais barato, ou empata, a frase é a do parceiro. Vale para qualquer praça; a de parceiro
 * único é só o caso em que o erro aparecia.
 */
export function respostaMaisBarato({ prosa, linhas, pesquisados, days }) {
  const base = linhas.find((l) => l.days === 1) ?? linhas[0];
  const semana = linhas.find((l) => l.days === 7) ?? null;
  const mes = linhas.find((l) => l.days === 30) ?? null;
  const ganha = (l) => {
    const p = menorPesquisado(pesquisados, days, l.days);
    return p && p.total < l.vencedor.total ? p : null;
  };

  const frases = [];

  const pBase = ganha(base);
  const periodo =
    base.days === 1 ? "a diária avulsa mais barata" : `o menor total para ${diarias(base.days)}`;
  if (pBase) {
    frases.push(
      `Hoje, ${periodo} perto do ${prosa} é ${brl(pBase.total)}, ${ondePesquisado(pBase, "sem reserva online pela Movepark")}.`,
      base.days === 1
        ? `Com reserva pela Movepark, a menor diária é ${brl(base.vencedor.total)}, no ${base.vencedor.label} (${base.vencedor.parkingTypeName}).`
        : `Com reserva pela Movepark, o menor total é ${brl(base.vencedor.total)}, no ${base.vencedor.label} (${base.vencedor.parkingTypeName}).`,
    );
  } else {
    frases.push(
      `Hoje, ${periodo} perto do ${prosa} ${base.days === 1 ? "custa" : "é"} ${brl(base.vencedor.total)}, no ${base.vencedor.label} (${base.vencedor.parkingTypeName}).`,
    );
  }

  for (const l of [semana, mes]) {
    if (!l || l === base) continue;
    const p = ganha(l);
    frases.push(
      p
        ? `Para ${l.days} dias, o menor total é ${brl(p.total)} (${brl(p.perDay)} por dia), ${ondePesquisado(p)}; com reserva pela Movepark, ${brl(l.vencedor.total)}, no ${l.vencedor.label}.`
        : `Para ${l.days} dias, o menor total é ${brl(l.vencedor.total)} (${brl(l.vencedor.perDay)} por dia), no ${l.vencedor.label}.`,
    );
  }

  frases.push(
    pesquisados.length > 0
      ? "Os preços com reserva saem do motor da Movepark, os mesmos do checkout. Os demais são de terceiros, conferidos pela Movepark na data indicada."
      : "Os valores saem do motor de reservas, os mesmos do checkout, e mudam quando a tabela do parceiro muda.",
  );

  let respostaSemana = null;
  if (semana) {
    const p = ganha(semana);
    respostaSemana = p
      ? `Estacionar 7 dias perto do ${prosa} custa a partir de ${brl(p.total)} (${brl(p.perDay)} por dia), ${ondePesquisado(p, "sem reserva online pela Movepark")}. Com reserva pela Movepark, a partir de ${brl(semana.vencedor.total)}, no ${semana.vencedor.label}. A tabela completa por parceiro está na página de preços.`
      : `Estacionar 7 dias perto do ${prosa} custa a partir de ${brl(semana.vencedor.total)} (${brl(semana.vencedor.perDay)} por dia), no ${semana.vencedor.label}. A tabela completa por parceiro está na página de preços.`;
  }

  return {
    direta: frases.join(" "),
    semana: respostaSemana,
    // `pesquisado` diz se o menor preço é de terceiro: aí a description não pode fechar com
    // "reserve pela Movepark", que prometeria reservar por aquele valor (ADR-009).
    menorDoMercado: {
      total: pBase ? pBase.total : base.vencedor.total,
      days: base.days,
      pesquisado: pBase != null,
    },
  };
}
