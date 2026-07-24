/**
 * Embed de vídeo do YouTube. Fica num componente próprio para os testes poderem
 * mocká-lo: o happy-dom lança ao conectar um iframe (page loading desabilitado),
 * e a rejeição não capturada deixava o gate de testes piscar vermelho.
 */
type Props = {
  videoId: string;
  title: string;
  className?: string;
};

export function YouTubeEmbed({ videoId, title, className }: Props) {
  return (
    <iframe
      className={className}
      src={`https://www.youtube.com/embed/${videoId}`}
      title={title}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
  );
}
