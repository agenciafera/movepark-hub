import * as React from "react";
import { Helmet } from "react-helmet-async";
import { ChatCircle, Clock, Envelope } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";
import { useEnviarContato } from "@/features/contato/api";
import { EMAIL_SUPORTE, WHATSAPP_SUPORTE } from "@/lib/suporte";

type FormState = "idle" | "success";

/**
 * Nome do campo-armadilha.
 *
 * Ele existe no HTML, fica fora da tela e nunca recebe foco de teclado. Robô de
 * formulário preenche tudo que encontra, então valor aqui denuncia. A Edge
 * responde sucesso mesmo assim, em vez de erro: dizer "recusado" ensinaria o
 * robô a contornar.
 */
const CAMPO_ARMADILHA = "hp_field";

const CHANNELS = [
  {
    icon: ChatCircle,
    title: "WhatsApp",
    desc: "Fale direto com a equipe",
    action: "Iniciar conversa",
    href: WHATSAPP_SUPORTE.href,
  },
  {
    icon: Envelope,
    title: "E-mail",
    desc: EMAIL_SUPORTE,
    action: "Enviar e-mail",
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

export default function ContatoPage() {
  const [state, setState] = React.useState<FormState>("idle");
  const [nome, setNome] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [mensagem, setMensagem] = React.useState("");

  const [armadilha, setArmadilha] = React.useState("");
  const enviar = useEnviarContato();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    enviar.mutate(
      {
        name: nome,
        email,
        message: mensagem,
        page_url: typeof window !== "undefined" ? window.location.href : null,
        [CAMPO_ARMADILHA]: armadilha,
      },
      {
        /* Só limpa depois que a Edge confirmou. Limpar antes apagaria o que a
           pessoa escreveu junto com a chance de tentar de novo. */
        onSuccess: () => {
          setState("success");
          setNome("");
          setEmail("");
          setMensagem("");
        },
      },
    );
  }

  return (
    <>
      <Helmet>
        <title>Fale Conosco | Movepark</title>
        <meta
          name="description"
          content="Entre em contato com a equipe Movepark via WhatsApp, e-mail ou formulário. Estamos aqui para ajudar."
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
          description="Tem uma dúvida, sugestão ou precisa de ajuda com uma reserva? Nossa equipe está pronta para atender."
        />

        <div className="grid grid-cols-1 gap-10 desktop:grid-cols-2 desktop:gap-16">
          {/* Canais de contato */}
          <div className="space-y-6">
            <h2 className="text-display-sm text-ink">Canais de atendimento</h2>
            <div className="space-y-4">
              {CHANNELS.map((c) => (
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

          {/* Formulário */}
          <div className="rounded-md border border-hairline bg-canvas p-6 shadow-tier tablet:p-8">
            {state === "success" ? (
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-mp-pale text-mp-indigo">
                  <Envelope className="h-7 w-7" />
                </span>
                <h2 className="text-display-sm text-ink">Mensagem enviada!</h2>
                <p className="text-body-sm text-muted">
                  Recebemos sua mensagem e responderemos em até 1 dia útil.
                </p>
                <button
                  type="button"
                  onClick={() => setState("idle")}
                  className="text-body-sm font-medium text-mp-indigo hover:underline"
                >
                  Enviar outra mensagem
                </button>
              </div>
            ) : (
              <>
                <h2 className="mb-1 text-display-sm text-ink">Envie uma mensagem</h2>
                <p className="mb-6 text-body-sm text-muted">
                  Respondemos em até 1 dia útil.
                </p>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/*
                    Campo-armadilha. Fora da tela em vez de `display:none`, porque
                    parte dos robôs ignora campo escondido por display. `tabIndex`
                    negativo e `aria-hidden` mantêm ele fora do caminho de quem
                    navega por teclado ou leitor de tela.
                  */}
                  <div className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden" aria-hidden>
                    <label htmlFor={CAMPO_ARMADILHA}>Não preencha este campo</label>
                    <input
                      id={CAMPO_ARMADILHA}
                      name={CAMPO_ARMADILHA}
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={armadilha}
                      onChange={(e) => setArmadilha(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="nome">Nome</Label>
                    <Input
                      id="nome"
                      placeholder="Seu nome"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      required
                      disabled={enviar.isPending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={enviar.isPending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="mensagem">Mensagem</Label>
                    <Textarea
                      id="mensagem"
                      placeholder="Descreva sua dúvida ou solicitação…"
                      value={mensagem}
                      onChange={(e) => setMensagem(e.target.value)}
                      required
                      rows={5}
                      disabled={enviar.isPending}
                    />
                  </div>

                  {/* `role="alert"` para o leitor de tela anunciar a falha sem
                      depender de a pessoa reencontrar o formulário. */}
                  {enviar.isError && (
                    <p
                      role="alert"
                      className="rounded-sm bg-badge-cancelled-bg px-3 py-2 text-body-sm text-error"
                    >
                      {enviar.error.message}
                    </p>
                  )}

                  <Button type="submit" className="w-full" disabled={enviar.isPending}>
                    {enviar.isPending ? "Enviando…" : "Enviar mensagem"}
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
