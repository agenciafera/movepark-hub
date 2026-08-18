import { Helmet } from "react-helmet-async";
import { Clock, Envelope } from "@phosphor-icons/react";
import { PageHero } from "@/components/shared/PageHero";
import { MARCA_DA_REDE, WhatsappMark } from "@/components/shared/SocialMarks";
import { REDES } from "@/lib/redes";
import { EMAIL_SUPORTE, WHATSAPP_SUPORTE } from "@/lib/suporte";
import { siteUrl } from "@/lib/site";

/**
 * Página de canais, sem formulário.
 *
 * O formulário saiu em 14/08/2026 (atividade 86ak11613): pedia que a pessoa
 * escrevesse, mandasse e esperasse sem saber se tinha chegado, enquanto quem
 * precisa de ajuda já chama no WhatsApp. Saíram junto a Edge
 * `submit-contact-message`, a tabela `contact_message` e os templates de e-mail
 * dela, porque superfície pública sem tela que a use envelhece sem revisão.
 *
 * O desenho de 17/08/2026 trocou o `PageHeader` pela faixa violeta do
 * `PageHero` e pôs os canais numa coluna só, à direita de quem a página atende.
 */

const CANAIS = [
  {
    /* A marca, e não o `WhatsappLogo` do Phosphor: as redes logo abaixo já usam
       a marca de cada plataforma, e o canal principal da página não podia ser o
       único desenhado pelo icon set. */
    icon: WhatsappMark,
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
    /* Aqui conviviam dois atendimentos, o assistente do site a qualquer hora e
       a equipe em dia útil. O assistente saiu do ar
       (`assistenteDoSiteLigado`), então sobrou uma janela só, e ela é a mesma
       que o card de ajuda da home mostra. */
    title: "Atendimento com a equipe",
    desc: "Segunda a sexta, das 9h às 18h. Fora desse horário, deixe a mensagem no WhatsApp que a gente responde no próximo dia útil.",
    action: null,
    href: null,
  },
];

/** Moldura do canal. Vira link quando o canal tem para onde levar. */
function Canal({ canal }: { canal: (typeof CANAIS)[number] }) {
  const Icone = canal.icon;
  const conteudo = (
    <>
      <Icone className="h-9 w-9 shrink-0 text-mp-navy" aria-hidden />
      <span className="min-w-0">
        <span className="block text-title-md text-ink">{canal.title}</span>
        <span className="mt-1 block text-body-sm text-body">{canal.desc}</span>
        {canal.action && (
          <span className="mt-2 inline-block text-body-sm font-medium text-mp-primary">
            {canal.action} →
          </span>
        )}
      </span>
    </>
  );

  const molde = "flex items-start gap-5 rounded-md border border-hairline bg-canvas p-6";

  if (!canal.href) {
    return <div className={molde}>{conteudo}</div>;
  }

  return (
    <a
      href={canal.href}
      target={canal.href.startsWith("http") ? "_blank" : undefined}
      rel="noopener noreferrer"
      className={`${molde} transition-colors hover:bg-surface-soft`}
    >
      {conteudo}
    </a>
  );
}

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
        <meta property="og:url" content={siteUrl("/contato")} />
        <link rel="canonical" href={siteUrl("/contato")} />
      </Helmet>

      <PageHero
        title="Fale conosco"
        description="Escolha o canal que preferir. No WhatsApp a resposta é mais rápida."
      />

      <div className="mx-auto w-full max-w-[1080px] px-4 py-12 desktop:px-8 desktop:py-16">
        <div className="grid grid-cols-1 gap-10 desktop:grid-cols-2 desktop:gap-12">
          <div>
            <h2 className="text-display-sm text-ink">Central de atendimento</h2>
            <p className="mt-4 max-w-[56ch] text-pretty text-body-md text-body">
              Fale com a gente sobre reserva, cancelamento, voucher ou qualquer outra dúvida.
            </p>
          </div>

          <div>
            <div className="space-y-4">
              {CANAIS.map((c) => (
                <Canal key={c.title} canal={c} />
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <span className="text-title-sm text-ink">Redes sociais:</span>
              {/* O alvo de toque de 44px é do link, não da marca: o glifo tem
                  24px e o resto é respiro clicável, que é o mínimo confortável
                  para o polegar. A fileira não tem `gap` porque esse respiro já
                  separa as marcas, e as margens negativas devolvem o espaço que
                  ele tomaria no layout. */}
              <div className="-my-2 -ml-2 flex items-center">
                {REDES.map((rede) => {
                  const Marca = MARCA_DA_REDE[rede.nome];
                  return (
                    <a
                      key={rede.nome}
                      href={rede.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={rede.nome}
                      className="flex h-11 w-11 items-center justify-center text-ink transition-colors hover:text-mp-primary"
                    >
                      {Marca ? <Marca /> : rede.nome}
                    </a>
                  );
                })}
              </div>
            </div>

            <div className="mt-8 rounded-md bg-mp-pale px-6 py-5">
              <p className="text-body-sm text-body">
                Também temos uma{" "}
                <a href="/faq" className="font-medium text-mp-indigo underline">
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
