import * as React from "react";
import { DownloadSimple, FileArrowDown, Sticker } from "@phosphor-icons/react";
import { useAnexo, useAnexoPublico, type AnexoDaFala } from "./api";

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
  token,
}: {
  threadId: string | null;
  messageId: string;
  anexo: AnexoDaFala;
  /** Na leitura pública o token é a credencial: não há sessão nem caixa de entrada. */
  token?: string;
}) {
  /**
   * Imagem e figurinha carregam sozinhas; áudio, vídeo e arquivo esperam um clique.
   *
   * Uma conversa com dez figurinhas ainda é leve; uma com dois áudios de dois minutos
   * não é. E ninguém abre uma conversa para ouvir tudo de uma vez.
   */
  const automatico = anexo.tipo === "imagem" || anexo.tipo === "figurinha";
  const [pedido, setPedido] = React.useState(automatico);

  const interno = useAnexo(threadId, messageId, anexo.parte, pedido && !token);
  const publico = useAnexoPublico(token ?? "", messageId, anexo.parte, pedido && !!token);
  const dados = token ? publico : interno;
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

  return (
    <div className="flex flex-col gap-1">
      {anexo.tipo === "figurinha" ? (
        // Figurinha é pequena por natureza: em tamanho de foto ela fica borrada.
        <img src={uri} alt="Figurinha" className="h-32 w-32 object-contain" />
      ) : anexo.tipo === "imagem" ? (
        <img src={uri} alt="Imagem enviada na conversa" className="max-h-80 rounded-sm object-contain" />
      ) : anexo.tipo === "audio" ? (
        <audio controls src={uri} className="max-w-full" />
      ) : anexo.tipo === "video" ? (
        <video controls src={uri} className="max-h-80 rounded-sm" />
      ) : (
        <span className="flex items-center gap-2 text-body-sm text-body">
          <Sticker size={18} /> {rotulo}
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
