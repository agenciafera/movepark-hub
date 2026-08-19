import { CheckCircle, Coins, Headphones, MagnifyingGlass, SealCheck, Star } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";

/** No Phosphor, `Icon` é valor; o tipo do componente é este. */
type Icon = ComponentType<IconProps>;
import { useGsapReveal } from "@/hooks/useGsapReveal";

// ---- Ilustrações animadas por diferencial ----

function CompareIllustration() {
  return (
    <div aria-hidden className="mt-8 rounded-xl border border-hairline bg-canvas p-4">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-ink">Vaga coberta</span>
        <span className="text-[13px] font-bold text-ink">R$ 32,80</span>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-lg bg-surface-soft px-3 py-2">
        <span className="text-[12px] font-medium text-muted">Vaga descoberta</span>
        <span className="text-[13px] font-bold text-muted">R$ 26,40</span>
      </div>
    </div>
  );
}

function NoFeeIllustration() {
  return (
    <div aria-hidden className="mt-8 rounded-xl border border-hairline bg-canvas p-4">
      <span className="text-[10px] font-bold uppercase tracking-[0.3px] text-muted">
        Valor da reserva
      </span>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-[28px] font-bold leading-none text-ink">R$ 32,80</span>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        <CheckCircle className="h-3.5 w-3.5 text-mp-primary" />
        <span className="text-[12px] font-medium text-mp-primary">Sem taxa da Movepark</span>
      </div>
    </div>
  );
}

