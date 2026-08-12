/** Teto de caracteres por fala. Perto disso o Chrome começa a cortar no meio. */
const LIMITE = 180;

/**
 * Quebra o texto do post nas falas que vão para a fila do sintetizador.
 *
 * Mandar o post inteiro numa `SpeechSynthesisUtterance` só funciona no Safari. O
 * Chrome corta perto dos 15 segundos, e o leitor perde o resto sem nenhum aviso.
 * Em falas curtas o corte não acontece, e a fila continua de onde parou.
 *
 * O corte é em fim de frase, não em número de caracteres: quebrar no meio de uma
 * frase faz a voz baixar o tom como se tivesse terminado, e a leitura sai picada.
 * Frase mais longa que o teto (o acervo tem algumas de 300 caracteres) cai para o
 * corte por palavra, que ao menos não parte a palavra ao meio.
 */
export function falasDe(texto: string, limite = LIMITE): string[] {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (!limpo) return [];

  const frases = limpo.match(/[^.!?]+[.!?]*\s*/g) ?? [limpo];
  const falas: string[] = [];
  let atual = "";

  const fechar = () => {
    const t = atual.trim();
    if (t) falas.push(t);
    atual = "";
  };

  for (const frase of frases) {
    const f = frase.trim();
    if (!f) continue;

    if (f.length > limite) {
      fechar();
      falas.push(...porPalavra(f, limite));
      continue;
    }
    if (atual.length + f.length + 1 > limite) fechar();
    atual = atual ? `${atual} ${f}` : f;
  }
  fechar();

  return falas;
}

function porPalavra(frase: string, limite: number): string[] {
  const out: string[] = [];
  let atual = "";
  for (const palavra of frase.split(" ")) {
    if (atual && atual.length + palavra.length + 1 > limite) {
      out.push(atual);
      atual = palavra;
    } else {
      atual = atual ? `${atual} ${palavra}` : palavra;
    }
  }
  if (atual) out.push(atual);
  return out;
}
