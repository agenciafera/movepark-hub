import { rotuloDoTelefone, semMarcacao, quandoCompleto } from "./inbox.logic";
import { buscarAnexo, type AnexoDaFala } from "./api";

/**
 * A conversa desenhada como imagem, com as mesmas bolhas da tela.
 *
 * ## Por que no canvas, e não um print do DOM
 *
 * A alternativa seria `html2canvas` ou parente: uma dependência grande que reimplementa
 * meio CSS e erra em fonte, sombra e emoji. Aqui o desenho é de cinco formas (retângulo
 * arredondado, texto, nome, hora, marca de anexo), e o canvas faz isso sem dependência
 * nenhuma e com um resultado que não muda quando alguém mexe numa classe do Tailwind.
 *
 * O preço é que o layout é escrito à mão. Por isso ele mora aqui separado do desenho: a
 * conta de quebrar linha e empilhar bolha é pura e tem teste, e só o `desenhar` toca no
 * canvas.
 */

/** Mede a largura de um texto na fonte corrente. É o canvas quem sabe; o layout, não. */
export type Medida = (texto: string, negrito?: boolean) => number;

export type FalaParaImagem = {
  id?: string;
  papel: "cliente" | "agente";
  autor: string;
  texto: string;
  em: string;
  anexos?: AnexoDaFala[];
};

/**
 * Uma imagem já carregada e medida, pronta para entrar na bolha.
 *
 * O layout precisa do tamanho **antes** de empilhar, e o tamanho só existe depois que a
 * imagem carrega. Por isso o carregamento acontece fora, e o layout recebe isto pronto.
 * `fonte` é o que o canvas desenha; nos testes ela nem precisa existir.
 */
export type ImagemDaFala = {
  parte: number;
  largura: number;
  altura: number;
  fonte?: CanvasImageSource;
};

export type FalaComImagens = FalaParaImagem & { imagens?: ImagemDaFala[] };

/** O que o desenho recebe pronto: cada bolha com posição, tamanho e linhas já quebradas. */
export type BlocoDaImagem = {
  x: number;
  y: number;
  largura: number;
  altura: number;
  daEquipe: boolean;
  autor: string;
  hora: string;
  linhas: string[];
  /** Posição já resolvida de cada imagem, relativa ao canvas. */
  imagens: { x: number; y: number; largura: number; altura: number; fonte?: CanvasImageSource }[];
};

export type LayoutDaImagem = {
  largura: number;
  altura: number;
  titulo: string;
  blocos: BlocoDaImagem[];
};

export const MEDIDAS = {
  largura: 720,
  margem: 20,
  maxBolha: 520,
  padX: 14,
  padY: 10,
  linha: 21,
  /*
    O vão entre bolhas guarda a hora, que é desenhada logo abaixo da bolha. Com 12px
    ela encostava na bolha seguinte sempre que duas falas do mesmo lado vinham em
    sequência (aí não há nome no meio para abrir espaço).
  */
  entreBolhas: 26,
  alturaNome: 16,
  alturaCabecalho: 56,
  raio: 14,
  /*
    O teto da miniatura. A foto que o cliente manda vem em resolucao de celular, e sem
    teto uma unica imagem ocuparia mais que a conversa inteira.
  */
  maxImagem: 260,
  maxAlturaImagem: 300,
  entreImagens: 6,
} as const;

/** Encolhe a imagem para caber no teto da bolha, sem distorcer. */
export function medirImagem(
  largura: number,
  altura: number,
): { largura: number; altura: number } {
  if (largura <= 0 || altura <= 0) return { largura: 0, altura: 0 };
  const escala = Math.min(MEDIDAS.maxImagem / largura, MEDIDAS.maxAlturaImagem / altura, 1);
  return { largura: Math.round(largura * escala), altura: Math.round(altura * escala) };
}

/**
 * Uma imagem tem limite, e conversa não.
 *
 * O canvas para de desenhar por volta de 32k pixels de altura, e antes disso a imagem já
 * é ilegível e pesada demais para colar em qualquer lugar. Passando daqui, quem chamou
 * avisa e manda usar o texto, que não tem teto. Truncar em silêncio seria pior: a pessoa
 * compartilharia meia conversa achando que compartilhou toda.
 */
export const ALTURA_MAXIMA = 20000;

/** Quebra o texto na largura disponível, respeitando as quebras que já existem. */
export function quebrarLinhas(texto: string, largura: number, medir: Medida): string[] {
  const fora: string[] = [];

  for (const paragrafo of texto.split("\n")) {
    if (!paragrafo.trim()) {
      fora.push("");
      continue;
    }

    let atual = "";
    for (const palavra of paragrafo.split(/\s+/)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (medir(tentativa) <= largura || !atual) {
        // `|| !atual`: uma palavra sozinha maior que a linha (uma URL de voucher) fica
        // na linha mesmo assim. Quebrar no meio dela deixaria o link inutilizável.
        atual = tentativa;
        continue;
      }
      fora.push(atual);
      atual = palavra;
    }
    if (atual) fora.push(atual);
  }

  return fora;
}

