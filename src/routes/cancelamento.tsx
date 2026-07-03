import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { CheckCircle, XCircle, Clock } from "@/lib/icons";

const RULES = [
  {
    icon: CheckCircle,
    color: "text-success",
    bg: "bg-success/10",
    title: "Reembolso integral",
    cond: "Cancelamento realizado com 48 horas ou mais de antecedência em relação ao início da reserva.",
    detail: "O valor total é estornado no mesmo método de pagamento em até 5 dias úteis.",
  },
  {
    icon: Clock,
    color: "text-warning",
    bg: "bg-warning/10",
    title: "Reembolso parcial (50%)",
    cond: "Cancelamento realizado entre 24 e 48 horas antes do início da reserva.",
    detail: "Metade do valor é estornada. A outra metade é retida como taxa de cancelamento tardio.",
  },
  {
    icon: XCircle,
    color: "text-error",
    bg: "bg-error/10",
    title: "Sem reembolso",
    cond: "Cancelamento realizado com menos de 24 horas de antecedência, ou após o início do período reservado.",
    detail:
      "O valor da reserva não é devolvido. Exceções podem ser analisadas em casos de força maior — entre em contato com o suporte.",
  },
];

const FAQ_CANCEL = [
  {
    q: "Como cancelo minha reserva?",
    a: 'Acesse Minhas Reservas, selecione a reserva e clique em "Cancelar reserva". O prazo de reembolso aparece antes de confirmar o cancelamento.',
  },
  {
    q: "O reembolso vai para onde?",
    a: "Para o mesmo método usado no pagamento: no PIX, o valor volta para a chave usada; no cartão de crédito, aparece como estorno na fatura em até 2 ciclos de faturamento.",
  },
  {
    q: "Posso cancelar porque meu voo atrasou?",
    a: "Cancelamentos por atraso de voo são avaliados individualmente. Envie o comprovante de atraso pelo nosso suporte e tentamos resolver o quanto antes.",
  },
  {
    q: "E se o estacionamento não honrar a reserva?",
    a: "Se o parceiro não tiver vaga no dia mesmo com reserva confirmada, você tem direito a reembolso integral independente do prazo. Fale imediatamente com o suporte.",
  },
];

export default function CancelamentoPage() {
  return (
    <>
      <Helmet>
        <title>Política de Cancelamento | Movepark</title>
        <meta
          name="description"
          content="Entenda as regras de cancelamento e reembolso da Movepark: prazos, como cancelar e quando você recebe o dinheiro de volta."
        />
        <meta property="og:title" content="Política de Cancelamento | Movepark" />
        <meta property="og:url" content="https://hub.movepark.co/cancelamento" />
        <link rel="canonical" href="https://hub.movepark.co/cancelamento" />
      </Helmet>

      <div className="mx-auto w-full max-w-[840px] px-4 py-12 desktop:px-8">
        <header className="mb-10 space-y-3">
          <h1 className="text-display-lg text-ink">Política de Cancelamento</h1>
          <p className="text-body-md text-muted">
            Cancelamentos com antecedência garantem reembolso. Confira as regras abaixo.
          </p>
        </header>

        {/* Tabela de regras */}
        <section className="mb-14 space-y-4">
          {RULES.map((r) => (
            <div
              key={r.title}
              className="flex items-start gap-5 rounded-md border border-hairline bg-canvas p-5"
            >
              <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-sm ${r.bg}`}>
                <r.icon className={`h-5 w-5 ${r.color}`} />
              </span>
              <div>
                <div className="text-title-sm text-ink">{r.title}</div>
                <div className="mt-1 text-body-sm font-medium text-ink">{r.cond}</div>
                <div className="mt-1 text-body-sm text-muted">{r.detail}</div>
              </div>
            </div>
          ))}
        </section>

        {/* Resumo visual */}
        <section className="mb-14 overflow-x-auto">
          <h2 className="mb-4 text-title-sm text-ink">Resumo rápido</h2>
          <table className="w-full border-collapse text-body-sm">
            <thead>
              <tr className="border-b border-hairline bg-surface-soft text-left">
                <th className="px-4 py-3 font-semibold text-ink">Antecedência do cancelamento</th>
                <th className="px-4 py-3 font-semibold text-ink">Reembolso</th>
                <th className="px-4 py-3 font-semibold text-ink">Prazo do estorno</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              <tr>
                <td className="px-4 py-3 text-ink">48h ou mais</td>
                <td className="px-4 py-3 font-semibold text-success">100%</td>
                <td className="px-4 py-3 text-muted">Até 5 dias úteis</td>
              </tr>
              <tr>
                <td className="px-4 py-3 text-ink">Entre 24h e 48h</td>
                <td className="px-4 py-3 font-semibold text-warning">50%</td>
                <td className="px-4 py-3 text-muted">Até 5 dias úteis</td>
              </tr>
              <tr>
                <td className="px-4 py-3 text-ink">Menos de 24h ou após início</td>
                <td className="px-4 py-3 font-semibold text-error">0%</td>
                <td className="px-4 py-3 text-muted">—</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Como cancelar */}
        <section className="mb-14">
          <h2 className="mb-6 text-title-sm text-ink">Como cancelar sua reserva</h2>
          <div className="space-y-4">
            {[
              { n: "1", t: "Acesse Minhas Reservas", d: "No menu da sua conta, abra a lista de reservas." },
              { n: "2", t: "Selecione a reserva", d: "Clique na reserva que deseja cancelar." },
              { n: "3", t: 'Clique em "Cancelar reserva"', d: "O sistema mostra o valor de reembolso antes de confirmar." },
              { n: "4", t: "Confirme o cancelamento", d: "O processo é imediato. Você recebe confirmação por e-mail." },
            ].map((s) => (
              <div key={s.n} className="flex items-start gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mp-pale text-label font-bold text-mp-indigo">
                  {s.n}
                </span>
                <div>
                  <div className="text-title-sm text-ink">{s.t}</div>
                  <div className="mt-0.5 text-body-sm text-muted">{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-14">
          <h2 className="mb-6 text-title-sm text-ink">Dúvidas frequentes</h2>
          <div className="space-y-6">
            {FAQ_CANCEL.map((item) => (
              <div key={item.q}>
                <div className="text-title-sm text-ink">{item.q}</div>
                <div className="mt-1 text-body-sm text-muted">{item.a}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Suporte */}
        <section className="rounded-md bg-surface-soft px-6 py-6">
          <p className="text-body-sm text-muted">
            Precisa de ajuda com um cancelamento específico?{" "}
            <Link to="/contato" className="font-medium text-mp-indigo hover:underline">
              Fale com o suporte →
            </Link>
          </p>
        </section>
      </div>
    </>
  );
}
