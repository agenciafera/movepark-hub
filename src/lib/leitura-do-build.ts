/**
 * Leitura única por build: single-flight com prazo curto para consultas de tabela inteira.
 *
 * O build SSG roda um loader por página, e alguns loaders precisam do acervo inteiro
 * (todas as FAQs, todas as traduções) só para montar relacionadas, `hreflang` ou o
 * rótulo do aeroporto no idioma. Sem isto, cada página lia a tabela inteira de novo.
 * Medido no log em 27/11/2026: ~1.700 leituras de cada uma por build, ~260 MB só de
 * tradução de FAQ, e oito builds seguidos derrubaram a instância do banco por quase uma
 * hora.
 *
 * Mesmo desenho do `fetchPriceIndex`, que já resolvia isso para o índice de preços:
 * - chamadas simultâneas esperam a mesma promessa (o build renderiza páginas em paralelo);
 * - o resultado vale por `prazoMs` (5 minutos por padrão), o que cobre o build inteiro e,
 *   na navegação do site, evita reler a tabela a cada troca de página;
 * - erro NÃO fica guardado: a próxima chamada tenta de novo.
 *
 * Só serve para leitura PÚBLICA e igual para todo mundo. Nunca use para dado que depende
 * de quem está logado: o valor guardado seria servido a outra sessão.
 */

const limpezas = new Set<() => void>();

export function leituraDoBuild<T>(
  busca: () => Promise<T>,
  prazoMs = 5 * 60 * 1000,
): () => Promise<T> {
  let guardado: { em: number; valor: T } | null = null;
  let emAndamento: Promise<T> | null = null;

  limpezas.add(() => {
    guardado = null;
    emAndamento = null;
  });

  return () => {
    if (guardado && Date.now() - guardado.em < prazoMs) return Promise.resolve(guardado.valor);
    if (!emAndamento) {
      const atual = busca().then(
        (valor) => {
          guardado = { em: Date.now(), valor };
          if (emAndamento === atual) emAndamento = null;
          return valor;
        },
        (erro: unknown) => {
          if (emAndamento === atual) emAndamento = null;
          throw erro;
        },
      );
      emAndamento = atual;
    }
    return emAndamento;
  };
}

/** Esquece tudo o que foi guardado. Existe para os testes não vazarem dado entre si. */
export function limparLeiturasDoBuild(): void {
  for (const limpar of limpezas) limpar();
}
