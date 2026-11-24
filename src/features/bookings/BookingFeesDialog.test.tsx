import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { buildMoneyBreakdown, type MoneyPaymentLike } from "./bookingMoney.logic";

// Tudo inventado: o repo é público.
const state = vi.hoisted(() => ({
  cardBps: 118,
  events: [] as unknown[],
  partner: [] as unknown[],
}));
vi.mock("./api", () => ({
  useBookingGatewayTrail: () => ({
    data: { payments: [], events: state.events },
    isLoading: false,
  }),
  usePartnerBookingPayables: () => ({ data: state.partner, isLoading: false }),
}));
// A tabela como o estacionamento lê (partner_fee_table): sem o gateway por transação e, sem venda
// pagando antifraude, sem antifraude.
vi.mock("@/features/commission/api", () => ({
  usePartnerFeeTable: () => ({
    isLoading: false,
    data: {
      pix_bps: 80,
      card: [
        { from: 1, to: 1, bps: state.cardBps },
        { from: 2, to: 6, bps: state.cardBps },
        { from: 7, to: 12, bps: state.cardBps },
      ],
      cet30_bps: Array.from({ length: 12 }, (_, i) => 300 + i * 100),
      antifraud_cents: null,
      anticipation_rate_bps: 200,
      withdrawal_fee_cents: 150,
      policy: {
        version: 1,
        enabled: true,
        maxInstallments: 6,
        interestFreeUpTo: 2,
        monthlyInterestPct: 2,
        minInstallmentCents: 500,
        absorb: "customer",
      },
      channels: [],
    },
  }),
}));
vi.mock("@/features/settings/api", () => ({
  useAppSettings: () => ({
    isLoading: false,
    data: {
      gateway_fee_schedule: JSON.stringify({
        version: 1,
        pix_bps: 80,
        card: [
          { from: 1, to: 1, bps: state.cardBps },
          { from: 2, to: 6, bps: state.cardBps },
          { from: 7, to: 12, bps: state.cardBps },
        ],
        antifraud_cents: 5,
        processing_cents: 50,
        cet30_bps: Array.from({ length: 12 }, (_, i) => 300 + i * 100),
      }),
      card_anticipation_rate_monthly_bps: "200",
      card_installment_policy: JSON.stringify({
        version: 1,
        enabled: true,
        maxInstallments: 6,
        interestFreeUpTo: 2,
        monthlyInterestPct: 2,
        minInstallmentCents: 500,
        absorb: "customer",
      }),
      pagarme_movepark_recipient_id: "re_m",
    },
  }),
}));

import { BookingFeesDialog } from "./BookingFeesDialog";

const payables = (method: "card" | "pix") => ({
  payment_id: "p1",
  kind: "payables",
  created_at: "2026-11-02T10:00:00Z",
  response: {
    data:
      method === "card"
        ? [
            {
              type: "credit",
              recipient_id: "re_p",
              amount: 4000,
              fee: 0,
              installment: 1,
              payment_date: "2026-12-01T03:00:00Z",
            },
            {
              type: "credit",
              recipient_id: "re_m",
              amount: 1000,
              fee: 60,
              fraud_coverage_fee: 10,
              installment: 1,
              payment_date: "2026-12-01T03:00:00Z",
            },
            {
              type: "credit",
              recipient_id: "re_p",
              amount: 4000,
              fee: 0,
              anticipation_fee: 40,
              installment: 2,
              payment_date: "2026-11-05T03:00:00Z",
              original_payment_date: "2027-01-01T03:00:00Z",
            },
            {
              type: "credit",
              recipient_id: "re_m",
              amount: 1000,
              fee: 60,
              anticipation_fee: 5,
              installment: 2,
              payment_date: "2026-11-05T03:00:00Z",
              original_payment_date: "2027-01-01T03:00:00Z",
            },
          ]
        : [{ type: "credit", recipient_id: "re_m", amount: 2000, fee: 80 }],
  },
});

