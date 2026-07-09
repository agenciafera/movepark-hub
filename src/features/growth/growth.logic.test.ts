import { describe, it, expect } from "vitest";
import {
  brlFromCents,
  daysUntil,
  tierProgress,
  cashbackPctLabel,
  firstNameOf,
  referralMessage,
  whatsappShareUrl,
} from "./growth.logic";

describe("brlFromCents", () => {
  it("formata centavos como BRL", () => {
    expect(brlFromCents(4200)).toBe("R$ 42,00");
    expect(brlFromCents(0)).toBe("R$ 0,00");
    expect(brlFromCents(159)).toBe("R$ 1,59");
  });
});

describe("daysUntil", () => {
  const now = Date.parse("2026-07-09T12:00:00Z");
  it("arredonda pra cima os dias restantes", () => {
    expect(daysUntil("2026-07-11T12:00:00Z", now)).toBe(2);
    expect(daysUntil("2026-07-10T13:00:00Z", now)).toBe(2);
  });
  it("nunca é negativo", () => {
    expect(daysUntil("2026-07-01T12:00:00Z", now)).toBe(0);
  });
});

describe("tierProgress", () => {
  it("calcula o percentual rumo ao próximo nível", () => {
    expect(tierProgress(3, 6)).toBe(50);
    expect(tierProgress(2, 6)).toBe(33);
  });
  it("trava em 100 e trata o topo", () => {
    expect(tierProgress(10, 6)).toBe(100);
    expect(tierProgress(3, null)).toBe(100);
  });
});

describe("cashbackPctLabel", () => {
  it("converte bps em percentual", () => {
    expect(cashbackPctLabel(300)).toBe("3%");
    expect(cashbackPctLabel(500)).toBe("5%");
    expect(cashbackPctLabel(0)).toBe("0%");
  });
});

describe("firstNameOf", () => {
  it("pega o primeiro nome", () => {
    expect(firstNameOf("João da Silva")).toBe("João");
  });
  it("usa fallback quando vazio", () => {
    expect(firstNameOf(null)).toBe("cliente");
    expect(firstNameOf("   ")).toBe("cliente");
  });
});

describe("compartilhamento de indicação", () => {
  const link = "https://hub.movepark.co/r/JOAO2X9";
  it("monta a mensagem com o link", () => {
    expect(referralMessage(link)).toContain(link);
    expect(referralMessage(link)).toContain("R$ 25 de desconto");
  });
  it("gera a URL do WhatsApp com a mensagem codificada", () => {
    const url = whatsappShareUrl(link);
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(url).toContain(encodeURIComponent(link));
  });
});
