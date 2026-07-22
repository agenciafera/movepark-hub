import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { CheckCircle, LifeBuoy } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";

const RULES = [
  {
    icon: CheckCircle,
    color: "text-success",
    bg: "bg-success/10",
    title: "Reembolso integral",
    cond: "Cancele dentro da janela da sua Tarifa. Básica e Flex: até 24 horas antes do check-in. Superflex: até 1 minuto antes.",
    detail: "O valor total volta no mesmo método de pagamento, em até 10 dias úteis.",
  },
  {
    icon: LifeBuoy,
    color: "text-mp-indigo",
    bg: "bg-mp-pale",
    title: "Depois do prazo",
    cond: "Passado o prazo da sua Tarifa, o cancelamento passa pelo suporte.",
    detail: "Não há reembolso parcial automático. O suporte avalia o seu caso pelo atendimento.",
  },
];

const FAQ_CANCEL = [
  {
    q: "Como cancelo minha reserva?",
    a: 'Em Minhas Reservas, abra a reserva e clique em "Cancelar reserva". Dentro do prazo da sua Tarifa, o reembolso integral aparece antes de você confirmar. Passado o prazo, fale com o suporte.',
  },
  {
    q: "O reembolso vai para onde?",
    a: "Para o mesmo método usado no pagamento: no PIX, o valor volta para a chave usada; no cartão de crédito, aparece como estorno na fatura em até 2 ciclos de faturamento.",
  },
  {
    q: "Posso cancelar porque meu voo atrasou?",
    a: "A Tarifa Superflex estende a estadia sozinha quando o voo atrasa, sem custo extra. Nas outras Tarifas, envie o comprovante de atraso pelo suporte que a gente avalia.",
  },
  {
    q: "E se o estacionamento não honrar a reserva?",
    a: "Se o parceiro não tiver vaga no dia mesmo com reserva confirmada, você tem direito a reembolso integral independente do prazo. Fale imediatamente com o suporte.",
  },
];

const TARIFA_PRAZOS = [
  { tarifa: "Básica", prazo: "24 horas antes" },
  { tarifa: "Flex", prazo: "24 horas antes" },
  { tarifa: "Superflex", prazo: "1 minuto antes" },
];

export default function CancelamentoPage() {
  return (
    <>
      <Helmet>
        <title>Política de Cancelamento | Movepark</title>
        <meta
          name="description"
          content="Regras de cancelamento e reembolso da Movepark: o prazo depende da sua Tarifa, com reembolso integral dentro da janela."
        />
        <meta property="og:title" content="Política de Cancelamento | Movepark" />
        <meta property="og:url" content="https://hub.movepark.co/cancelamento" />
        <link rel="canonical" href="https://hub.movepark.co/cancelamento" />
      </Helmet>

      <div className="mx-auto w-full max-w-[1080px] px-4 py-12 desktop:px-8">
        <PageHeader
          variant="content"
          className="mb-10 max-w-2xl"
          title="Política de cancelamento"
          description="Dentro do prazo da sua Tarifa, o cancelamento é grátis e o reembolso é integral. Veja os prazos abaixo."
        />

        {/* Regras */}
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

        {/* Resumo por Tarifa */}
        <section className="mb-14 overflow-x-auto">
          <h2 className="mb-4 text-display-sm text-ink">Prazo por Tarifa</h2>
          <table className="w-full border-collapse text-body-sm">
            <thead>
              <tr className="border-b border-hairline bg-surface-soft text-left">
                <th className="px-4 py-3 font-semibold text-ink">Tarifa</th>
                <th className="px-4 py-3 font-semibold text-ink">Cancele grátis até</th>
                <th className="px-4 py-3 font-semibold text-ink">Reembolso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {TARIFA_PRAZOS.map((t) => (
                <tr key={t.tarifa}>
                  <td className="px-4 py-3 text-ink">{t.tarifa}</td>
                  <td className="px-4 py-3 text-ink">{t.prazo}</td>
                  <td className="px-4 py-3 font-semibold text-success">Integral</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-body-sm text-muted">
            Depois desse prazo, o cancelamento passa pelo suporte.
          </p>
        </section>

        {/* Como cancelar */}
        <section className="mb-14">
          <h2 className="mb-6 text-display-sm text-ink">Como cancelar sua reserva</h2>
          <div className="space-y-4">
            {[
              { n: "1", t: "Acesse Minhas Reservas", d: "No menu da sua conta, abra a lista de reservas." },
              { n: "2", t: "Selecione a reserva", d: "Clique na reserva que deseja cancelar." },
              {
                n: "3",
                t: 'Clique em "Cancelar reserva"',
                d: "Dentro do prazo, o sistema mostra o reembolso integral antes de confirmar.",
              },
              { n: "4", t: "Confirme o cancelamento", d: "O processo é imediato. Você recebe confirmação por e-mail." },
            ].map((s) => (
              <div key={s.n} className="flex items-start gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mp-pale text-caption font-bold text-mp-indigo">
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
          <h2 className="mb-6 text-display-sm text-ink">Dúvidas frequentes</h2>
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
