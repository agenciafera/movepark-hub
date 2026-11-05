/**
 * Serializa o JSON-LD para ir dentro de `<script type="application/ld+json">`.
 *
 * Toda escrita de JSON-LD passa por aqui, nunca por `JSON.stringify` direto (guarda em
 * `jsonld-seguro.contract.test.ts`). O build pré-renderizado escreve o script com
 * `helmet.script.toString()`, e o react-helmet-async 1.3 cola o conteúdo entre as tags sem
 * escape. Como o `JSON.stringify` também não escapa `<`, um `</script>` dentro de qualquer texto
 * do schema fechava o script no HTML publicado. Esses textos vêm de quem não é da equipe: nome,
 * endereço e fotos da unidade (escopo `locations:write` do parceiro) e a FAQ da unidade (qualquer
 * membro da empresa).
 *
 * `<`, `>` e `&` só aparecem dentro de string no JSON, e lá `\u003c` é o mesmo caractere para
 * qualquer leitor de JSON: o buscador lê o dado igual. U+2028 e U+2029 vão junto porque fecham
 * linha em parte dos interpretadores de script.
 */
export function serializarJsonLd(dado: unknown): string {
  return (JSON.stringify(dado) ?? "").replace(
    /[<>&\u2028\u2029]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
