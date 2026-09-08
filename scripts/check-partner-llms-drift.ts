/**
 * Guard de drift do llms.txt dos sites de parceiro.
 *
 * Por que existe: o Wix pausa a atualização automática do llms.txt assim que o
 * arquivo é editado à mão. O arquivo automático é ruim (um link só, nenhum
 * preço), então assumir a edição vale a pena, mas o texto passa a depender de
 * alguém lembrar de revisar na virada de tabela. Este guard troca a lembrança
 * por uma checagem: todo preço, e-mail e telefone que o llms.txt afirma precisa
 * continuar existindo na página viva que ele mesmo aponta.
 *
 * Uso: bun run lint:partner-llms
 * Sai com código 1 quando encontra drift ou link morto.
 */

import {
  extractAssertions,
  extractLinks,
  findDrift,
  formatReport,
} from "@/features/partner-sites/llms-drift.logic";

/** Sites de parceiro com llms.txt sob curadoria da Movepark. */
const SITES = [
  {
    nome: "virapark.com.br",
    llms: "https://www.virapark.com.br/llms.txt",
    /** Páginas onde os fatos do llms.txt precisam se sustentar. */
    paginas: [
      "https://www.virapark.com.br/precos",
      "https://www.virapark.com.br/faq",
      "https://www.virapark.com.br/politica-reserva",
      "https://www.virapark.com.br/como-chegar",
    ],
  },
];

const UA = "Mozilla/5.0 (compatible; MoveparkLlmsDriftGuard/1.0)";

async function fetchText(url: string): Promise<string> {
  // Cache-buster: o Cloudflare do Wix serve HIT e já escondeu publicação antes.
  const sep = url.includes("?") ? "&" : "?";
  const res = await fetch(`${url}${sep}_nc=${Date.now()}`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res.text();
}

/** Texto visível de uma página, sem script, style e tags. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

async function linkResponde(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "GET", headers: { "User-Agent": UA } });
    return res.ok;
  } catch {
    return false;
  }
}

let houveFalha = false;

for (const site of SITES) {
  const llms = await fetchText(site.llms);
  const assertions = extractAssertions(llms);

  const paginas = await Promise.all(site.paginas.map((p) => fetchText(p).catch(() => "")));
  const corpo = paginas.map(visibleText).join("\n");

  const drift = findDrift(assertions, corpo);

  // Link morto no llms.txt é pior que link ausente: manda o crawler para o vazio.
  const links = extractLinks(llms).filter((l) => l.url.includes(site.nome.replace("www.", "")));
  const vivos = await Promise.all(links.map((l) => linkResponde(l.url)));
  const quebrados = links.filter((_, i) => !vivos[i]);

  const relatorio = formatReport(site.nome, drift, quebrados);
  if (relatorio) {
    console.error("❌ " + relatorio);
    console.error(
      `\n   Fonte viva dos valores: ${site.paginas[0]}\n` +
        `   Edite o arquivo em: Wix > SEO e GEO > llms.txt > Mais ações > Editar arquivo\n`,
    );
    houveFalha = true;
  } else {
    console.log(
      `✓ ${site.nome}: ${assertions.length} afirmações do llms.txt conferem com o site, ` +
        `${links.length} links respondem.`,
    );
  }
}

if (houveFalha) process.exit(1);
