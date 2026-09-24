/**
 * Guarda de distância: número em texto de FAQ tem que bater com o PostGIS.
 *
 * Por que existe. A varredura de 08/09/2026 achou oito afirmações de distância
 * escritas à mão que não batiam com a medição do banco, em quatro praças, com fator
 * de até 9x (a FAQ dizia que a Aerovalet fica "a 480 m do terminal" em Guarulhos e
 * o `st_distance` media 4.549 m). Pior: a mesma página publicava os dois números, um
 * na resposta e outro na seção "Distância até o terminal", que lê o dado medido.
 *
 * Distância declarada é justamente o campo que um comparador força a favor de quem
 * ele quer destacar. O nosso diferencial é medir (ADR-001), e um número que nós
 * mesmos desmentimos na mesma página custa mais credibilidade do que o número bonito
 * compra. Este script existe para a próxima edição manual não desfazer isso em
 * silêncio.
 *
 * Como decide. Para cada FAQ de escopo `destination`, procura o nome de cada unidade
 * parceira daquele destino no texto e, na JANELA logo depois do nome, procura um
 * token de distância. Achou, compara com o medido.
 *
 * Quando os nomes vêm em lista ("Nationpark e Abbapark ... a 1,4 km e a 2,6 km"), as
 * distâncias também vêm em lista e na mesma ordem, então o par sai pela posição. Ler
 * só o primeiro token dava a distância do primeiro nome a todos os outros, e isso
 * reprovou uma frase correta em 18/09/2026.
 *
 * A tolerância é generosa de propósito (10%, com piso de 100 m): o texto arredonda
 * ("1,4 km" para 1.441 m) e o objetivo aqui é pegar erro de ordem de grandeza, não
 * discutir a segunda casa decimal. Ausência de número nunca falha: prosa sem
 * distância é escolha editorial legítima.
 *
 * Uso: bun run lint:distancias
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
    if (linha) return linha.slice(chave.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return process.env[chave] ?? "";
}

/** Janela depois do nome da unidade onde um número ainda fala dela. */
const JANELA = 60;
/** Janela ANTES do nome, para a forma \"738 m na Aerovalet\". Curta de propósito. */
const ANTES = 18;
const TOLERANCIA = 0.1;
const PISO_METROS = 100;

