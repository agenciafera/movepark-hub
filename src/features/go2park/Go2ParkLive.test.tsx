import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { GO2PARK_COPY, Go2ParkLiveBadge, Go2ParkLiveBlock, Go2ParkLiveChip } from "./Go2ParkLive";

const UNIDADE = { companyName: "Virapark", locationName: "Aeroporto de Viracopos" };

describe("Go2Park (transfer com rastreio ao vivo)", () => {
  it("a faixa do card diz o que a unidade entrega e nomeia o produto", () => {
    renderWithProviders(<Go2ParkLiveBadge />);
    expect(screen.getByTestId("go2park-badge")).toBeInTheDocument();
    expect(screen.getByText(GO2PARK_COPY.badge)).toBeInTheDocument();
    expect(screen.getByText(GO2PARK_COPY.badgeSub)).toBeInTheDocument();
    expect(screen.getByText("Go2Park")).toBeInTheDocument();
  });

  it("o bloco da unidade traz título, explicação e os pontos do serviço", () => {
    renderWithProviders(<Go2ParkLiveBlock />);
    expect(screen.getByRole("heading", { name: GO2PARK_COPY.blockTitle })).toBeInTheDocument();
    expect(screen.getByText(GO2PARK_COPY.blockBody)).toBeInTheDocument();
    for (const p of GO2PARK_COPY.points) {
      expect(screen.getByText(p.text)).toBeInTheDocument();
    }
  });

  it("o chip cabe numa linha de metadados, só com o rótulo", () => {
    renderWithProviders(<Go2ParkLiveChip />);
    expect(screen.getByTestId("go2park-chip").textContent).toBe(GO2PARK_COPY.badge);
  });

  /**
   * A marca do projeto é "Movepark"; a do produto irmão é "Go2Park". Caixa alta ("GO2PARK") ou
   * espaço ("Go 2 Park") no meio da página quebram as duas convenções de uma vez.
   */
  it("escreve o nome do produto sempre como Go2Park", () => {
    const { container } = renderWithProviders(
      <>
        <Go2ParkLiveBadge />
        <Go2ParkLiveBlock />
      </>,
    );
    const texto = container.textContent ?? "";
    expect(texto).toContain("Go2Park");
    expect(texto).not.toMatch(/GO2PARK|Go 2 Park|go2park/);
  });
});

/**
 * O contato da van é o passo entre mostrar o diferencial e o cliente conseguir usar. Cada unidade
 * tem o seu número, que hoje mora no painel da Go2Park e é copiado à mão para
 * `location.go2park_whatsapp`. Enquanto ninguém copiou, o bloco explica o serviço e não oferece
 * botão: mandar quem acabou de pousar para o número de outro lote é pior do que não oferecer nada.
 */
describe("Go2Park · contato da van", () => {
  it("com número, oferece salvar o contato e abrir o WhatsApp", () => {
    renderWithProviders(<Go2ParkLiveBlock {...UNIDADE} whatsapp="+5519988013420" />);

    expect(screen.getByTestId("go2park-cta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: GO2PARK_COPY.ctaSave })).toBeInTheDocument();

    const wpp = screen.getByRole("link", { name: GO2PARK_COPY.ctaWhatsapp });
    expect(wpp).toHaveAttribute("href", expect.stringContaining("https://wa.me/5519988013420"));
    expect(wpp).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("sem número, o bloco continua explicando o serviço, mas sem CTA", () => {
    renderWithProviders(<Go2ParkLiveBlock {...UNIDADE} whatsapp={null} />);

    expect(screen.getByText(GO2PARK_COPY.blockBody)).toBeInTheDocument();
    expect(screen.queryByTestId("go2park-cta")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: GO2PARK_COPY.ctaWhatsapp })).not.toBeInTheDocument();
  });

  it("salvar o contato baixa um .vcf com o nome da unidade", async () => {
    const criados: { tipo: string; conteudo: string }[] = [];
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = ((blob: Blob) => {
      criados.push({ tipo: blob.type, conteudo: "" });
      return "blob:van";
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;

    let baixado: { href: string; download: string } | null = null;
    const clickOriginal = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      baixado = { href: this.href, download: this.download };
    };

    try {
      renderWithProviders(<Go2ParkLiveBlock {...UNIDADE} whatsapp="+5519988013420" />);
      await userEvent.click(screen.getByRole("button", { name: GO2PARK_COPY.ctaSave }));

      expect(criados[0]?.tipo).toContain("text/vcard");
      expect(baixado!.download).toBe("van-virapark-aeroporto-de-viracopos.vcf");
    } finally {
      HTMLAnchorElement.prototype.click = clickOriginal;
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});