function VerifiedIllustration() {
  return (
    <div aria-hidden className="mt-8 rounded-xl border border-hairline bg-canvas p-4">
      <div className="flex items-center gap-3">
        <div className="tb-avatar flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mp-pale">
          <span className="text-[15px] font-black leading-none text-mp-indigo">P</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className="truncate text-[13px] font-semibold text-ink">Garagem Central</span>
            <SealCheck className="tb-badge-pop h-4 w-4 shrink-0 text-mp-primary" />
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <Star className="tb-star h-3 w-3 fill-mp-navy stroke-none" />
            <span className="text-[12px] text-muted">4.9 · 248 avaliações</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/*
  ADR-009: a ilustração é exemplo, mas o texto é lido por quem enxerga, e oferta
  vincula o fornecedor (CDC art. 30). O diálogo dizia "sua vaga fica garantida
  por 3h após o horário previsto", que é promessa de vaga garantida com prazo,
  renderizada sem consultar capacidade nenhuma. A home não tem unidade em mãos
  para chamar `getLocationCapabilities`, então a promessa não pode existir aqui:
  o assistente responde, e é só isso que o card diz.
*/
function SupportIllustration() {
  return (
    <div aria-hidden className="mt-8 space-y-2">
      {/* Mensagem do usuário */}
      <div className="tb-msg1 max-w-[85%] rounded-xl rounded-tl-sm border border-hairline bg-canvas px-3 py-2.5 text-[12px] leading-relaxed text-ink">
        Meu voo atrasou. E agora?
      </div>

      {/* Indicador de digitação */}
      <div className="tb-typing ml-auto flex w-fit items-center gap-1 rounded-xl rounded-tr-sm bg-mp-primary/10 px-3 py-2.5">
        <span className="tb-dot-1 h-1.5 w-1.5 rounded-full bg-mp-primary" />
        <span className="tb-dot-2 h-1.5 w-1.5 rounded-full bg-mp-primary" />
        <span className="tb-dot-3 h-1.5 w-1.5 rounded-full bg-mp-primary" />
      </div>

      {/* Resposta do suporte */}
      <div className="tb-msg2 ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-mp-primary px-3 py-2.5 text-[12px] leading-relaxed text-white">
        Te explico agora as condições da sua reserva.
      </div>
    </div>
  );
}

// ---- Config dos cards ----

type Item = {
  icon: Icon;
  title: string;
  text: string;
  Illustration: () => JSX.Element;
};

const items: Item[] = [
  {
    icon: MagnifyingGlass,
    title: "Compare em segundos",
    text: "Preço, distância e nota de vários estacionamentos, lado a lado.",
    Illustration: CompareIllustration,
  },
  {
    icon: Coins,
    title: "Sem taxa da Movepark",
    text: "Você reserva e paga direto com o estacionamento parceiro.",
    Illustration: NoFeeIllustration,
  },
  {
    icon: SealCheck,
    title: "Estacionamentos verificados",
    text: "Parceiros aprovados e avaliados pela Movepark.",
    Illustration: VerifiedIllustration,
  },
  {
    icon: Headphones,
    /* Dizia "Atendimento 24h" com "suporte por e-mail e telefone", o que
       prometia gente ao telefone de madrugada. Passou a prometer assistente do
       site 24h, e o assistente saiu do ar (`assistenteDoSiteLigado`), então a
       promessa caiu junto: hoje quem responde é a equipe, no WhatsApp, na mesma
       janela que a página de contato mostra. */
    title: "Ajuda no WhatsApp",
    text: "Fale com a equipe no WhatsApp, de segunda a sexta, das 9h às 18h.",
    Illustration: SupportIllustration,
  },
];

// ---- Componente ----

export function TrustBand() {
  const ref = useGsapReveal<HTMLElement>({ selector: "[data-reveal]", stagger: 0.1, y: 28, start: "top 88%" });
  return (
    <section ref={ref} className="px-6 py-16 desktop:px-8 desktop:py-24">
      <style>{`
        /* ---- Classes ---- */
        .tb-badge-pop       { animation: tb-badge-pop 3.5s ease-in-out infinite; }
        .tb-avatar          { animation: tb-avatar 3.5s ease-in-out infinite; }
        .tb-star            { animation: tb-star 3.5s ease-in-out infinite; }
        .tb-msg1            { animation: tb-msg1 7s ease-in-out infinite; }
        .tb-typing          { animation: tb-typing 7s ease-in-out infinite; }
        .tb-msg2            { animation: tb-msg2 7s ease-in-out infinite; }
        .tb-dot-1           { animation: tb-dot 0.9s ease-in-out infinite; }
        .tb-dot-2           { animation: tb-dot 0.9s ease-in-out 0.18s infinite; }
        .tb-dot-3           { animation: tb-dot 0.9s ease-in-out 0.36s infinite; }

        /* ---- Card 3: Verificado ---- */
        @keyframes tb-badge-pop {
          0%, 55%  { transform: scale(1); }
          65%      { transform: scale(1.5) rotate(10deg); }
          75%      { transform: scale(0.9) rotate(-5deg); }
          85%, 100%{ transform: scale(1) rotate(0deg); }
        }

        @keyframes tb-avatar {
          0%, 55%  { box-shadow: 0 0 0 0 rgba(93,95,239,0); }
          70%      { box-shadow: 0 0 0 6px rgba(93,95,239,0.18); }
          85%, 100%{ box-shadow: 0 0 0 0 rgba(93,95,239,0); }
        }

        @keyframes tb-star {
          0%, 55%  { transform: scale(1); filter: brightness(1); }
          70%      { transform: scale(1.5); filter: brightness(1.4); }
          85%, 100%{ transform: scale(1); filter: brightness(1); }
        }

        /* ---- Card 4: Suporte ---- */
        @keyframes tb-msg1 {
          0%, 5%   { opacity: 0; transform: translateX(-10px); }
          18%, 78% { opacity: 1; transform: translateX(0); }
          90%, 100%{ opacity: 0; transform: translateX(-10px); }
        }

        @keyframes tb-typing {
          0%, 18%  { opacity: 0; transform: translateX(8px) scale(0.9); }
          28%, 46% { opacity: 1; transform: translateX(0) scale(1); }
          56%, 100%{ opacity: 0; transform: translateX(8px) scale(0.9); }
        }

        @keyframes tb-msg2 {
          0%, 46%  { opacity: 0; transform: translateX(10px); }
          60%, 78% { opacity: 1; transform: translateX(0); }
          90%, 100%{ opacity: 0; transform: translateX(10px); }
        }

        @keyframes tb-dot {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
          40%           { transform: translateY(-4px); opacity: 1; }
        }

      `}</style>

      <div className="mx-auto max-w-[1280px]">

        {/* Cabeçalho */}
        <div className="mb-12">
          <p data-reveal className="mb-2 text-badge uppercase tracking-[0.4px] text-mp-indigo">
            Por que a Movepark
          </p>
          <h2 data-reveal className="text-balance text-display-2xl text-ink">
            O que você tem em toda reserva
          </h2>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
          {items.map((it) => (
            <div
              key={it.title}
              data-reveal
              className="overflow-hidden rounded-xl bg-surface-soft p-6 transition-shadow hover:shadow-tier"
            >
              <it.icon className="h-5 w-5 text-mp-primary" />
              <h3 className="mt-5 text-[18px] font-semibold leading-snug text-ink">{it.title}</h3>
              <p className="mt-2 max-w-sm text-body-sm text-muted">{it.text}</p>
              <it.Illustration />
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
