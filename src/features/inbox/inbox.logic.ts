import type { ConversaDaLista } from "./api";

/**
 * Regras puras da caixa de entrada, fora do componente para terem teste.
 */

/**
 * Não lida = a última fala é do cliente e ninguém marcou depois dela.
 *
 * Derivado, sem contador: contador dessincroniza, e aqui o dado que importa (a última
 * mensagem e a marca de leitura) já está na linha. Conversa cuja última fala é do agente
 * não fica em negrito, porque ela já foi respondida.
 */
export function naoLida(c: ConversaDaLista): boolean {
  if (!c.ultima_em) return false;
  if (c.ultimo_papel === "assistant") return false;
  if (!c.lida_ate) return true;
  return new Date(c.lida_ate).getTime() < new Date(c.ultima_em).getTime();
}

export function contarNaoLidas(cs: ConversaDaLista[] | undefined): number {
  return (cs ?? []).filter(naoLida).length;
}

/** Telefone legível, no formato que a pessoa reconhece. */
export function rotuloDoTelefone(bruto: string): string {
  const d = (bruto ?? "").replace(/\D/g, "");
  if (d.length < 12) return bruto || "sem número";
  const ddd = d.slice(2, 4);
  const numero = d.slice(4);
  const meio = numero.length === 9 ? 5 : 4;
  return `(${ddd}) ${numero.slice(0, meio)}-${numero.slice(meio)}`;
}

/**
 * Horário curto, como numa lista de conversas: hora hoje, dia nos outros dias.
 */
export function quando(iso: string | null, agora = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mesmoDia = d.toDateString() === agora.toDateString();
  return mesmoDia
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export type FiltroDaCaixa = "todas" | "nao-lidas" | "assumidas";

/**
 * Busca e filtro, na mesma passada.
 *
 * A busca casa telefone (só dígitos, para "41 98814" achar) e o texto da prévia. Não
 * busca dentro da conversa inteira: isso é consulta no servidor, e a lista já traz o que
 * a tela mostra.
 */
export function filtrar(
  cs: ConversaDaLista[] | undefined,
  filtro: FiltroDaCaixa,
  busca: string,
): ConversaDaLista[] {
  const termo = busca.trim().toLowerCase();
  const digitos = termo.replace(/\D/g, "");

  return (cs ?? []).filter((c) => {
    if (filtro === "nao-lidas" && !naoLida(c)) return false;
    if (filtro === "assumidas" && !c.assumida_por) return false;
    if (!termo) return true;

    const noTelefone = digitos.length > 0 && (c.telefone ?? "").includes(digitos);
    const noTexto = (c.ultimo_texto ?? "").toLowerCase().includes(termo);
    return noTelefone || noTexto;
  });
}

/**
 * O texto de uma fala, pronto para a tela.
 *
 * O WhatsApp entrega anexo como um marcador de texto, e ele chegava cru na conversa:
 * `\[Image]` seguido de `[Attached image/jpeg file]`. Isso vaza formato de integração
 * para quem só quer ler a conversa. Vira uma frase curta dizendo o que era.
 */
export function textoDaFala(bruto: string): string {
  const t = (bruto ?? "").trim();

  const anexo = t.match(/^\\?\[(Image|Audio|Video|Document|Sticker)\]/i);
  if (anexo) {
    const tipo = anexo[1].toLowerCase();
    const nome =
      tipo === "image" ? "imagem"
      : tipo === "audio" ? "áudio"
      : tipo === "video" ? "vídeo"
      : tipo === "sticker" ? "figurinha"
      : "documento";
    // O resto do marcador (`[Attached image/jpeg file]`) sai junto: é ruído de formato.
    const sobra = t.replace(/^\\?\[[^\]]*\]/, "").replace(/\[Attached[^\]]*\]/gi, "").trim();
    return sobra ? `(${nome}) ${sobra}` : `(${nome})`;
  }

  return t;
}

/**
 * A prévia da lista, sem marcação.
 *
 * A conversa guarda markdown (`**Aeropark**`), e a bolha da conversa o interpreta. A
 * lista não: ela mostra uma linha de texto, e os asteriscos apareciam crus. Tirar a
 * marcação aqui é mais honesto que interpretá-la, porque numa linha só o negrito não
 * acrescenta nada e o asterisco atrapalha a leitura.
 */
export function previa(bruto: string | null): string {
  return textoDaFala(bruto ?? "")
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/(?<!\*)\*(?!\*)([^*\n]+?)\*(?!\*)/g, "$1")
    .replace(/(?<!_)_(?!_)([^_\n]+?)_(?!_)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
