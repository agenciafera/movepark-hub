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
 * A tolerância é generosa de propósito (10%, com piso de 100 m): o texto arredonda
 * ("1,4 km" para 1.441 m) e o objetivo aqui é pegar erro de ordem de grandeza, não
 * discutir a segunda casa decimal. Ausência de número nunca falha: prosa sem
 * distância é escolha editorial legítima.
 *
 * Uso: bun run lint:distancias
 */

import fs from "node:fs";

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

/**
 * As distâncias afirmadas sobre uma unidade dentro de um texto.
 *
 * Só o PRIMEIRO número de distância depois do nome conta. Em português a frase que
 * atribui distância cola no nome ("a Aerovalet a 738 m"), e o segundo número da
 * janela quase sempre é de outra unidade ("a Aerovalet a 738 m e a Plenty Park a
 * 863 m"). Pegar todos transformava cada lista de duas unidades em falso positivo.
 *
 * Ignora o token logo depois de "R$", que é preço, não distância.
 *
 * `limite` marca a frase que declara um TETO ("os dois a menos de 900 m"). Ela não
 * afirma a distância da unidade, então a comparação vira "cabe embaixo do teto?".
 */
export function distanciasAfirmadas(texto, nomeUnidade) {
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
    const janela = texto.slice(de + nome.length, de + nome.length + JANELA);
    for (const m of janela.matchAll(TOKEN)) {
      const antes = janela.slice(Math.max(0, m.index - 14), m.index);
      if (/R\$\s*$/.test(antes)) continue;
      const metros = paraMetros(m[1], m[2]);
      if (metros == null) continue;
      achados.push({
        metros,
        trecho: `${m[1]} ${m[2]}`,
        limite: /(menos de|at[ée]|no m[aá]ximo|abaixo de)\s*$/i.test(antes),
      });
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
  for (const [nome, metros] of medido) {
    for (const achado of distanciasAfirmadas(texto, nome)) {
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
if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
