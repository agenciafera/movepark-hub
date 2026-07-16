import * as React from "react";
import { BadgeCheck, CalendarClock, ShieldCheck, TrendingUp, Wallet } from "lucide-react";

/**
 * Painel de estímulo na etapa 2 (recebimento). Troca os "indicadores de receita" com animação
 * pra manter o dono motivado a terminar o cadastro. Mensagens são benefícios reais (pagamento
 * garantido, vaga ociosa vira reserva, repasse etc.), sem número inventado.
 */
type Indicator = { icon: React.ComponentType<{ className?: string }>; title: string; text: string };

const INDICATORS: Indicator[] = [
  {
    icon: Wallet,
    title: "Pagamento garantido",
    text: "O cliente paga a reserva antes de chegar. Você não corre atrás.",
  },
  {
    icon: TrendingUp,
    title: "Vaga ociosa vira receita",
    text: "O dia que passou não volta. Cada reserva é dinheiro que ficaria na mesa.",
  },
  {
    icon: CalendarClock,
    title: "Caixa previsível",
    text: "Reservas com antecedência dão previsibilidade pro seu faturamento.",
  },
  {
    icon: ShieldCheck,
    title: "Sem custo pra começar",
    text: "Sem mensalidade, sem taxa de adesão. Você só divide quando vende.",
  },
  {
    icon: BadgeCheck,
    title: "Repasse direto",
    text: "O valor cai na conta que você cadastrar, no repasse combinado.",
  },
];

const ROTATE_MS = 3800;

export function RevenueMotivator() {
  const [i, setI] = React.useState(0);
  React.useEffect(() => {
    const id = window.setInterval(() => setI((n) => (n + 1) % INDICATORS.length), ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);

  const cur = INDICATORS[i];
  const Icon = cur.icon;

  return (
    <div className="flex flex-col gap-5 rounded-lg bg-mp-navy p-6 text-white">
      <p className="text-title-md text-white">Falta pouco pra sua vaga começar a vender</p>

      {/* card rotativo — a key força o re-animar a cada troca */}
      <div
        key={i}
        className="flex flex-col gap-2 rounded-md bg-white/10 p-4 duration-500 animate-in fade-in slide-in-from-bottom-2"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
          <Icon className="h-5 w-5 text-white" />
        </span>
        <span className="text-body-md font-semibold text-white">{cur.title}</span>
        <span className="text-body-sm text-white/80">{cur.text}</span>
      </div>

      {/* pontinhos de progresso da rotação */}
      <div className="flex items-center gap-1.5">
        {INDICATORS.map((ind, n) => (
          <span
            key={ind.title}
            className={
              "h-1.5 rounded-full transition-all " +
              (n === i ? "w-5 bg-white" : "w-1.5 bg-white/30")
            }
          />
        ))}
      </div>

      <p className="text-caption-sm text-white/70">
        Termine o recebimento e sua unidade entra na busca da Movepark.
      </p>
    </div>
  );
}
