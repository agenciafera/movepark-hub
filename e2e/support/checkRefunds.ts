/**
 * C-22 do roteiro do consumidor: conferência do fechamento assíncrono do estorno.
 *
 *     bun run e2e/support/checkRefunds.ts
 *
 * POR QUE ISTO É UM SCRIPT E NÃO UM SPEC. O estorno de PIX fecha em três tempos,
 * e o pior caso legítimo leva perto de 30 minutos: a `reconcile-refunds` só olha
 * estornos com `refunded_at` de mais de 15 minutos (`reconcile-refunds:23`) e o
 * cron roda a cada 15 (`20260724000001_reconcile_refunds_cron.sql:7-21`). Meia
 * hora de espera não cabe num E2E, e um `waitFor` de 30 minutos seria pior que
 * não testar: prenderia a suíte e ainda assim daria falso negativo em pico.
 *
 * A divisão de trabalho é esta:
 *   - o estado IMEDIATO (`status = 'paid'` + `refunded_at` preenchido, que é o
 *     `refundPending`) já é assertado pelo C-19, dentro do E2E;
 *   - o estado FINAL (`status = 'refunded'`) é conferido aqui, por consulta,
 *     depois. Rode este script alguns minutos após a rodada do roteiro.
 *
 * O ERRO MAIS PROVÁVEL DO ROTEIRO INTEIRO é ler `paid` com `refunded_at` como
 * inconsistência. Não é: é o estado correto logo após o cancelamento. Só vira
 * bug depois de 30 minutos, e é isso que este script mede. Não confunda com o
 * C-12, cujo sintoma é o oposto: `paid_at` preenchido com status `pending`.
 *
 * Este script é SÓ LEITURA. Não escreve, não apaga, não reenvia nada.
 */
import { admin } from "./supabaseAdmin";
import { env, describeTarget } from "./env";

/** Prazo máximo legítimo: 15 min da janela da reconciliação + 15 min de cron. */
const SLA_MINUTES = 30;

type Row = {
  status: string;
  refunded_at: string;
  refunded_amount: number | null;
  refund_reason: string | null;
  booking: { code: string; status: string; customer_email: string | null } | null;
};

async function main() {
  console.log(`[C-22] ${describeTarget()}`);
  console.log(`[C-22] Estornos do cliente de teste ${env.customerEmail}, últimas 24h.\n`);

  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data, error } = await admin
    .from("payment")
    .select(
      "status, refunded_at, refunded_amount, refund_reason, booking!inner(code, status, customer_email)",
    )
    .not("refunded_at", "is", null)
    .gte("refunded_at", since)
    .eq("booking.customer_email", env.customerEmail)
    .order("refunded_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) {
    console.log("Nenhum estorno nas últimas 24h. Nada a conferir.");
    return;
  }

  let late = 0;
  for (const r of rows) {
    const ageMin = Math.round((Date.now() - new Date(r.refunded_at).getTime()) / 60_000);
    const closed = r.status === "refunded";
    const overdue = !closed && ageMin > SLA_MINUTES;
    if (overdue) late++;

    const verdict = closed
      ? "FECHADO"
      : overdue
        ? `ATRASADO (passou de ${SLA_MINUTES} min)`
        : "no prazo (fechamento assíncrono em andamento)";

    console.log(
      `${r.booking?.code ?? "?"}  payment=${r.status}  booking=${r.booking?.status ?? "?"}  ` +
        `há ${ageMin} min  →  ${verdict}`,
    );
  }

  console.log("");
  if (late > 0) {
    console.log(
      `${late} estorno(s) passaram de ${SLA_MINUTES} min sem virar 'refunded'. ` +
        "Agora sim vale abrir bug: comece pelos logs de `pagarme-webhook` e `reconcile-refunds`.",
    );
    process.exitCode = 1;
    return;
  }
  console.log("Nenhum estorno fora do prazo.");
}

main().catch((e) => {
  console.error("[C-22] Falhou:", e);
  process.exitCode = 1;
});
