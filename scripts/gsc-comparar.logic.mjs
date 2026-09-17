/**
 * Lógica pura da comparação entre duas coletas do Search Console.
 *
 * Fica separada do script para poder ser testada sem rede e sem credencial, do mesmo
 * jeito que `gsc-baseline.logic.mjs`.
 */

/** Uma linha de CSV com aspas, no formato que o coletor grava. */
export function lerCsv(texto) {
  const linhas = (texto ?? "").trim().split("\n");
  if (linhas.length === 0) return [];
  const colunas = separar(linhas[0]);
  return linhas.slice(1).map((l) => {
    const celulas = separar(l);
    return Object.fromEntries(colunas.map((c, i) => [c, celulas[i] ?? ""]));
  });
}

function separar(linha) {
  const saida = [];
  let atual = "";
  let dentro = false;
  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i];
    if (c === '"') {
      if (dentro && linha[i + 1] === '"') {
        atual += '"';
        i += 1;
      } else dentro = !dentro;
    } else if (c === "," && !dentro) {
      saida.push(atual);
      atual = "";
    } else atual += c;
  }
  saida.push(atual);
  return saida;
}

const num = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/**
 * As 12 células, lado a lado.
 *
 * Posição MENOR é melhor, então o delta de posição é `antes - depois`: positivo quer
 * dizer que subiu no resultado. Impressão e clique seguem o sinal natural.
 *
 * Célula sem impressão em uma das janelas devolve `posicaoAntes`/`posicaoDepois` nulo,
 * nunca zero: posição zero não existe e seria lida como primeiro lugar.
 */
export function compararClusters(antes, depois) {
  const chave = (l) => `${l.aeroporto}|${l.cluster}`;
  const mapaAntes = new Map(antes.map((l) => [chave(l), l]));
  const saida = [];
  for (const d of depois) {
    const a = mapaAntes.get(chave(d)) ?? {};
    const impAntes = num(a.impressoes);
    const impDepois = num(d.impressoes);
    const posAntes = num(a.impressoes) > 0 ? num(a.posicao_media) : null;
    const posDepois = impDepois > 0 ? num(d.posicao_media) : null;
    saida.push({
      aeroporto: d.aeroporto,
      cluster: d.cluster,
      impressoesAntes: impAntes,
      impressoesDepois: impDepois,
      deltaImpressoes: impDepois - impAntes,
      cliquesAntes: num(a.cliques),
      cliquesDepois: num(d.cliques),
      posicaoAntes: posAntes,
      posicaoDepois: posDepois,
      deltaPosicao: posAntes != null && posDepois != null ? posAntes - posDepois : null,
    });
  }
  return saida;
}

/** Só o caminho da URL, sem host nem barra final, para casar com slug. */
export function caminhoDe(url) {
  try {
    return new URL(url).pathname.replace(/\/$/, "");
  } catch {
    return String(url ?? "").replace(/\/$/, "");
  }
}

/**
 * Impressões que ficaram nas donas contra as que ainda caem nos slugs redirecionados.
 *
 * É a medida que a atividade pede: consolidação promete CONCENTRAR sinal numa URL, e o
 * jeito de ver isso é o perdedor parar de aparecer enquanto a dona não perde volume.
 *
 * Um slug redirecionado pode seguir aparecendo por dias depois do 301, porque o Google
 * demora a reprocessar. O número que importa é ele cair de uma janela para a outra.
 */
export function concentracao(paginas, donas, perdedores) {
  const conjunto = (slugs) => new Set(slugs.map((s) => `/blog/${s}`));
  const dona = conjunto(donas);
  const perdedor = conjunto(perdedores);
  const soma = { donas: 0, perdedores: 0, cliquesDonas: 0, cliquesPerdedores: 0 };
  const porPagina = [];
  for (const l of paginas) {
    const caminho = caminhoDe(l.pagina);
    const ehDona = dona.has(caminho);
    const ehPerdedor = perdedor.has(caminho);
    if (!ehDona && !ehPerdedor) continue;
    const imp = num(l.impressoes);
    const cli = num(l.cliques);
    if (ehDona) {
      soma.donas += imp;
      soma.cliquesDonas += cli;
    } else {
      soma.perdedores += imp;
      soma.cliquesPerdedores += cli;
    }
    porPagina.push({ caminho, papel: ehDona ? "dona" : "perdedor", impressoes: imp, cliques: cli });
  }
  return { ...soma, porPagina: porPagina.sort((a, b) => b.impressoes - a.impressoes) };
}

/** "1.234" no padrão pt-BR, para a tabela do relatório. */
export const ptBr = (v) => Math.round(v).toLocaleString("pt-BR");

/** "+312" e "-45", porque delta sem sinal explícito se lê errado na tabela. */
export const comSinal = (v, casas = 0) =>
  `${v > 0 ? "+" : v < 0 ? "" : ""}${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