function abre(
  method: "card" | "pix",
  opts: {
    comp?: number;
    semAntecipacao?: boolean;
    installments?: number;
    operator?: boolean;
    semRecebivel?: boolean;
  } = {},
) {
  const ev: {
    payment_id: string;
    kind: string;
    created_at: string;
    response: { data: Record<string, unknown>[] };
  } = payables(method);
  if (opts.semAntecipacao)
    ev.response.data = ev.response.data.map((r) => ({
      ...r,
      anticipation_fee: 0,
      payment_date: r.original_payment_date ?? r.payment_date,
    }));
  if (opts.installments === 1)
    ev.response.data = ev.response.data
      .filter((r) => r.installment === 1)
      .map((r) => ({ ...r, anticipation_fee: 0 }));
  state.events = [ev];
  // A RPC do estacionamento devolve o recebedor como movepark/partner, sem o id na Pagar.me.
  state.partner = [
    {
      payment_id: ev.payment_id,
      created_at: ev.created_at,
      rows: ev.response.data.map(({ recipient_id, ...r }) => ({
        ...r,
        recipient: recipient_id === "re_m" ? "movepark" : "partner",
      })),
    },
  ];
  if (opts.semRecebivel) {
    state.events = [];
    state.partner = [];
  }
  const fee = opts.semRecebivel ? null : method === "card" ? (opts.semAntecipacao ? 130 : 175) : 80;
  const pay: MoneyPaymentLike = {
    status: "paid",
    method,
    amount: 100,
    installments: opts.installments ?? (method === "card" ? 2 : 1),
    split: [
      { role: "partner", amount: 8000, chargeProcessingFee: false },
      { role: "movepark", amount: 2000, liable: true },
    ],
    split_sent_to_gateway: true,
    debt_recovered_cents: 0,
    gateway_fee_cents: fee,
    partner_release_at: null,
    paid_at: "2026-11-01T12:00:00Z",
    refunded_amount: null,
    refund_absorbed_by_master: false,
    refund_partner_cents: 0,
    created_at: "2026-11-01T12:00:00Z",
    anticipation_comp_cents: opts.comp ?? null,
  };
  const money = buildMoneyBreakdown(
    { days: 1, total: 100, line_items: [{ kind: "parking", quantity: 1, subtotal: 100 }] },
    100,
    pay,
  );
  return renderWithProviders(
    <BookingFeesDialog
      open
      onOpenChange={() => {}}
      audience={opts.operator ? "operator" : "manager"}
      companyId="c1"
      bookingId="bk-1"
      money={money}
      payment={{
        id: "p1",
        method,
        amount: 100,
        installments: pay.installments,
        gateway_fee_cents: fee,
        anticipation_credit_cents: 40,
        anticipation_comp_cents: opts.comp ?? null,
      }}
      booking={{
        total_amount: 100,
        commission_channel: "hub",
        commission_take_rate_bps: 2000,
        commission_anticipation_payer: "movepark",
      }}
    />,
  );
}

