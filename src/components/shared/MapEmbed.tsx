/**
 * Embed de mapa (iframe). Componente próprio pelo mesmo motivo do YouTubeEmbed:
 * o happy-dom lança ao conectar um iframe nos testes, então mocká-lo remove a
 * rejeição não capturada que fazia o gate piscar.
 */
type Props = {
  src: string;
  title: string;
  className?: string;
};

export function MapEmbed({ src, title, className }: Props) {
  return <iframe title={title} src={src} className={className} loading="lazy" />;
}
