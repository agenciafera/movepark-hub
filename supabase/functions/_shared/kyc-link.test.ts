import { assertEquals } from "jsr:@std/assert";
import { hasLiveKycLink, PROVIDER_STATUS_AWAITING_KYC } from "./kyc-link.ts";

const NOW = new Date("2026-07-30T20:30:00Z");

Deno.test("PROVIDER_STATUS_AWAITING_KYC é o status em que o gateway libera o link", () => {
  // Medido em produção: `registration` vem com kyc_details pending/in_analysis e o kyc_link não
  // responde 200; `affiliation` vem com partially_denied e aí o link sai.
  assertEquals(PROVIDER_STATUS_AWAITING_KYC, "affiliation");
});

Deno.test("hasLiveKycLink: exige url E validade no futuro", () => {
  assertEquals(hasLiveKycLink("https://x", "2026-07-30T20:46:41Z", NOW), true);
  assertEquals(hasLiveKycLink("https://x", "2026-07-30T20:10:00Z", NOW), false);
});

Deno.test("hasLiveKycLink: sem url não há link vivo", () => {
  assertEquals(hasLiveKycLink(null, "2026-07-30T20:46:41Z", NOW), false);
  assertEquals(hasLiveKycLink("   ", "2026-07-30T20:46:41Z", NOW), false);
});

Deno.test("hasLiveKycLink: validade ausente ou ilegível não conta como vivo", () => {
  // Melhor emitir um link novo do que assumir que o antigo ainda serve.
  assertEquals(hasLiveKycLink("https://x", null, NOW), false);
  assertEquals(hasLiveKycLink("https://x", "qualquer coisa", NOW), false);
});
