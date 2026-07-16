import * as React from "react";
import { Helmet } from "react-helmet-async";
import { Mail, MessageCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";

type FormState = "idle" | "success";

const CHANNELS = [
  {
    icon: MessageCircle,
    title: "WhatsApp",
    desc: "Resposta rápida em horário comercial",
    action: "Iniciar conversa",
    href: "https://wa.me/5511999999999",
  },
  {
    icon: Mail,
    title: "E-mail",
    desc: "contato@movepark.co",
    action: "Enviar e-mail",
    href: "mailto:contato@movepark.co",
  },
  {
    icon: Clock,
    title: "Horário de atendimento",
    desc: "Segunda a sexta, das 9h às 18h",
    action: null,
    href: null,
  },
];

export default function ContatoPage() {
  const [state, setState] = React.useState<FormState>("idle");
  const [nome, setNome] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [mensagem, setMensagem] = React.useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const subject = encodeURIComponent(`Contato via site — ${nome}`);
    const body = encodeURIComponent(`Nome: ${nome}\nE-mail: ${email}\n\n${mensagem}`);
    window.location.href = `mailto:contato@movepark.co?subject=${subject}&body=${body}`;
    setState("success");
    setNome("");
    setEmail("");
    setMensagem("");
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
                  <Mail className="h-7 w-7" />
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
                  <div className="space-y-1.5">
                    <Label htmlFor="nome">Nome</Label>
                    <Input
                      id="nome"
                      placeholder="Seu nome"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      required

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

                    />
                  </div>
                  <Button type="submit" className="w-full">
                    Enviar mensagem
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
