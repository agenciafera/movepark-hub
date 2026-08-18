import { describe, it, expect } from "vitest";
import {
  brlFromCents,
  brlShort,
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

describe("brlShort", () => {
  it("tira os centavos quando eles são zero", () => {
    expect(brlShort(25)).toBe(brlFromCents(2500).replace(",00", ""));
    expect(brlShort(25)).not.toContain(",00");
  });
  it("valor quebrado mantém os centavos", () => {
    expect(brlShort(25.5)).toContain(",50");
  });
});

describe("compartilhamento de indicação", () => {
  const link = "https://movepark.co/r/JOAO2X9";
  it("monta a mensagem com o link e o valor do programa", () => {
    expect(referralMessage(link, 25)).toContain(link);
    // `brlFromCents` usa Intl, que separa "R$" do número com espaço não separável:
    // comparar com literal de espaço comum falha por um caractere invisível.
    expect(referralMessage(link, 25)).toContain(`${brlFromCents(2500)} de desconto`);
  });
  /** O valor é config: mudar o programa não pode exigir mexer no código. */
  it("o valor da mensagem acompanha o programa", () => {
    expect(referralMessage(link, 40)).toContain(`${brlFromCents(4000)} de desconto`);
    expect(referralMessage(link, 40)).not.toContain(brlFromCents(2500));
  });
  it("gera a URL do WhatsApp com a mensagem codificada", () => {
    const url = whatsappShareUrl(link, 25);
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(url).toContain(encodeURIComponent(link));
  });
});