/** "1,4 km" e "979 m" viram metros. Devolve null quando não é distância. */
export function paraMetros(valor, unidade) {
  const n = Number(valor.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return unidade === "km" ? Math.round(n * 1000) : Math.round(n);
}

const TOKEN = /(\d+(?:[.,]\d+)?)\s?(km|m)\b/g;

/** Liga dois itens de uma enumeração: "A e B", "A, B", "A, e B". */
const CONECTOR_NOMES = /^(?:\s*,\s*(?:e\s+)?|\s+e\s+)$/i;
/** Liga dois valores da mesma enumeração: " e a ", ", ", " e de ". */
const CONECTOR_VALORES = /^(?:\s*,\s*(?:e\s+)?|\s+e\s+)(?:(?:a|à|de|d[ao]s?)\s+)?$/i;
/** Palavra que transforma a afirmação em teto, não em medida. */
const TETO = /(menos de|at[ée]|no m[aá]ximo|abaixo de)\s*$/i;
/** Cifrão colado no número: é preço, não distância. */
const PRECO = /R\$\s*$/;

/** O nome conhecido que começa logo depois de `pos`, ligado só por conector. */
function nomeSeguinteLigado(texto, pos, nomes) {
  const alvo = texto.toLowerCase();
  let melhor = null;
  for (const n of nomes) {
    if (!n) continue;
    const de = alvo.indexOf(n.toLowerCase(), pos);
    if (de === -1 || de < pos) continue;
    if (!CONECTOR_NOMES.test(texto.slice(pos, de))) continue;
    const fim = de + n.length;
    if (melhor == null || de < melhor.de || (de === melhor.de && fim > melhor.fim)) {
      melhor = { de, fim };
    }
  }
  return melhor;
}

/** O nome conhecido que termina logo antes de `pos`, ligado só por conector. */
function nomeAnteriorLigado(texto, pos, nomes) {
  const alvo = texto.toLowerCase();
  let melhor = null;
  for (const n of nomes) {
    if (!n) continue;
    const de = alvo.lastIndexOf(n.toLowerCase(), pos);
    if (de === -1 || de >= pos) continue;
    const fim = de + n.length;
    if (fim > pos || !CONECTOR_NOMES.test(texto.slice(fim, pos))) continue;
    if (melhor == null || de < melhor.de) melhor = { de, fim };
  }
  return melhor;
}

/**
 * A enumeração de unidades em que este nome está: "Nationpark e Abbapark".
 *
 * Devolve a posição do nome na lista, o tamanho dela e onde ela termina. Lista de um
 * nome só (o caso comum) volta com `tamanho: 1` e não muda nada.
 */
export function grupoDeNomes(texto, de, nome, nomes) {
  let inicio = de;
  let posicao = 0;
  for (;;) {
    const anterior = nomeAnteriorLigado(texto, inicio, nomes);
    if (!anterior || anterior.de >= inicio) break;
    inicio = anterior.de;
    posicao += 1;
  }
  let fim = de + nome.length;
  let tamanho = posicao + 1;
  for (;;) {
    const seguinte = nomeSeguinteLigado(texto, fim, nomes);
    if (!seguinte) break;
    fim = seguinte.fim;
    tamanho += 1;
  }
  return { posicao, tamanho, fim };
}

/**
 * A sequência de distâncias logo depois de `desde`, enquanto um valor estiver ligado
 * ao anterior só por conector ("a 1,4 km e a 2,6 km").
 *
 * Qualquer outra prosa no meio encerra a sequência. É isso que impede o pareamento de
 * inventar par: só é lista de distâncias o que foi escrito como lista.
 */
export function corridaDeDistancias(texto, desde) {
  const regiao = texto.slice(desde, desde + JANELA + 240);
  const brutos = [];
  for (const m of regiao.matchAll(TOKEN)) {
    const metros = paraMetros(m[1], m[2]);
    if (metros == null) continue;
    brutos.push({
      metros,
      de: m.index,
      fim: m.index + m[0].length,
      trecho: `${m[1]} ${m[2]}`,
      antes: regiao.slice(Math.max(0, m.index - 14), m.index),
    });
  }
  const primeiro = brutos.findIndex((t) => !PRECO.test(t.antes));
  if (primeiro === -1 || brutos[primeiro].de > JANELA) return [];
  const corrida = [brutos[primeiro]];
  for (let i = primeiro + 1; i < brutos.length; i += 1) {
    if (PRECO.test(brutos[i].antes)) break;
    if (!CONECTOR_VALORES.test(regiao.slice(brutos[i - 1].fim, brutos[i].de))) break;
    corrida.push(brutos[i]);
  }
  return corrida;
}

/**
 * As distâncias afirmadas sobre uma unidade dentro de um texto.
 *
 * Só o PRIMEIRO número de distância depois do nome conta. Em português a frase que
 * atribui distância cola no nome ("a Aerovalet a 738 m"), e o segundo número da
 * janela quase sempre é de outra unidade ("a Aerovalet a 738 m e a Plenty Park a
 * 863 m"). Pegar todos transformava cada lista de duas unidades em falso positivo.
 *
 * A exceção é a ENUMERAÇÃO PARALELA, em que os nomes vêm em lista e as distâncias
 * vêm depois, na mesma ordem: "Nationpark e Abbapark ficam fora do aeroporto, a
 * 1,4 km e a 2,6 km do terminal". Ali o primeiro token não fala da segunda unidade,
 * e ler só ele reprovava uma frase correta (foi o que travou o CI em 18/09/2026).
 * Quando a contagem de nomes bate com a de distâncias, o par sai pela ordem; quando
 * não bate, o guarda volta para a leitura de sempre em vez de adivinhar. Por isso
 * "os dois a menos de 900 m" continua sendo teto compartilhado, não par.
 *
 * `nomesConhecidos` são as outras unidades do mesmo destino, que é como o script
 * sabe onde a lista de nomes começa e termina sem chutar por letra maiúscula.
 *
 * Ignora o token logo depois de "R$", que é preço, não distância.
 *
 * `limite` marca a frase que declara um TETO ("os dois a menos de 900 m"). Ela não
 * afirma a distância da unidade, então a comparação vira "cabe embaixo do teto?".
 */
export function distanciasAfirmadas(texto, nomeUnidade, nomesConhecidos = []) {
  const achados = [];
  const alvo = texto.toLowerCase();
  const nome = nomeUnidade.toLowerCase();
  let de = alvo.indexOf(nome);
  while (de !== -1) {
    // O português atribui distância dos dois lados do nome: "a Aerovalet a 738 m" e
    // "738 m na Aerovalet". Quando o número vem colado ANTES, é dele que a frase fala,
    // e olhar só para a frente pegaria o número da unidade seguinte da lista.
    const atras = texto.slice(Math.max(0, de - ANTES), de);
    const colado = [...atras.matchAll(TOKEN)].pop();
    if (colado && /^[\s,;:]*(n[ao]s?|em|de|d[ao]s?)?\s*$/i.test(atras.slice(colado.index + colado[0].length))) {
      const metros = paraMetros(colado[1], colado[2]);
      if (metros != null) {
        achados.push({ metros, trecho: `${colado[1]} ${colado[2]}`, limite: false });
        de = alvo.indexOf(nome, de + 1);
        continue;
      }
    }
    const grupo = grupoDeNomes(texto, de, nome, nomesConhecidos);
    if (grupo.tamanho > 1) {
      const corrida = corridaDeDistancias(texto, grupo.fim);
      if (corrida.length === grupo.tamanho) {
        const par = corrida[grupo.posicao];
        achados.push({ metros: par.metros, trecho: par.trecho, limite: TETO.test(par.antes) });
        de = alvo.indexOf(nome, de + 1);
        continue;
      }
    }
    const janela = texto.slice(de + nome.length, de + nome.length + JANELA);
    for (const m of janela.matchAll(TOKEN)) {
      const antes = janela.slice(Math.max(0, m.index - 14), m.index);
      if (PRECO.test(antes)) continue;
      const metros = paraMetros(m[1], m[2]);
      if (metros == null) continue;
      achados.push({ metros, trecho: `${m[1]} ${m[2]}`, limite: TETO.test(antes) });
      break; // só o primeiro token da janela fala desta unidade
    }
    de = alvo.indexOf(nome, de + 1);
  }
  return achados;
}

/**
 * Verdadeiro quando o número afirmado está longe demais do medido.
 *
 * Em afirmação de teto ("menos de 900 m"), só falha se a unidade estourar o teto.
 */
export function divergente(afirmado, medido, limite = false) {
  if (limite) return medido > afirmado;
  const folga = Math.max(PISO_METROS, medido * TOLERANCIA);
  return Math.abs(afirmado - medido) > folga;
}

async function main() {
  const SUPABASE_URL = env("VITE_SUPABASE_URL");
  const ANON_KEY = env("VITE_SUPABASE_ANON_KEY");

  async function rest(caminho) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`REST ${caminho}: ${res.status}`);
  return res.json();
}

  async function rpc(nome, body = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`RPC ${nome}: ${res.status}`);
  return res.json();
}

  if (!SUPABASE_URL || !ANON_KEY) {
    console.log("check-distancias-faq: sem VITE_SUPABASE_*, pulando (isto não é falha).");
    return 0;
  }

  const [indice, faqs] = await Promise.all([
  rpc("destination_price_index"),
  rest(
    "faq?select=question,answer,body_md,destination:destination(slug)" +
      "&scope=eq.destination&is_published=eq.true&deleted_at=is.null",
  ),
]);

