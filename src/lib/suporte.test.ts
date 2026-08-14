import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMAIL_SUPORTE, WHATSAPP_SUPORTE, WHATSAPP_SUPORTE_DIGITOS } from "./suporte";

describe("canal de suporte", () => {
  /**
   * O placeholder `5511999999999` foi ao ar na página de contato e só apareceu
   * numa reunião. Um dígito a menos, ou um número de teste que escapa, abre uma
   * conversa com ninguém.
   */
  it("o WhatsApp é o número real, em formato que o wa.me aceita", () => {
    expect(WHATSAPP_SUPORTE_DIGITOS).toBe("5511994752952");
    expect(WHATSAPP_SUPORTE_DIGITOS).toMatch(/^55\d{10,11}$/);
    expect(WHATSAPP_SUPORTE.href).toBe("https://wa.me/5511994752952");
  });

  it("o rótulo mostra o mesmo número que o link disca", () => {
    expect(WHATSAPP_SUPORTE.label.replace(/\D/g, "")).toBe(
      WHATSAPP_SUPORTE_DIGITOS.replace(/^55/, ""),
    );
  });

  it("o e-mail é do domínio da marca", () => {
    expect(EMAIL_SUPORTE).toBe("contato@movepark.co");
  });

  /**
   * A Edge roda em Deno e não enxerga `src/`, então `_shared/email.ts` mantém a
   * própria cópia do número. Foi exatamente essa duplicação que deixou a página
   * de contato para trás, e a leitura do arquivo é o que impede a segunda vez.
   */
  it("o número do e-mail transacional é o mesmo do site", () => {
    const edge = readFileSync("supabase/functions/_shared/email.ts", "utf-8");
    const encontrados = [...edge.matchAll(/wa\.me\/(\d+)/g)].map((m) => m[1]);

    expect(encontrados.length).toBeGreaterThan(0);
    for (const numero of encontrados) {
      expect(numero).toBe(WHATSAPP_SUPORTE_DIGITOS);
    }
  });
});
