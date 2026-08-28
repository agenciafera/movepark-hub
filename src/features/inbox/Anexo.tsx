import * as React from "react";
import { DownloadSimple, FileArrowDown, FilePdf } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAnexo, type AnexoDaFala } from "./api";

/**
 * Um anexo da conversa: imagem, figurinha, áudio, vídeo ou arquivo.
 *
 * ## Por que carrega sozinho
 *
 * O adapter guarda a mídia inline, em base64, dentro da mensagem. Medido no banco: média
 * de 319 KB por anexo, um de 1,6 MB, e uma conversa somando 2,8 MB. Trazer isso junto da
 * conversa faria a tela esperar megabytes antes de mostrar a primeira linha. Aqui cada
 * anexo pede os próprios bytes, e a conversa abre em 5 KB.
 *
 * ## Baixar é `data:`, e não link
 *
 * O conteúdo já chega como `data:<mime>;base64,...`, então o `download` do âncora salva
 * direto, sem passar por rota nenhuma. Isso também evita criar uma URL pública para a
 * mídia de um cliente, que é o tipo de coisa que vaza depois.
 */
export function Anexo({
  threadId,
  messageId,
  anexo,
}: {
  threadId: string | null;
  messageId: string;
  anexo: AnexoDaFala;
}) {
  /**
   * Imagem e figurinha carregam sozinhas; áudio, vídeo e arquivo esperam um clique.
   *
   * Uma conversa com dez figurinhas ainda é leve; uma com dois áudios de dois minutos
   * não é. E ninguém abre uma conversa para ouvir tudo de uma vez.
   */
  const automatico = anexo.tipo === "imagem" || anexo.tipo === "figurinha";
  const [pedido, setPedido] = React.useState(automatico);
  const [aberto, setAberto] = React.useState(false);

  const dados = useAnexo(threadId, messageId, anexo.parte, pedido);
  const uri = dados.data?.dados;

  const rotulo =
    anexo.tipo === "figurinha" ? "Figurinha"
    : anexo.tipo === "imagem" ? "Imagem"
    : anexo.tipo === "audio" ? "Áudio"
    : anexo.tipo === "video" ? "Vídeo"
    : anexo.nome || "Arquivo";

  const tamanho = anexo.bytes >= 1024 * 1024
    ? `${(anexo.bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(anexo.bytes / 1024))} KB`;

  if (!pedido && !uri) {
    return (
      <button
        type="button"
        onClick={() => setPedido(true)}
        className="flex items-center gap-2 rounded-sm border border-neutral-200 px-3 py-2 text-body-sm text-body hover:bg-neutral-50"
      >
        <FileArrowDown size={18} />
        {rotulo} · {tamanho}
      </button>
    );
  }

  if (dados.isPending && !uri) {
    return <p className="text-body-sm text-muted">Carregando {rotulo.toLowerCase()}…</p>;
  }

  if (dados.isError && !uri) {
    return (
      <p className="text-body-sm text-red-700">
        Não consegui carregar {rotulo.toLowerCase()}.
      </p>
    );
  }

  if (!uri) return null;

  const nomeParaSalvar =
    anexo.nome || `${anexo.tipo}-${messageId.slice(0, 8)}.${anexo.mime.split("/")[1] ?? "bin"}`;

  /**
   * O preview abre por URL de blob, e não pelo `data:` direto.
   *
   * O Chrome recusa `data:` como origem de iframe, e o PDF simplesmente não apareceria.
   * O blob é criado só quando o popup abre e é liberado ao fechar, para a conversa não
   * acumular megabytes na memória da aba.
   */
  const daParaEspiar = anexo.tipo === "imagem" || anexo.tipo === "figurinha" || anexo.mime === "application/pdf";

  return (
    <div className="flex flex-col gap-1">
      {aberto && uri ? (
        <Previa
          uri={uri}
          mime={anexo.mime}
          nome={nomeParaSalvar}
          onFechar={() => setAberto(false)}
        />
      ) : null}

      {anexo.tipo === "figurinha" ? (
        // Figurinha é pequena por natureza: em tamanho de foto ela fica borrada.
        <button type="button" onClick={() => setAberto(true)} aria-label="Ver figurinha maior">
          <img src={uri} alt="Figurinha" className="h-32 w-32 object-contain" />
        </button>
      ) : anexo.tipo === "imagem" ? (
        <button type="button" onClick={() => setAberto(true)} aria-label="Ver imagem maior">
          <img
            src={uri}
            alt="Imagem enviada na conversa"
            className="max-h-80 rounded-sm object-contain"
          />
        </button>
      ) : anexo.tipo === "audio" ? (
        <audio controls src={uri} className="max-w-full" />
      ) : anexo.tipo === "video" ? (
        <video controls src={uri} className="max-h-80 rounded-sm" />
      ) : daParaEspiar ? (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="flex items-center gap-2 rounded-sm border border-neutral-200 px-3 py-2 text-body-sm text-body hover:bg-neutral-50"
        >
          <FilePdf size={18} /> Ver {rotulo}
        </button>
      ) : (
        <span className="flex items-center gap-2 text-body-sm text-body">
          <FileArrowDown size={18} /> {rotulo}
        </span>
      )}

      <a
        href={uri}
        download={nomeParaSalvar}
        className="flex items-center gap-1 text-body-sm text-mp-indigo hover:underline"
      >
        <DownloadSimple size={14} /> Baixar · {tamanho}
      </a>
    </div>
  );
}

/**
 * O anexo em tamanho grande, sem sair da conversa.
 *
 * Existe porque baixar para conferir uma foto ou um voucher é caminho longo demais para
 * quem está lendo a conversa. O botão de baixar continua aqui dentro: espiar não
 * substitui salvar.
 */
function Previa({
  uri,
  mime,
  nome,
  onFechar,
}: {
  uri: string;
  mime: string;
  nome: string;
  onFechar: () => void;
}) {
  /**
   * `data:` vira blob, e o blob é liberado ao fechar.
   *
   * O Chrome recusa `data:` como origem de iframe, então o PDF não apareceria. E sem o
   * `revokeObjectURL` a aba acumularia os megabytes de cada anexo já espiado.
   */
  const [blob, setBlob] = React.useState<string | null>(null);

  React.useEffect(() => {
    let url: string | undefined;
    let vivo = true;
    fetch(uri)
      .then((r) => r.blob())
      .then((b) => {
        if (!vivo) return;
        url = URL.createObjectURL(b);
        setBlob(url);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [uri]);

  const ehPdf = mime === "application/pdf";

  return (
    <Dialog open onOpenChange={(v) => (v ? undefined : onFechar())}>
      <DialogContent className="max-w-[900px]">
        <DialogTitle className="text-title-md text-ink">{nome}</DialogTitle>

        {!blob ? (
          <p className="text-body-sm text-muted">Abrindo…</p>
        ) : ehPdf ? (
          <iframe src={blob} title={nome} className="h-[70vh] w-full rounded-sm border border-neutral-200" />
        ) : (
          <img src={blob} alt={nome} className="max-h-[70vh] w-full object-contain" />
        )}

        <a
          href={uri}
          download={nome}
          className="flex items-center gap-1 text-body-sm text-mp-indigo hover:underline"
        >
          <DownloadSimple size={14} /> Baixar {nome}
        </a>
      </DialogContent>
    </Dialog>
  );
}
