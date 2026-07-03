import * as React from "react";
import { Helmet } from "react-helmet-async";
import { TrendingUp, ShieldCheck, Wallet } from "@/lib/icons";
import { LeadForm } from "@/features/onboarding/LeadForm";
import { ThankYou } from "@/features/onboarding/ThankYou";
import type { LeadResult } from "@/features/onboarding/leadApi";

const BENEFITS = [
  { icon: TrendingUp, title: "Mais reservas", desc: "Apareça para milhares de clientes buscando vaga." },
  { icon: Wallet, title: "Receba online", desc: "Pagamentos garantidos e repasses organizados." },
  { icon: ShieldCheck, title: "Sem custo de adesão", desc: "Você só paga quando recebe uma reserva." },
];

export default function SejaParceiroPage() {
  const [result, setResult] = React.useState<LeadResult | null>(null);

  return (
    <>
      <Helmet>
        <title>Seja parceiro | Movepark</title>
        <meta
          name="description"
          content="Cadastre seu estacionamento na Movepark e comece a receber reservas online."
        />
      </Helmet>

      <section className="mx-auto w-full max-w-5xl px-4 py-10 tablet:py-16">
        <div className="grid grid-cols-1 gap-10 desktop:grid-cols-2 desktop:gap-16">
          {/* Coluna de proposta de valor */}
          <div className="flex flex-col gap-6">
            <div className="space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-muted-steel">
                Para estacionamentos
              </span>
              <h1 className="text-display-xl text-ink">
                Cadastre seu estacionamento na Movepark
              </h1>
              <p className="text-body-md text-muted">
                Aumente a ocupação das suas vagas com reservas online. Preencha o cadastro e nossa
                equipe entra em contato para colocar você no ar.
              </p>
            </div>
            <ul className="flex flex-col gap-4">
              {BENEFITS.map((b) => (
                <li key={b.title} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-mp-pale text-mp-indigo">
                    <b.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-title-sm text-ink">{b.title}</div>
                    <div className="text-body-sm text-muted">{b.desc}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Coluna do formulário / sucesso */}
          <div className="rounded-md border border-hairline bg-canvas p-6 shadow-tier tablet:p-8">
            {result?.ok ? (
              <ThankYou alreadySubmitted={result.already_submitted} />
            ) : (
              <>
                <h2 className="mb-1 text-title-md text-ink">Comece agora</h2>
                <p className="mb-6 text-body-sm text-muted">Leva menos de 2 minutos.</p>
                <LeadForm onSuccess={setResult} />
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
