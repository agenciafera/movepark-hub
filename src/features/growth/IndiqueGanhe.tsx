import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Check, Copy, Envelope, ShareNetwork } from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { AccountCard } from "@/components/shared/AccountCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { useAuth } from "@/auth/context";
import { useReferrals } from "./api";
import { brlFromCents, brlShort, referralMessage, whatsappShareUrl } from "./growth.logic";
import { inviteRows, referralEarnings, referralFunnel } from "./referralSummary.logic";

/**
 * Indique e Ganhe em blocos (design "Minha Conta Cliente"): o link em destaque à
 * esquerda, o que já foi ganho à direita, e os convites logo abaixo. "Como
 * funciona" e o FAQ ficam no fim, porque quem já entendeu o programa vem aqui só
 * pra pegar o link.
 */

/** Os textos citam o prêmio, então dependem do valor vigente do programa. */
function passosDoPrograma(premio: string) {
  return [
    {
      n: 1,
      titulo: "Copie e compartilhe seu link",
      texto: "Envie seu link exclusivo para amigos e familiares que dirigem.",
    },
    {
      n: 2,
      titulo: "Seu amigo reserva com desconto",
      texto: `Ele ganha ${premio} de desconto na 1ª reserva dele com a Movepark.`,
    },
    {
      n: 3,
      titulo: "Vocês dois ganham",
      texto: `Quando a reserva dele é concluída, você recebe ${premio} de volta na sua carteira.`,
    },
  ];
}

function faqDoPrograma(premio: string) {
  return [
    {
      q: "Como faço para participar?",
      a: "É automático: todo cliente Movepark já tem um link exclusivo. Copie o link acima e compartilhe com quem você quiser.",
    },
    {
      q: `Quando eu recebo meus ${premio}?`,
      a: "Assim que a 1ª reserva do seu indicado for concluída, não só reservada. Isso garante que a indicação foi real e protege o programa contra fraude.",
    },
    {
      q: "Tem limite de indicações?",
      a: `Não. Indique quantos amigos quiser. Cada primeira reserva concluída de um indicado te dá mais ${premio}.`,
    },
    {
      q: "O que o meu amigo ganha?",
      a: `${premio} de desconto na primeira reserva dele, um presente de boas-vindas com a sua indicação.`,
    },
    {
      q: "O crédito expira?",
      a: "O crédito vale por 90 dias a partir do momento em que entra na sua carteira.",
    },
  ];
}

