import * as React from "react";
import { Helmet } from "react-helmet-async";
import { TrendingUp, ShieldCheck, Wallet, Lock } from "lucide-react";
import { LeadForm } from "@/features/onboarding/LeadForm";
import { ThankYou } from "@/features/onboarding/ThankYou";
import type { LeadResult } from "@/features/onboarding/leadApi";

const BENEFITS = [
  { icon: TrendingUp, title: "Mais reservas", desc: "Apareça para milhares de clientes buscando vaga." },
  { icon: Wallet, title: "Receba online", desc: "Pagamentos garantidos e repasses organizados." },
  { icon: ShieldCheck, title: "Sem custo de adesão", desc: "Você só paga quando recebe uma reserva." },
];

// Passos reais e ordenados — a sequência carrega a informação que falta ao parceiro:
// como ele entra no ar e, sobretudo, como o dinheiro chega até ele.
const STEPS = [
  {
    n: 1,
    title: "Você se cadastra",
    desc: "Preenche este formulário. Nossa equipe valida e configura seu estacionamento no sistema — sem burocracia.",
  },
  {
    n: 2,
    title: "Recebe reservas online",
    desc: "Seu estacionamento aparece na busca. O cliente reserva e paga com antecedência, antes de chegar.",
  },
  {
    n: 3,
    title: "O dinheiro cai na sua conta",
    desc: "A Movepark garante o pagamento e faz o repasse organizado. Sem inadimplência, sem cobrança manual.",
  },
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
        {/*
          Ordem no DOM = ordem no mobile: promessa → formulário → benefícios. No celular o parceiro
          alcança a ação logo após a promessa, sem rolar por toda a proposta de valor. No desktop
          (≥1128px) o posicionamento explícito remonta as duas colunas: à esquerda promessa +
          benefícios (empilhados), à direita o formulário ocupando a coluna inteira.
        */}
        <div className="grid grid-cols-1 gap-8 desktop:grid-cols-2 desktop:grid-rows-[auto_1fr] desktop:gap-x-16 desktop:gap-y-8">
          {/* Promessa — copy aprovada (com sobrancelha, exceção deliberada ao guia do DESIGN). */}
          <div className="space-y-3 desktop:col-start-1 desktop:row-start-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-muted-steel">
              Para estacionamentos
            </span>
            <h1 className="text-display-xl text-ink">Cadastre seu estacionamento na Movepark</h1>
            <p className="max-w-prose text-body-md text-muted">
              Aumente a ocupação das suas vagas com reservas online. Preencha o cadastro e nossa
              equipe entra em contato para colocar você no ar.
            </p>
          </div>

          {/* Formulário / sucesso — coluna direita cheia no desktop */}
          <div className="w-full justify-self-center rounded-md border border-hairline bg-canvas p-6 shadow-tier tablet:max-w-lg tablet:p-8 desktop:col-start-2 desktop:row-start-1 desktop:row-span-2 desktop:max-w-none">
            {result?.ok ? (
              <ThankYou alreadySubmitted={result.already_submitted} />
            ) : (
              <>
                <h2 className="mb-1 text-title-md text-ink">Comece agora</h2>
                <p className="mb-6 text-body-sm text-muted">Leva menos de 2 minutos.</p>
                <LeadForm onSuccess={setResult} />
                <p className="mt-4 flex items-center gap-2 text-body-sm text-muted">
                  <Lock className="h-4 w-4 shrink-0" aria-hidden />
                  Seus dados são usados só para entrar em contato. Sem mensalidade, sem taxa de
                  adesão.
                </p>
              </>
            )}
          </div>

          {/* Benefícios — abaixo do formulário no mobile, sob a promessa no desktop */}
          <ul className="flex flex-col gap-4 desktop:col-start-1 desktop:row-start-2">
            {BENEFITS.map((b) => (
              <li key={b.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-mp-pale text-mp-indigo">
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

        {/* Como funciona — a prova de confiança que faltava antes do CTA: o passo a passo
            concreto, incluindo como o pagamento chega ao parceiro. */}
        <div className="mt-14 border-t border-hairline pt-12 tablet:mt-20 tablet:pt-16">
          <h2 className="text-display-2xl text-ink">Como funciona</h2>
          <p className="mt-2 max-w-2xl text-body-md text-muted">
            Do cadastro ao repasse, a Movepark cuida da parte chata. Você cuida das vagas.
          </p>
          <ol className="mt-8 grid grid-cols-1 gap-x-8 gap-y-8 tablet:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="flex flex-col gap-2">
                <span className="text-display-md tabular-nums text-mp-indigo">
                  {String(s.n).padStart(2, "0")}
                </span>
                <div className="text-title-sm text-ink">{s.title}</div>
                <p className="text-body-sm text-muted">{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