/**
 * O texto da bolha: a fala sem marcação, mais a marca dos anexos que NÃO foram desenhados.
 *
 * A imagem que entrou na bolha não precisa de legenda dizendo que é uma imagem. A que
 * não entrou (um PDF, ou uma foto que falhou ao carregar) precisa, senão a mensagem
 * aparece vazia e some da conversa a informação de que havia um arquivo ali.
 */
export function textoParaImagem(f: FalaComImagens): string {
  const desenhadas = new Set((f.imagens ?? []).map((i) => i.parte));
  const partes: string[] = [];
  const texto = semMarcacao(f.texto);
  if (texto) partes.push(texto);
  for (const a of f.anexos ?? []) {
    if (desenhadas.has(a.parte)) continue;
    partes.push(a.nome ? `<${a.tipo}: ${a.nome}>` : `<${a.tipo}>`);
  }
  return partes.join("\n");
}

/**
 * Empilha as bolhas e devolve a altura total.
 *
 * O cliente à esquerda e quem atende à direita, igual à tela: quem receber a imagem lê
 * do mesmo jeito que quem atendeu leu.
 */
export function montarLayout(
  falas: FalaComImagens[],
  telefoneDoCliente: string,
  medir: Medida,
): LayoutDaImagem {
  const m = MEDIDAS;
  const larguraTexto = m.maxBolha - m.padX * 2;
  const doCliente = rotuloDoTelefone(telefoneDoCliente);

  const blocos: BlocoDaImagem[] = [];
  let y = m.alturaCabecalho;

  for (const f of falas ?? []) {
    const conteudo = textoParaImagem(f);
    const imagens = f.imagens ?? [];
    // Bolha sem texto E sem imagem é chamada de tool: viraria retângulo vazio.
    if (!conteudo && imagens.length === 0) continue;

    const daEquipe = f.papel !== "cliente";
    const linhas = conteudo ? quebrarLinhas(conteudo, larguraTexto, medir) : [];
    const larguraDaMaior = Math.max(
      ...linhas.map((l) => medir(l)),
      ...imagens.map((i) => i.largura),
      0,
    );
    const largura = Math.min(m.maxBolha, Math.ceil(larguraDaMaior) + m.padX * 2);
    const alturaImagens = imagens.reduce((t, i) => t + i.altura + m.entreImagens, 0);
    const alturaTexto = linhas.length * m.linha;
    const altura = alturaImagens + alturaTexto + m.padY * 2;

    // O nome só aparece de quem atende: o do cliente já está no cabeçalho, e repeti-lo
    // em cada bolha só empurraria a conversa para baixo.
    const autor = daEquipe ? f.autor || "Mia" : "";
    if (autor) y += m.alturaNome;

    const x = daEquipe ? m.largura - m.margem - largura : m.margem;

    // As imagens ficam no topo da bolha, e o texto vem depois: é a ordem do WhatsApp,
    // onde a legenda acompanha a foto por baixo.
    let yImagem = y + m.padY;
    const posicionadas = imagens.map((i) => {
      const pos = { x: x + m.padX, y: yImagem, largura: i.largura, altura: i.altura, fonte: i.fonte };
      yImagem += i.altura + m.entreImagens;
      return pos;
    });

    blocos.push({
      x,
      y,
      largura,
      altura,
      daEquipe,
      autor,
      hora: quandoCompleto(f.em),
      linhas,
      imagens: posicionadas,
    });

    y += altura + m.entreBolhas;
  }

  return {
    largura: m.largura,
    altura: Math.max(y + m.margem - m.entreBolhas, m.alturaCabecalho + m.margem),
    titulo: `Conversa com ${doCliente}`,
    blocos,
  };
}

const COR = {
  fundo: "#FFFFFF",
  cabecalho: "#29263F",
  nome: "#6A6A6A",
  bolhaCliente: "#F5F5F5",
  textoCliente: "#171717",
  bolhaEquipe: "#5D5FEF",
  textoEquipe: "#FFFFFF",
  /*
    Uma cor só para a hora dos dois lados: ela é desenhada FORA da bolha, sobre o fundo
    branco. Um tom claro combinando com o roxo sumia ali.
  */
  hora: "#8A8A8A",
} as const;

const FONTE = '"Inter var", Inter, -apple-system, system-ui, "Segoe UI", Arial, sans-serif';

function caminhoArredondado(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  l: number,
  a: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + l, y, x + l, y + a, r);
  ctx.arcTo(x + l, y + a, x, y + a, r);
  ctx.arcTo(x, y + a, x, y, r);
  ctx.arcTo(x, y, x + l, y, r);
  ctx.closePath();
}

/**
 * A conversa como PNG, pronta para a área de transferência.
 *
 * Desenha em `devicePixelRatio` (no mínimo 2) porque a imagem quase sempre é olhada com
 * zoom, e texto de 15px renderizado em 1x fica borrado ao ampliar.
 */