describe("BookingFeesDialog", () => {
  it("cartão: os quatro blocos, a taxa efetiva ao lado do contrato e o total do gateway", () => {
    state.cardBps = 118;
    abre("card");
    for (const t of ["Resumo", "Taxas cobradas nesta venda", "Parcelas", "Tabela de taxas"])
      expect(screen.getByText(t)).toBeInTheDocument();
    const mdr = screen.getByTestId("taxa-mdr");
    expect(mdr).toHaveTextContent("Cartão (Pagar.me)");
    expect(mdr).toHaveTextContent(/1,20% nesta venda · contrato 1,18%/);
    expect(mdr).not.toHaveTextContent("diferente do contrato");
    expect(screen.getByTestId("taxa-total")).toHaveTextContent(/1,75/);
    expect(screen.getByTestId("taxa-anticipation")).toHaveTextContent(/devolveu/);
    expect(within(screen.getByTestId("taxas-parcelas")).getAllByRole("row")).toHaveLength(3);
    // Condições acordadas: taxa por faixa e custo para receber em 30 dias, com a venda destacada.
    const gateway = screen.getByTestId("tabela-gateway");
    const linha2x = within(gateway).getByText("2x").closest("tr");
    expect(linha2x).toHaveAttribute("aria-current", "true");
    expect(linha2x).toHaveTextContent(/1,18%\s*4,00%/);
    expect(gateway).toHaveTextContent(/Antecipação automática\s*2,00% ao mês/);
    expect(gateway).toHaveTextContent(/Gateway por transação\s*R\$\s?0,50/);
    expect(screen.getByTestId("taxa-total")).toHaveTextContent(
      /contrato para receber em 30 dias: 4,00% \(R\$\s?4,00\)/,
    );
    expect(
      within(screen.getByTestId("tabela-parcelamento"))
        .getByText(/2x de/)
        .closest("[aria-current]"),
    ).not.toBeNull();
  });

  it("cartão antes da antecipação: taxa prevista, parcelas entrando junto com a 1ª e total previsto", () => {
    state.cardBps = 118;
    abre("card", { comp: 300, semAntecipacao: true });
    const ant = screen.getByTestId("taxa-anticipation");
    expect(ant).toHaveTextContent(/R\$\s?3,00 previstos/);
    expect(ant).toHaveTextContent(/prevista para perto de 01\/12\/2026/);
    expect(ant).toHaveTextContent(
      /a Movepark já passou R\$\s?3,00 da parte dela para o estacionamento cobrir/,
    );
    expect(ant).not.toHaveTextContent("ainda não antecipado");
    expect(screen.getByTestId("taxa-total")).toHaveTextContent(
      /com a antecipação prevista: R\$\s?4,30/,
    );
    const linhas = within(screen.getByTestId("taxas-parcelas")).getAllByRole("row");
    expect(linhas[2]).toHaveTextContent(/01\/12\/2026 \(prevista\)/);
    // A Movepark fica com a comissão menos a cessão: 2000 - 300 - 130 de MDR que ela paga.
    expect(screen.getByText("A Movepark fica com").nextSibling).toHaveTextContent(/15,70/);
  });

  it("à vista: sem linha de antecipação; a cessão antiga vira linha própria (MP-784999)", () => {
    state.cardBps = 118;
    abre("card", { installments: 1, comp: 107 });
    expect(screen.queryByTestId("taxa-anticipation")).toBeNull();
    const cessao = screen.getByTestId("taxa-cession");
    expect(cessao).toHaveTextContent("Cessão ao estacionamento");
    expect(cessao).toHaveTextContent(/R\$\s?1,07/);
    expect(cessao).toHaveTextContent("quem paga: Movepark");
  });

  it("à vista no Operator: ajuste a seu favor, sem falar em antecipação", () => {
    state.cardBps = 118;
    abre("card", { installments: 1, comp: 107, operator: true });
    expect(screen.queryByTestId("taxa-anticipation")).toBeNull();
    const cessao = screen.getByTestId("taxa-cession");
    expect(cessao).toHaveTextContent("Ajuste a seu favor");
    expect(cessao).toHaveTextContent("o valor fica com você");
    expect(cessao).not.toHaveTextContent(/antecipa/i);
  });

  it("à vista sem cessão: nenhuma linha de antecipação", () => {
    state.cardBps = 118;
    abre("card", { installments: 1 });
    expect(screen.queryByTestId("taxa-anticipation")).toBeNull();
    expect(screen.queryByTestId("taxa-cession")).toBeNull();
  });

  it("cartão fora do contrato ganha o aviso", () => {
    state.cardBps = 126;
    abre("card");
    expect(screen.getByTestId("taxa-mdr")).toHaveTextContent("diferente do contrato");
  });

  it("estacionamento: a parte dele, sem a conferência com o contrato nem o custo interno", () => {
    state.cardBps = 126;
    abre("card", { operator: true });
    expect(
      screen.getByText("Quem pagou cada taxa desta venda e quando o dinheiro entra."),
    ).toBeInTheDocument();
    expect(screen.getByText("Você recebe")).toBeInTheDocument();
    expect(screen.getByTestId("taxas-voce-recebe")).toHaveTextContent(/80,00/);
    expect(screen.queryByText("A Movepark fica com")).toBeNull();
    expect(screen.queryByText("O estacionamento recebe")).toBeNull();
    expect(screen.getByTestId("taxa-commission")).toHaveTextContent("quem paga: você");
    const mdr = screen.getByTestId("taxa-mdr");
    expect(mdr).toHaveTextContent(/1,20% nesta venda/);
    expect(mdr).not.toHaveTextContent("contrato");
    expect(mdr).not.toHaveTextContent("diferente do contrato");
    // Os recebíveis vieram da RPC do estacionamento, com a antecipação das duas partes.
    expect(screen.getByTestId("taxa-anticipation")).toHaveTextContent(
      /você R\$\s?0,40 · Movepark R\$\s?0,05/,
    );
    expect(screen.getByTestId("taxa-anticipation")).toHaveTextContent(
      /devolveu R\$\s?0,40 para você/,
    );
    expect(screen.getByTestId("taxa-total")).toHaveTextContent(/1,75/);
    expect(screen.getByTestId("taxa-total")).toHaveTextContent(
      /tabela para receber em 30 dias: 4,00%/,
    );
    const gateway = screen.getByTestId("tabela-gateway");
    expect(gateway).toHaveTextContent(/Antecipação automática\s*2,00% ao mês/);
    expect(gateway).not.toHaveTextContent("Gateway por transação");
    expect(gateway).not.toHaveTextContent("Antifraude");
  });

  it("estacionamento antes da antecipação: a taxa prevista sai da parte dele", () => {
    state.cardBps = 118;
    abre("card", { operator: true, semAntecipacao: true, comp: 0 });
    // Sem cessão: a prevista é a estimativa da cobrança, e aqui não há; então nada previsto.
    expect(screen.getByTestId("taxa-anticipation")).toHaveTextContent("ainda não antecipado");
  });

  it("Pix: sem bloco de parcelas e sem antecipação", () => {
    state.cardBps = 118;
    abre("pix");
    expect(screen.queryByText("Parcelas")).toBeNull();
    expect(screen.queryByTestId("taxa-anticipation")).toBeNull();
    expect(screen.getByTestId("taxa-mdr")).toHaveTextContent(/Pix \(Pagar.me\)/);
    expect(screen.getByTestId("taxa-mdr")).toHaveTextContent(/0,80% nesta venda · contrato 0,80%/);
  });
});

describe("BookingFeesDialog antes da Pagar.me informar (MP-89AC91, 24/11/2026)", () => {
  it("Pix sem recebível: diz que a Pagar.me ainda não informou, sem antifraude e sem 'apurando'", () => {
    state.cardBps = 118;
    abre("pix", { operator: true, semRecebivel: true });
    expect(screen.queryByText(/apurando/)).toBeNull();
    const mdr = screen.getByTestId("taxa-mdr");
    expect(mdr).toHaveTextContent("a Pagar.me ainda não informou");
    expect(mdr).toHaveTextContent("a confirmar");
    expect(mdr).not.toHaveTextContent("parcela");
    expect(screen.queryByTestId("taxa-antifraud")).toBeNull();
    expect(screen.getByTestId("taxa-total")).toHaveTextContent(
      "a Pagar.me ainda não informou as taxas desta venda",
    );
  });
});
