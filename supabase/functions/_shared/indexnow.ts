/**
 * Chave do protocolo IndexNow.
 *
 * **Não é segredo.** O protocolo exige que ela seja servida publicamente em
 * `https://movepark.co/<chave>.txt`, e é justamente por conseguir ler esse arquivo
 * que o buscador aceita a submissão. Guardar no Vault não protegeria nada e
 * quebraria a checagem de posse.
 *
 * O que **é** segredo é outra coisa: `indexnow_dispatch_key`, no Vault, que impede
 * qualquer um de chamar a Edge e enfileirar submissão em nome do site. São duas
 * chaves com nomes parecidos e propósitos opostos, então vale reler antes de mexer.
 *
 * A chave aparece em dois lugares: aqui e no nome do arquivo em `public/`. É o
 * mesmo problema de dois runtimes do host canônico, e a solução é a mesma: um
 * teste de contrato (`src/lib/indexnow.contract.test.ts`) reprova se os dois
 * divergirem.
 *
 * Trocar a chave só é preciso se ela vazar de um jeito que permita a terceiro
 * submeter URL nossa, o que na prática significa nunca: quem tem a chave só
 * consegue pedir recrawl de URL que já é do host.
 */
export const INDEXNOW_KEY = "ba2adbded014cba0e8df2ea4f3b21f43";

/** Endpoint do protocolo. A Microsoft repassa aos demais buscadores participantes. */
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** Teto de URLs por submissão. O protocolo aceita 10.000; 500 mantém o corpo pequeno. */
export const INDEXNOW_MAX_URLS = 500;