export function IndiqueGanhe() {
  const { session } = useAuth();
  const { data, isLoading } = useReferrals(!!session?.userId);
  const [copiado, setCopiado] = React.useState(false);

  const link = data?.link ?? "";
  const linkDisplay = link.replace(/^https?:\/\//, "");
  const premio = data ? brlShort(data.reward_amount) : "";
  const ganhos = referralEarnings(data?.referrals ?? []);
  const funil = referralFunnel(data?.referrals ?? []);
  const convites = inviteRows(data?.referrals ?? []);

  function copiar() {
    if (!link) return;
    void navigator.clipboard?.writeText(link);
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 1800);
    toast.success("Link de indicação copiado.", { position: "top-center" });
  }

  function compartilhar() {
    if (!data) return;
    window.open(whatsappShareUrl(data.link, data.reward_amount), "_blank", "noopener");
  }

  function porEmail() {
    if (!data) return;
    const corpo = encodeURIComponent(referralMessage(data.link, data.reward_amount));
    const assunto = encodeURIComponent("Um presente pra sua próxima viagem");
    window.location.href = `mailto:?subject=${assunto}&body=${corpo}`;
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-display-xl text-ink">Indique e ganhe</h1>
        <p className="mt-2 text-body-md text-muted">
          {premio
            ? `Cada amigo que reservar te dá ${premio}, e conta para o seu nível.`
            : "Cada amigo que reservar vira crédito na sua conta, e conta para o seu nível."}
        </p>
      </header>

      {/* Bloco 1: o link, que é o motivo de a página existir, e o placar ao lado. */}
      <div className="grid grid-cols-1 gap-5 desktop:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="bg-brand-mesh flex flex-col rounded-lg p-6 text-white desktop:p-7">
          <span className="inline-flex self-start rounded-full bg-white/20 px-3 py-1.5 text-caption font-semibold text-white">
            Seu link
          </span>
          <p className="mt-4 text-display-md leading-tight text-white">
            {premio ? `Dê ${premio}, ganhe ${premio}` : "Indique a Movepark"}
          </p>
          <p className="mt-2 text-body-sm text-white/80">
            Você recebe quando a primeira reserva do seu amigo for concluída.
          </p>

          {isLoading || !data ? (
            <Skeleton className="mt-6 h-12 w-full rounded-full bg-white/10" />
          ) : (
            <>
              <div className="mt-6 flex items-center gap-2 rounded-full bg-white/15 p-1.5 pl-5">
                <span className="min-w-0 flex-1 truncate font-mono text-body-sm text-white">
                  {linkDisplay}
                </span>
                <button
                  type="button"
                  onClick={copiar}
                  className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-white px-4 text-caption-sm font-bold text-mp-navy transition-colors hover:bg-mp-pale"
                >
                  {copiado ? (
                    <Check className="h-4 w-4 text-success" aria-hidden />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden />
                  )}
                  {copiado ? "Copiado" : "Copiar"}
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={compartilhar}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-white/15 px-4 text-caption-sm font-semibold text-white transition-colors hover:bg-white/25"
                >
                  <ShareNetwork className="h-4 w-4" aria-hidden />
                  WhatsApp
                </button>
                <button
                  type="button"
                  onClick={porEmail}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-white/15 px-4 text-caption-sm font-semibold text-white transition-colors hover:bg-white/25"
                >
                  <Envelope className="h-4 w-4" aria-hidden />
                  E-mail
                </button>
              </div>
            </>
          )}
        </section>

        <AccountCard title="O que você já ganhou">
          {isLoading ? (
            <Skeleton className="h-12 w-32 rounded-md" />
          ) : (
            <>
              <p className="text-display-2xl leading-none tabular-nums text-ink">
                {brlFromCents(ganhos.total * 100)}
              </p>
              <p className="mt-1.5 text-body-sm text-muted">
                {ganhos.count === 1
                  ? "1 indicação recompensada"
                  : `${ganhos.count} indicações recompensadas`}
              </p>

              {/* Barra do funil: só aparece quando há indicação, senão são três
                  faixas cinzas sem significado. */}
              {convites.length > 0 && (
                <div className="mt-5 flex h-2 gap-1 overflow-hidden rounded-full">
                  {funil.map((passo) => (
                    <span
                      key={passo.key}
                      className={
                        passo.key === "rewarded"
                          ? "rounded-full bg-mp-primary"
                          : passo.key === "qualified"
                            ? "rounded-full bg-mp-indigo"
                            : "rounded-full bg-surface-strong"
                      }
                      style={{ width: `${passo.share}%` }}
                    />
                  ))}
                </div>
              )}

              <dl className="mt-4 space-y-3">
                {funil.map((passo) => (
                  <div key={passo.key} className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-body-sm text-muted">
                      <span
                        aria-hidden
                        className={
                          passo.key === "rewarded"
                            ? "h-2 w-2 shrink-0 rounded-full bg-mp-primary"
                            : passo.key === "qualified"
                              ? "h-2 w-2 shrink-0 rounded-full bg-mp-indigo"
                              : "h-2 w-2 shrink-0 rounded-full bg-surface-strong"
                        }
                      />
                      {passo.label}
                    </dt>
                    <dd className="text-body-sm font-semibold tabular-nums text-ink">
                      {passo.count}
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="mt-5 border-t border-hairline pt-4 text-caption-sm leading-relaxed text-muted">
                O crédito entra na sua carteira automaticamente, sem precisar resgatar.
              </p>
            </>
          )}
        </AccountCard>
      </div>

      {/* Bloco 2: quem já foi convidado e em que pé está. */}
      <AccountCard title="Seus convites">
        {isLoading ? (
          <Skeleton className="h-24 w-full rounded-md" />
        ) : convites.length === 0 ? (
          <EmptyState
            icon={<ShareNetwork className="h-10 w-10" aria-hidden />}
            title="Nenhum convite ainda"
            description="Compartilhe seu link e acompanhe por aqui quem entrou."
          />
        ) : (
          <ul className="space-y-1">
            {convites.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-md p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mp-pale text-caption-sm font-semibold text-mp-indigo">
                  {c.initials}
                </span>
                <span className="min-w-0 flex-1 truncate text-body-sm text-ink">{c.name}</span>
                <span
                  className={
                    c.paid
                      ? "shrink-0 rounded-full bg-badge-confirmed-bg px-2.5 py-1 text-caption-sm font-semibold text-badge-confirmed-fg"
                      : "shrink-0 rounded-full bg-surface-soft px-2.5 py-1 text-caption-sm font-semibold text-muted"
                  }
                >
                  {c.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AccountCard>

      {/* Bloco 3: a explicação, no fim, pra quem ainda não entendeu o programa. */}
      <AccountCard title="Como funciona">
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-3">
          {passosDoPrograma(premio || "o crédito").map((p) => (
            <div key={p.n}>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-mp-primary text-title-md font-medium text-mp-primary">
                {p.n}
              </span>
              <p className="mt-3 text-title-md text-ink">{p.titulo}</p>
              <p className="mt-1 text-body-sm leading-relaxed text-muted">{p.texto}</p>
            </div>
          ))}
        </div>
      </AccountCard>

      <AccountCard title="Detalhes do programa">
        <Accordion type="single" collapsible>
          {faqDoPrograma(premio || "o crédito").map((item, i) => (
            <AccordionItem key={i} value={`item-${i}`}>
              <AccordionTrigger>{item.q}</AccordionTrigger>
              <AccordionContent>{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <p className="mt-4 text-caption-sm text-muted">
          Acompanhe seu saldo no{" "}
          <Link to="/account/clube" className="text-mp-indigo hover:underline">
            Movepark Clube
          </Link>
          .
        </p>
      </AccountCard>
    </div>
  );
}
