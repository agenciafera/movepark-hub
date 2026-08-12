import * as React from "react";
import { Check, LinkSimple, LinkedinLogo, WhatsappLogo, XLogo } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

type Props = { title: string; url: string };

const BOTAO =
  "flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-muted transition-colors hover:border-mp-navy hover:text-ink";

/**
 * Compartilhar o post.
 *
 * Cada rede é um link comum para o endpoint público de compartilhamento dela, sem
 * SDK e sem script de terceiro: botão de rede social costuma vir com rastreador
 * embutido, e aqui o leitor só é levado para o site da rede quando clica.
 *
 * O botão de copiar depende da Clipboard API, que exige contexto seguro. Em HTTP
 * ele não existe, então some em vez de ficar na tela sem funcionar.
 */
export function PostShare({ title, url }: Props) {
  const [copiado, setCopiado] = React.useState(false);
  const [podeCopiar, setPodeCopiar] = React.useState(false);

  /*
    O teste do clipboard roda em efeito, não na renderização: o SSG monta este
    componente no servidor, onde `navigator` não existe, e decidir na primeira
    renderização do cliente faria a árvore divergir do HTML assado.
  */
  React.useEffect(() => {
    setPodeCopiar(typeof navigator !== "undefined" && !!navigator.clipboard);
  }, []);

  React.useEffect(() => {
    if (!copiado) return;
    const t = window.setTimeout(() => setCopiado(false), 2000);
    return () => window.clearTimeout(t);
  }, [copiado]);

  const redes = [
    {
      nome: "WhatsApp",
      Icone: WhatsappLogo,
      href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
    },
    {
      nome: "LinkedIn",
      Icone: LinkedinLogo,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    },
    {
      nome: "X",
      Icone: XLogo,
      href: `https://x.com/intent/post?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
    },
  ];

  return (
    <div className="flex items-center gap-2 print:hidden">
      {redes.map(({ nome, Icone, href }) => (
        <a
          key={nome}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Compartilhar no ${nome}`}
          className={BOTAO}
        >
          <Icone className="h-[18px] w-[18px]" aria-hidden />
        </a>
      ))}

      {podeCopiar && (
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(url).then(() => setCopiado(true))}
          aria-label={copiado ? "Link copiado" : "Copiar link"}
          className={cn(BOTAO, copiado && "border-mp-navy text-ink")}
        >
          {copiado ? (
            <Check className="h-[18px] w-[18px]" aria-hidden />
          ) : (
            <LinkSimple className="h-[18px] w-[18px]" aria-hidden />
          )}
        </button>
      )}

      {/* O estado do clique precisa chegar a quem usa leitor de tela. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copiado ? "Link copiado" : ""}
      </span>
    </div>
  );
}