// Uma distância medida por unidade, por destino. Nome da empresa é como o texto a chama.
const medidoPorDestino = new Map();
for (const dest of indice?.destinations ?? []) {
  const porNome = new Map();
  for (const u of dest.units ?? []) {
    if (u.distance_m == null) continue;
    const atual = porNome.get(u.company_name);
    if (atual == null || atual > u.distance_m) porNome.set(u.company_name, u.distance_m);
  }
  medidoPorDestino.set(dest.slug, porNome);
}

const problemas = [];
for (const f of faqs) {
  const slug = f.destination?.slug;
  const medido = slug ? medidoPorDestino.get(slug) : null;
  if (!medido) continue;
  const texto = `${f.answer ?? ""}\n${f.body_md ?? ""}`;
  const nomes = [...medido.keys()];
  for (const [nome, metros] of medido) {
    for (const achado of distanciasAfirmadas(texto, nome, nomes)) {
      if (divergente(achado.metros, metros, achado.limite)) {
        problemas.push(
          `  ${slug} · "${f.question}"\n` +
            `    ${nome}: o texto diz ${achado.trecho} e o PostGIS mede ${metros} m`,
        );
      }
    }
  }
}

if (problemas.length > 0) {
  console.error(
    `check-distancias-faq: ${problemas.length} distância(s) em FAQ divergindo da medida.\n\n` +
      problemas.join("\n") +
      "\n\nDistância em conteúdo sai do PostGIS (ADR-001), nunca de estimativa. Corrija o\n" +
      "texto, ou a geo da unidade se for ela que está errada. Publicar os dois números\n" +
      "na mesma página é o que a auditoria de 08/09/2026 apontou como a maior fraqueza\n" +
      "do comparador concorrente.",
  );
  return 1;
}

  console.log(`check-distancias-faq: ok, ${faqs.length} perguntas conferidas.`);
  return 0;
}

// Só roda a checagem quando chamado direto; o teste importa as funções puras.
if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) process.exit(await main());
