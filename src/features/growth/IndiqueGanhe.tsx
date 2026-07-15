import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Gift, Share2, Copy, Check, Link2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { useAuth } from "@/auth/context";
import { useReferrals } from "./api";
import { firstNameOf, whatsappShareUrl } from "./growth.logic";

/**
 * Página dedicada do Indique e Ganhe — explica claramente o benefício de
 * recomendar a Movepark e entrega o link/compartilhamento em destaque.
 * Inspirada em programas de indicação de referência (hero + gerador de link +
 * como funciona + FAQ). Consome o link real de get_my_referrals.
 */

const PASSOS = [
  {
    n: 1,
    titulo: "Copie e compartilhe seu link",
    texto: "Envie seu link exclusivo para amigos e familiares que dirigem.",
  },
  {
    n: 2,
    titulo: "Seu amigo reserva com desconto",
    texto: "Ele ganha R$ 25 de desconto na 1ª reserva dele com a Movepark.",
  },
  {
    n: 3,
    titulo: "Vocês dois ganham",
    texto:
      "Quando a reserva dele é concluída, você recebe R$ 25 de volta na sua carteira Movepark.",
  },
];

const FAQ = [
  {
    q: "Como faço para participar?",
    a: "É automático — todo cliente Movepark já tem um link exclusivo. Copie o link acima e compartilhe com quem você quiser.",
  },
  {
    q: "Quando eu recebo meus R$ 25?",
    a: "Assim que a 1ª reserva do seu indicado for concluída (não só reservada). Isso garante que a indicação foi real e protege o programa contra fraude.",
  },
  {
    q: "Tem limite de indicações?",
    a: "Não. Indique quantos amigos quiser — cada primeira reserva concluída de um indicado te dá mais R$ 25.",
  },
  {
    q: "O que o meu amigo ganha?",
    a: "R$ 25 de desconto na primeira reserva dele — um presente de boas-vindas com a sua indicação.",
  },
  {
    q: "Onde acompanho minhas indicações?",
    a: "No Movepark Clube, dentro da sua conta, você vê quantas indicações estão pendentes e quantas já foram recompensadas.",
  },
  {
    q: "O crédito expira?",
    a: "O crédito vale por 90 dias a partir do momento em que entra na sua carteira.",
  },
];

export function IndiqueGanhe() {
  const { session } = useAuth();
  const { data, isLoading } = useReferrals(!!session?.userId);
  const [copiado, setCopiado] = React.useState(false);
  const firstName = firstNameOf(session?.fullName);

  const link = data?.link ?? "";
  const linkDisplay = link.replace(/^https?:\/\//, "");

  function copiar() {
    if (!link) return;
    void navigator.clipboard?.writeText(link);
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 1800);
    toast.success("Link de indicação copiado.", { position: "top-center" });
  }

  function compartilhar() {
    if (!link) return;
    window.open(whatsappShareUrl(link), "_blank", "noopener");
  }

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="grid gap-8 tablet:grid-cols-[1.1fr_0.9fr] tablet:items-center">
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-mp-indigo">
            <Gift className="h-5 w-5" />
            <span className="text-micro-label uppercase tracking-wide">Indique e ganhe</span>
          </div>
          <h1 className="text-display-2xl text-ink">
            Ganhe <span className="text-mp-primary">R$ 25</span> indicando a Movepark.
          </h1>
          <p className="max-w-lg text-body-md text-muted">
            Presenteie um amigo com <span className="text-ink">R$ 25 de desconto</span> na 1ª reserva
            dele. Quando ele usar, <span className="text-ink">você ganha R$ 25</span> de volta na sua
            carteira. Simples assim.
          </p>
        </div>

        {/* Diagrama */}
        <div className="rounded-lg border border-hairline bg-surface-pale p-6 shadow-tier">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-mp-primary text-white">
              <Link2 className="h-5 w-5" />
            </span>
            <div>
              <p className="text-title-sm text-ink">Você compartilha o link</p>
              <p className="text-caption-sm text-muted">e acompanha quem entrou</p>
            </div>
          </div>
          <div className="my-3 ml-5 h-5 border-l border-dashed border-border-strong" />
          <div className="space-y-2">
            {["Amigo reservou", "Amiga reservou", "Colega reservou"].map((label, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-md border border-hairline bg-canvas px-3 py-2"
              >
                <span className="flex items-center gap-2 text-body-sm text-ink">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-soft text-caption-sm text-muted-steel">
                    {["M", "J", "L"][i]}
                  </span>
                  {label}
                </span>
                <span className="rounded-full bg-badge-confirmed-bg px-2.5 py-0.5 text-caption-sm font-medium text-badge-confirmed-fg">
                  + R$ 25
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Gerador / link exclusivo */}
      <section className="rounded-lg border border-hairline bg-canvas p-6 shadow-tier tablet:p-8">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-mp-violet" />
          <h2 className="text-display-sm text-ink">Seu link exclusivo, {firstName}</h2>
        </div>
        <p className="mt-1 text-body-sm text-muted">
          Copie e mande no WhatsApp, ou compartilhe direto. É só um toque.
        </p>

        {isLoading || !data ? (
          <Skeleton className="mt-5 h-12 w-full rounded-sm" />
        ) : (
          <div className="mt-5 flex flex-col gap-3 tablet:flex-row">
            <div className="flex flex-1 items-center gap-2 rounded-sm border border-hairline bg-surface-soft px-4 py-3">
              <Link2 className="h-4 w-4 shrink-0 text-muted" />
              <span className="truncate font-mono text-body-sm text-ink">{linkDisplay}</span>
            </div>
            <Button variant="outline" size="default" onClick={copiar} className="shrink-0">
              {copiado ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              {copiado ? "Copiado" : "Copiar link"}
            </Button>
            <Button variant="primary" size="default" onClick={compartilhar} className="shrink-0">
              <Share2 className="h-4 w-4" />
              Compartilhar no WhatsApp
            </Button>
          </div>
        )}
      </section>

      {/* Como funciona */}
      <section className="space-y-4">
        <h2 className="text-display-sm text-ink">Como funciona</h2>
        <div className="grid gap-4 tablet:grid-cols-3">
          {PASSOS.map((p) => (
            <div key={p.n} className="rounded-md border border-hairline bg-canvas p-5 shadow-tier">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-mp-primary text-title-md font-medium text-mp-primary">
                {p.n}
              </span>
              <p className="mt-3 text-title-md text-ink">{p.titulo}</p>
              <p className="mt-1 text-body-sm text-muted">{p.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Detalhes / FAQ */}
      <section className="space-y-4">
        <h2 className="text-display-sm text-ink">Detalhes do programa</h2>
        <div className="rounded-lg border border-hairline bg-canvas px-6 shadow-tier">
          <Accordion type="single" collapsible>
            {FAQ.map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger>{item.q}</AccordionTrigger>
                <AccordionContent>{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
        <p className="text-caption-sm text-muted">
          Acompanhe suas indicações e seu saldo no{" "}
          <Link to="/account/clube" className="text-mp-indigo hover:underline">
            Movepark Clube
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