/**
 * Baixa e decodifica as fotos da conversa, uma fala de cada vez.
 *
 * Os bytes não vêm com a conversa: cada anexo é uma chamada, de propósito, para a tela
 * não esperar megabytes antes da primeira linha. Aqui a gente precisa deles, então
 * paga-se o custo só quando alguém pede a imagem.
 *
 * Anexo que falha ao carregar **não** derruba a cópia: ele volta a ser `<imagem>` no
 * texto da bolha, e o resto da conversa sai igual.
 */
async function carregarImagens(
  falas: FalaParaImagem[],
  threadId: string,
): Promise<FalaComImagens[]> {
  const desenhaveis = new Set(["imagem", "figurinha"]);

  return await Promise.all(
    (falas ?? []).map(async (f) => {
      const fotos = (f.anexos ?? []).filter((a) => desenhaveis.has(a.tipo));
      if (!threadId || !f.id || fotos.length === 0) return f;

      const imagens: ImagemDaFala[] = [];
      for (const a of fotos) {
        try {
          const { dados } = await buscarAnexo(threadId, f.id, a.parte);
          const el = new Image();
          el.src = dados;
          await el.decode();
          const { largura, altura } = medirImagem(el.naturalWidth, el.naturalHeight);
          if (largura > 0) imagens.push({ parte: a.parte, largura, altura, fonte: el });
        } catch {
          // Sem a foto, a marca de texto volta: some a imagem, não a informação.
        }
      }
      return { ...f, imagens };
    }),
  );
}

export async function conversaEmImagem(
  falas: FalaParaImagem[],
  telefoneDoCliente: string,
  threadId = "",
): Promise<Blob> {
  // A fonte precisa estar carregada antes de medir: medir com a fonte de fallback e
  // desenhar com a Inter daria bolha curta demais para o texto que ela recebe.
  await document.fonts?.ready;

  const escala = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este navegador não desenha a conversa em imagem.");

  const fonteTexto = `15px ${FONTE}`;
  ctx.font = fonteTexto;
  const medir: Medida = (t) => ctx.measureText(t).width;

  const layout = montarLayout(await carregarImagens(falas, threadId), telefoneDoCliente, medir);
  if (layout.altura > ALTURA_MAXIMA) {
    throw new Error("Conversa longa demais para virar imagem. Copie em texto.");
  }

  canvas.width = Math.ceil(layout.largura * escala);
  canvas.height = Math.ceil(layout.altura * escala);
  ctx.scale(escala, escala);

  ctx.fillStyle = COR.fundo;
  ctx.fillRect(0, 0, layout.largura, layout.altura);

  ctx.fillStyle = COR.cabecalho;
  ctx.font = `600 16px ${FONTE}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(layout.titulo, MEDIDAS.margem, 34);

  for (const b of layout.blocos) {
    if (b.autor) {
      ctx.fillStyle = COR.nome;
      ctx.font = `11px ${FONTE}`;
      const largura = ctx.measureText(b.autor).width;
      ctx.fillText(b.autor, b.daEquipe ? b.x + b.largura - largura : b.x, b.y - 5);
    }

    ctx.fillStyle = b.daEquipe ? COR.bolhaEquipe : COR.bolhaCliente;
    caminhoArredondado(ctx, b.x, b.y, b.largura, b.altura, MEDIDAS.raio);
    ctx.fill();

    for (const img of b.imagens) {
      if (!img.fonte) continue;
      ctx.save();
      // Canto arredondado na foto também: quadrado dentro de bolha arredondada
      // parece anexo colado por cima, e não parte da mensagem.
      caminhoArredondado(ctx, img.x, img.y, img.largura, img.altura, 8);
      ctx.clip();
      ctx.drawImage(img.fonte, img.x, img.y, img.largura, img.altura);
      ctx.restore();
    }

    const topoDoTexto =
      b.y +
      MEDIDAS.padY +
      b.imagens.reduce((t, i) => t + i.altura + MEDIDAS.entreImagens, 0);

    ctx.fillStyle = b.daEquipe ? COR.textoEquipe : COR.textoCliente;
    ctx.font = fonteTexto;
    b.linhas.forEach((linha, i) => {
      ctx.fillText(linha, b.x + MEDIDAS.padX, topoDoTexto + MEDIDAS.linha * i + 15);
    });

    ctx.fillStyle = COR.hora;
    ctx.font = `10px ${FONTE}`;
    const hora = ctx.measureText(b.hora).width;
    ctx.fillText(
      b.hora,
      b.daEquipe ? b.x + b.largura - hora : b.x,
      b.y + b.altura + 11,
    );
  }

  return await new Promise<Blob>((ok, erro) =>
    canvas.toBlob((b) => (b ? ok(b) : erro(new Error("Não consegui gerar a imagem."))), "image/png"),
  );
}
