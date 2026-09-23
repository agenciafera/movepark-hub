import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { planChannels, WHATSAPP_TEMPLATE_ENV } from "./notify.ts";

const base = { hasBenefit: true, templateConfigured: true, hasPhone: true, hasEmail: true, alreadySentWhatsApp: false, alreadySentEmail: false };

Deno.test("planChannels: com benefício e template, vai por WhatsApp; o e-mail fica de queda", () => {
  assertEquals(planChannels(base), { whatsapp: true, emailFallback: true });
});

Deno.test("planChannels: sem template aprovado, o benefício é entregue por e-mail", () => {
  assertEquals(planChannels({ ...base, templateConfigured: false }), { whatsapp: false, emailFallback: true });
});

Deno.test("planChannels: Básica (sem benefício) recebe só o e-mail", () => {
  assertEquals(planChannels({ ...base, hasBenefit: false }), { whatsapp: false, emailFallback: true });
});

Deno.test("planChannels: já enviado por WhatsApp não manda de novo nem por e-mail", () => {
  assertEquals(planChannels({ ...base, alreadySentWhatsApp: true }), { whatsapp: false, emailFallback: false });
});

Deno.test("planChannels: e-mail já enviado não repete; sem e-mail montado não há queda", () => {
  assertEquals(planChannels({ ...base, templateConfigured: false, alreadySentEmail: true }), { whatsapp: false, emailFallback: false });
  assertEquals(planChannels({ ...base, hasEmail: false }).emailFallback, false);
});

Deno.test("todo evento tem um segredo de template nomeado", () => {
  for (const [ev, env] of Object.entries(WHATSAPP_TEMPLATE_ENV)) {
    assertEquals(env.startsWith("WHATSAPP_BOOKING_") && env.endsWith("_TEMPLATE"), true, ev);
  }
});
