import type { AnexoDaFala, ConversaDaLista } from "./api";

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

/**
 * As páginas viram uma lista só, sem conversa repetida.
 *
 * A paginação é por cursor e a lista **se reordena sozinha**: a cada mensagem que chega,
 * a conversa pula para o topo. Quando o polling recarrega as páginas já abertas, uma
 * conversa que estava na página 2 pode ter subido para a 1 e aparecer nas duas. O React
 * avisava disso com "two children with the same key", e a pessoa via a mesma conversa
 * duas vezes na lista.
 *
 * Fica a primeira ocorrência, que é a mais recente: as páginas chegam em ordem.
 */
export function juntarPaginas(
  paginas: { conversas?: ConversaDaLista[] }[] | undefined,
): ConversaDaLista[] {
  const vistos = new Set<string>();
  const fora: ConversaDaLista[] = [];
  for (const pagina of paginas ?? []) {
    for (const c of pagina?.conversas ?? []) {
      if (vistos.has(c.id)) continue;
      vistos.add(c.id);
      fora.push(c);
    }
  }
  return fora;
}

export function contarNaoLidas(cs: ConversaDaLista[] | undefined): number {
  return (cs ?? []).filter(naoLida).length;
}

/**
 * Telefone legível, no formato que a pessoa reconhece.
 *
 * O sentinela `5500000000000` é o "sem cliente" da bolinha de teste do Manager.
 * Formatá-lo daria "(00) 00000-0000", um telefone que ninguém tem e que na lista
 * parece cliente de verdade.
 */
export function rotuloDoTelefone(bruto: string): string {
  const d = (bruto ?? "").replace(/\D/g, "");
  if (/^550+$/.test(d)) return "Teste sem cliente";
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
  const t = paraExibicao((bruto ?? "").trim());

  const anexo = t.match(/^\\?\[(Image|Audio|Video|Document|Sticker)\b/i);
  if (anexo) {
    const tipo = anexo[1].toLowerCase();
    const nome =
      tipo === "image" ? "imagem"
      : tipo === "audio" ? "áudio"
      : tipo === "video" ? "vídeo"
      : tipo === "sticker" ? "figurinha"
      : "documento";
    // O resto do marcador (`[Attached image/jpeg file]`) sai junto: é ruído de formato.
    // O `[^\]]*` cobre `[Document: voucher_359049.pdf]`, que traz o nome do arquivo
    // dentro do próprio marcador e por isso escapava de um casamento exato.
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
  // A prévia é UMA linha: o `\s+` achata o que a mensagem tinha de quebra.
  return semMarcacao(bruto).replace(/\s+/g, " ").trim();
}

/**
 * O mesmo texto sem a marcação, mas com as quebras de linha de pé.
 *
 * A lista achata tudo numa linha; a cópia da conversa não pode, senão a lista de
 * contatos que a Mia manda em três linhas vira um parágrafo emendado, e quem colar o
 * texto num modelo lê pior do que o cliente leu no WhatsApp.
 */
export function semMarcacao(bruto: string | null): string {
  return textoDaFala(bruto ?? "")
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/(?<!\*)\*(?!\*)([^*\n]+?)\*(?!\*)/g, "$1")
    .replace(/(?<!_)_(?!_)([^_\n]+?)_(?!_)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}

/**
 * Do dialeto do WhatsApp para o markdown que a bolha entende.
 *
 * A resposta do agente é guardada como ela sai para o cliente, e desde 27/08 isso é
 * dialeto do WhatsApp: negrito com **um** asterisco. A bolha do painel interpreta
 * markdown padrão, com dois, então `*Virapark*` chegava na tela com os asteriscos à
 * mostra.
 *
 * Converter na exibição, e não na gravação, é de propósito: o que está no banco tem que
 * continuar sendo exatamente o que o cliente recebeu.
 */
export function paraExibicao(texto: string): string {
  return texto
    .replace(/(?<!\*)\*(?!\*)([^\n*]+?)(?<!\*)\*(?!\*)/g, "**$1**")
    .replace(/(?<!~)~(?!~)([^\n~]+?)(?<!~)~(?!~)/g, "~~$1~~")
    // O WhatsApp escapa colchete e sublinhado do nome de arquivo; na tela isso é ruído.
    .replace(/\\([[\]_*~])/g, "$1");
}

/**
 * A conversa inteira em texto, no formato que o WhatsApp usa ao exportar.
 *
 * ```
 * [28/08/2026 20:00] (41) 98814-9449: ola
 * [28/08/2026 20:01] Mia: Para iniciarmos o seu atendimento...
 * ```
 *
 * Existe para a conversa sair daqui e ir para outro lugar: um chamado, um colega, um
 * modelo que vai ler e apontar o que a Mia errou. Texto puro é o que todo lugar aceita,
 * e por isso substituiu o link público de leitura.
 *
 * O markdown sai (`paraExibicao` já resolve o dialeto do WhatsApp) porque o destino é
 * leitura, não renderização. Anexo vira uma marca do que era: o arquivo não viaja no
 * texto, e fingir que a mensagem estava vazia esconderia que existiu um áudio ali.
 */
export function conversaEmTexto(
  falas: { papel: "cliente" | "agente"; autor: string; texto: string; em: string; anexos?: AnexoDaFala[] }[],
  telefoneDoCliente: string,
): string {
  const doCliente = rotuloDoTelefone(telefoneDoCliente);

  return (falas ?? [])
    .map((f) => {
      const quem = f.papel === "cliente" ? doCliente : f.autor || "Mia";
      const partes: string[] = [];
      const texto = semMarcacao(f.texto);
      if (texto) partes.push(texto);
      for (const a of f.anexos ?? []) {
        partes.push(a.nome ? `<${a.tipo}: ${a.nome}>` : `<${a.tipo}>`);
      }
      return `[${quandoCompleto(f.em)}] ${quem}: ${partes.join(" ")}`.trimEnd();
    })
    .join("\n");
}

/** Data e hora por extenso, como o WhatsApp escreve na exportação. */
export function quandoCompleto(iso: string, formatar = padraoBR): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return formatar(d);
}

function padraoBR(d: Date): string {
  const data = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${data} ${hora}`;
}
