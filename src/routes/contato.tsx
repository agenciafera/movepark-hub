import { Helmet } from "react-helmet-async";
import {
  ChatCircle,
  Clock,
  Envelope,
  FacebookLogo,
  InstagramLogo,
  LinkedinLogo,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { REDES } from "@/lib/redes";
import { EMAIL_SUPORTE, WHATSAPP_SUPORTE } from "@/lib/suporte";

/**
 * Página de canais, sem formulário.
 *
 * O formulário saiu em 14/08/2026 (atividade 86ak11613): pedia que a pessoa
 * escrevesse, mandasse e esperasse sem saber se tinha chegado, enquanto quem
 * precisa de ajuda já chama no WhatsApp. Saíram junto a Edge
 * `submit-contact-message`, a tabela `contact_message` e os templates de e-mail
 * dela, porque superfície pública sem tela que a use envelhece sem revisão.
 */

const CANAIS = [
  {
    icon: ChatCircle,
    title: "WhatsApp",
    desc: "O jeito mais rápido de falar com a equipe.",
    action: "Abrir conversa",
    href: WHATSAPP_SUPORTE.href,
  },
  {
    icon: Envelope,
    title: "E-mail",
    desc: EMAIL_SUPORTE,
    action: "Escrever e-mail",
    href: `mailto:${EMAIL_SUPORTE}`,
  },
  {
    icon: Clock,
    /* Dois atendimentos convivem aqui: o assistente do site responde sobre
       reserva a qualquer hora, a equipe atende em dia útil. Sem dizer de quem é
       cada janela, a home prometia 24h e esta página prometia horário
       comercial, e uma das duas parecia mentira. */
    title: "Atendimento com a equipe",
    desc: "Segunda a sexta, das 9h às 18h. Fora disso, o assistente do site responde.",
    action: null,
    href: null,
  },
];

/** Ícone de cada rede, casado pelo nome que vem de `REDES`. */
const ICONE_DA_REDE: Record<string, typeof WhatsappLogo> = {
  Instagram: InstagramLogo,
  Facebook: FacebookLogo,
  LinkedIn: LinkedinLogo,
};

export default function ContatoPage() {
  return (
    <>
      <Helmet>
        <title>Fale Conosco | Movepark</title>
        <meta
          name="description"
          content="Fale com a equipe Movepark pelo WhatsApp, e-mail ou redes sociais. Atendimento de segunda a sexta, das 9h às 18h."
        />
        <meta property="og:title" content="Fale Conosco | Movepark" />
        <meta property="og:url" content="https://hub.movepark.co/contato" />
        <link rel="canonical" href="https://hub.movepark.co/contato" />
      </Helmet>

      <div className="mx-auto w-full max-w-[1080px] px-4 py-12 desktop:px-8">
        <PageHeader
          variant="content"
          className="mb-10 max-w-xl"
          title="Fale conosco"
          description="Escolha o canal que preferir. No WhatsApp a resposta é mais rápida."
        />

        <div className="grid grid-cols-1 gap-8 desktop:grid-cols-2 desktop:gap-12">
          <div className="space-y-6">
            <h2 className="text-display-sm text-ink">Canais de atendimento</h2>
            <div className="space-y-4">
              {CANAIS.map((c) => (
                <div
                  key={c.title}
                  className="flex items-start gap-4 rounded-md border border-hairline bg-canvas p-4"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-mp-pale text-mp-indigo">
                    <c.icon className="h-5 w-5" />
                  </span>
                  <div className="flex-1">
                    <div className="text-title-sm text-ink">{c.title}</div>
                    <div className="mt-0.5 text-body-sm text-muted">{c.desc}</div>
                    {c.href && c.action && (
                      <a
                        href={c.href}
                        target={c.href.startsWith("http") ? "_blank" : undefined}
                        rel="noopener noreferrer"
                        className="mt-2 inline-block text-body-sm font-medium text-mp-indigo hover:underline"
                      >
                        {c.action} →
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-display-sm text-ink">Redes sociais</h2>
              <p className="text-body-sm text-muted">
                Também respondemos por mensagem direta.
              </p>
            </div>

            <div className="space-y-3">
              {REDES.map((rede) => {
                const Icone = ICONE_DA_REDE[rede.nome];
                return (
                  <a
                    key={rede.nome}
                    href={rede.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 rounded-md border border-hairline bg-canvas p-4 transition-colors hover:bg-surface-soft"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-mp-pale text-mp-indigo">
                      {Icone ? <Icone className="h-5 w-5" weight="fill" /> : null}
                    </span>
                    <span className="flex-1 text-title-sm text-ink">{rede.nome}</span>
                    <span aria-hidden className="text-body-sm text-muted">
                      →
                    </span>
                  </a>
                );
              })}
            </div>

            <div className="rounded-md bg-surface-soft px-5 py-4">
              <p className="text-body-sm text-muted">
                Também temos uma{" "}
                <a href="/faq" className="font-medium text-mp-indigo hover:underline">
                  Central de Perguntas Frequentes
                </a>{" "}
                que pode resolver sua dúvida rapidinho.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
