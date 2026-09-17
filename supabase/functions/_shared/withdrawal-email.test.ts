import { assertEquals } from "jsr:@std/assert";
import { accountTailFromRaw, sendWithdrawalEmails, withdrawalEmailsDue } from "./withdrawal-email.ts";

Deno.test("quais e-mails o saque deve: pedido, desfecho, ou nada", () => {
  assertEquals(withdrawalEmailsDue({ status: "processing", requested_email_sent_at: null, settled_email_sent_at: null }), ["requested"]);
  assertEquals(withdrawalEmailsDue({ status: "processing", requested_email_sent_at: "x", settled_email_sent_at: null }), []);
  assertEquals(withdrawalEmailsDue({ status: "paid", requested_email_sent_at: "x", settled_email_sent_at: null }), ["settled"]);
  assertEquals(withdrawalEmailsDue({ status: "failed", requested_email_sent_at: null, settled_email_sent_at: null }), ["requested", "settled"]);
  assertEquals(withdrawalEmailsDue({ status: "paid", requested_email_sent_at: "x", settled_email_sent_at: "y" }), []);
});

Deno.test("final da conta vem do payload da transferência", () => {
  assertEquals(accountTailFromRaw({ bank_account: { conta: "2195482", conta_dv: "1" } }), "5482-1");
  assertEquals(accountTailFromRaw({ bank_account: { conta: 12, conta_dv: null } }), "12");
  assertEquals(accountTailFromRaw(null), null);
});

Deno.test("quem perde a reivindicação não manda: dois gatilhos, um e-mail", async () => {
  // O UPDATE condicional volta vazio (outro processo já marcou); nada mais é lido nem enviado.
  let leituras = 0;
  const admin = {
    from: (t: string) => ({
      update: () => ({ eq: () => ({ is: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }) }),
      select: () => { leituras += 1; return { eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }), is: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }), in: () => Promise.resolve({ data: [] }) }; },
      _t: t,
    }),
  };
  const sent = await sendWithdrawalEmails(admin, {
    id: "w1", company_id: "c1", amount_cents: 633, fee_cents: 367, status: "processing",
    expected_at: null, paid_at: null, failure_reason: null, requested_email_sent_at: null, settled_email_sent_at: null,
  });
  assertEquals(sent, []);
  assertEquals(leituras, 0);
});
