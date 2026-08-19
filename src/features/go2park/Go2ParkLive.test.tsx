import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import {
  GO2PARK_COPY,
  GO2PARK_URL,
  Go2ParkCardCredit,
  Go2ParkLiveChip,
  Go2ParkLivePill,
  Go2ParkPageCredit,
  Go2ParkVanContact,
} from "./Go2ParkLive";

const UNIDADE = { companyName: "Virapark", locationName: "Aeroporto de Viracopos" };

describe("Go2Park (transfer com rastreio ao vivo)", () => {
  /**
   * A pílula é promessa, não atribuição: sobre a foto, a marca do parceiro competiria com o nome
   * do estacionamento, que é o que o cliente está procurando na lista.
   */
  it("a pílula da foto promete o serviço, sem citar a marca", () => {
    renderWithProviders(<Go2ParkLivePill />);
    const pill = screen.getByTestId("go2park-pill");
    expect(pill.textContent).toBe(GO2PARK_COPY.badge);
    expect(pill.textContent).not.toContain("Go2Park");
  });

  /** O card inteiro é um link; a pílula não pode abrir um buraco no alvo de toque. */
  it("a pílula não intercepta o clique do card", () => {
    renderWithProviders(<Go2ParkLivePill />);
    expect(screen.getByTestId("go2park-pill").className).toContain("pointer-events-none");
  });

  it("o crédito do card nomeia o parceiro e leva ao site dele", () => {
    renderWithProviders(<Go2ParkCardCredit />);
    const link = screen.getByRole("link", { name: "Go2Park" });
    expect(link).toHaveAttribute("href", GO2PARK_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  /**
   * O crédito mora dentro do `<Link>` que cobre o card. Sem parar a propagação, tocar na marca
   * navegaria para a unidade em vez de abrir o site do parceiro.
   */
  it("o clique na marca não dispara a navegação do card", async () => {
    let doCard = 0;
    renderWithProviders(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
      <div onClick={() => (doCard += 1)}>
        <Go2ParkCardCredit />
      </div>,
    );

    await userEvent.click(screen.getByRole("link", { name: "Go2Park" }));
    expect(doCard).toBe(0);
  });

  it("o crédito da página atribui a operação e resume o serviço numa linha", () => {
    renderWithProviders(<Go2ParkPageCredit />);
    expect(screen.getByTestId("go2park-credit")).toBeInTheDocument();
    expect(screen.getByText(GO2PARK_COPY.pageCreditBody)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go2Park" })).toHaveAttribute("href", GO2PARK_URL);
  });

  /**
   * Regressão da entrega de 19/08/2026. A sinalização eram duas peças grandes (bloco navy com
   * título e três micro-benefícios na página, pílula navy de duas linhas no card) que ocupavam
   * espaço de oferta para dar crédito de parceiro. Se voltarem, o redesign foi desfeito.
   */
  it("não reconstrói o bloco navy: sem título e sem os três micro-benefícios", () => {
    const { container } = renderWithProviders(
      <>
        <Go2ParkLivePill />
        <Go2ParkCardCredit />
        <Go2ParkPageCredit />
      </>,
    );

    expect(screen.queryByRole("heading")).toBeNull();
    const texto = container.textContent ?? "";
    for (const sumiu of [
      "Acompanhe a van ao vivo",
      "Acompanhe a van pelo celular",
      "A van no mapa",
      "Aviso quando ela está chegando",
      "sem instalar nada",
    ]) {
      expect(texto).not.toContain(sumiu);
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
        <Go2ParkCardCredit />
        <Go2ParkPageCredit />
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
    renderWithProviders(<Go2ParkVanContact {...UNIDADE} whatsapp="+5519988013420" />);

    expect(screen.getByTestId("go2park-cta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: GO2PARK_COPY.ctaSave })).toBeInTheDocument();

    const wpp = screen.getByRole("link", { name: GO2PARK_COPY.ctaWhatsapp });
    expect(wpp).toHaveAttribute("href", expect.stringContaining("https://wa.me/5519988013420"));
    expect(wpp).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("sem número, não renderiza nada", () => {
    const { container } = renderWithProviders(<Go2ParkVanContact {...UNIDADE} whatsapp={null} />);

    expect(container.textContent).toBe("");
    expect(screen.queryByTestId("go2park-cta")).not.toBeInTheDocument();
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
      renderWithProviders(<Go2ParkVanContact {...UNIDADE} whatsapp="+5519988013420" />);
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
