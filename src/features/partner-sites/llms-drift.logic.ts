/**
 * Guarda de drift do llms.txt dos sites de parceiro.
 *
 * Contexto: o Wix gera o llms.txt automaticamente, mas o arquivo automático traz
 * um link só (a home) e nenhum preço, o que derruba a chance de citação em IA.
 * Ao assumir o arquivo à mão, o Wix pausa a atualização automática, e aí o texto
 * pode envelhecer sozinho na virada de tabela.
 *
 * Este módulo não tenta reescrever o arquivo. Ele checa uma invariante barata e
 * de baixo falso-positivo: **todo valor que o llms.txt afirma precisa existir na
 * página viva que ele mesmo aponta**. Se a tabela mudar na /precos e ninguém
 * atualizar o llms.txt, o preço órfão aparece aqui.
 *
 * A lógica é pura de propósito (rede fica no runner, scripts/check-partner-llms-drift.ts).
 */

/** Uma afirmação do llms.txt que precisa se sustentar na página viva. */
export type Assertion = {
  /** Categoria, só para o relatório ficar legível. */
  kind: "dinheiro" | "email" | "telefone";
  /** O texto exato como aparece no llms.txt. */
  value: string;
};

export type LinkRef = {
  /** Rótulo do link em markdown, ou o texto do item. */
  label: string;
  url: string;
};

/**
 * Normaliza para comparação: tira acento, troca nbsp por espaço comum, colapsa
 * espaço e baixa a caixa. Sem isso, "R$ 174,30" no llms.txt não casa com
 * "R$&nbsp;174,30" no HTML do Wix.
 */
export function normalizeForMatch(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u00a0\u202f\u2009]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

/** Normaliza um valor em reais para a forma canônica "r$ 1234,56". */
export function normalizeMoney(input: string): string {
  const digits = input.replace(/[^\d,.]/g, "").replace(/\.(?=\d{3}\b)/g, "");
  return `r$ ${digits}`;
}

/** Normaliza telefone para só dígitos, para casar mesmo com máscara diferente. */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "");
}

const MONEY_RE = /R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}/g;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /\(\d{2}\)\s?\d{4,5}-?\d{4}/g;
const MD_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

/**
 * Colhe do llms.txt tudo que é verificável contra a página viva.
 *
 * Só entra o que é fato conferível. Prosa e descrição ficam de fora de propósito:
 * o guard existe para pegar número velho, não para brigar com redação.
 */
export function extractAssertions(llmsTxt: string): Assertion[] {
  const seen = new Set<string>();
  const out: Assertion[] = [];

  const push = (kind: Assertion["kind"], value: string, key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, value });
  };

  for (const m of llmsTxt.matchAll(MONEY_RE)) {
    push("dinheiro", m[0], `dinheiro:${normalizeMoney(m[0])}`);
  }
  for (const m of llmsTxt.matchAll(EMAIL_RE)) {
    push("email", m[0], `email:${m[0].toLowerCase()}`);
  }
  for (const m of llmsTxt.matchAll(PHONE_RE)) {
    push("telefone", m[0], `telefone:${normalizePhone(m[0])}`);
  }

  return out;
}

/** Colhe os links do llms.txt, para checar que nenhum aponta para o vazio. */
export function extractLinks(llmsTxt: string): LinkRef[] {
  const seen = new Set<string>();
  const out: LinkRef[] = [];
  for (const m of llmsTxt.matchAll(MD_LINK_RE)) {
    const url = m[2];
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ label: m[1], url });
  }
  return out;
}

/** Uma afirmação que não se sustenta na página viva. */
export type Drift = Assertion & { reason: string };

/**
 * Devolve as afirmações do llms.txt que sumiram do site.
 *
 * `siteText` é a concatenação do texto visível das páginas que o llms.txt aponta.
 * A comparação é por conteúdo normalizado, não por string crua, para não acusar
 * drift por causa de nbsp ou acento.
 */
export function findDrift(assertions: Assertion[], siteText: string): Drift[] {
  const haystack = normalizeForMatch(siteText);
  const haystackDigits = haystack.replace(/\D/g, "");

  // Dinheiro compara conjunto contra conjunto, não substring. Comparar texto cru
  // dava falso positivo bobo: o llms.txt escreve "R$ 1.200,00" e a página também,
  // mas a canonização tira o ponto de milhar de um lado só e "r$ 1200,00" nunca
  // aparecia dentro de "r$ 1.200,00". O guard acusou isso em si mesmo no 1o run.
  const moneyNoSite = new Set(
    [...siteText.matchAll(MONEY_RE)].map((m) => normalizeMoney(m[0])),
  );

  return assertions.flatMap((a) => {
    if (a.kind === "dinheiro") {
      if (moneyNoSite.has(normalizeMoney(a.value))) return [];
      return [{ ...a, reason: "valor não aparece mais nas páginas do site" }];
    }
    if (a.kind === "telefone") {
      if (haystackDigits.includes(normalizePhone(a.value))) return [];
      return [{ ...a, reason: "telefone não aparece mais nas páginas do site" }];
    }
    if (haystack.includes(normalizeForMatch(a.value))) return [];
    return [{ ...a, reason: "e-mail não aparece mais nas páginas do site" }];
  });
}

/** Monta o relatório de saída. Vazio quando está tudo em pé. */
export function formatReport(site: string, drift: Drift[], brokenLinks: LinkRef[]): string {
  if (drift.length === 0 && brokenLinks.length === 0) return "";

  const linhas = [`Drift no llms.txt de ${site}:`];
  for (const d of drift) {
    linhas.push(`  [${d.kind}] ${d.value}: ${d.reason}`);
  }
  for (const l of brokenLinks) {
    linhas.push(`  [link] ${l.url}: não responde 200 (rótulo: "${l.label}")`);
  }
  return linhas.join("\n");
}
