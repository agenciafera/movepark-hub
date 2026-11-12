import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import {
  RECOVERY_CSV_HEADERS,
  csvSafeText,
  formatRecoveryPhone,
  recoveryCsvRow,
  recoveryOriginLabel,
  stoppedAtLabel,
  talkedToMia,
  whatsappLink,
  type RecoverableBooking,
} from "./recovery.logic";

function linha(extra: Partial<RecoverableBooking> = {}): RecoverableBooking {
  return {
    booking_id: "b1",
    code: "MP-AAA111",
    customer_name: "Ana Souza",
    customer_phone: "+55 (11) 98765-4321",
    customer_email: "ana@exemplo.test",
    location_name: "GRU",
    parking_type: "Vaga Descoberta",
    check_in_at: "2026-11-17T05:00:00Z",
    check_out_at: "2026-11-25T08:30:00Z",
    days: 9,
    total_amount: 170.1,
    attempts: 1,
    origin: "hub_direct",
    stopped_at: "pagamento",
    created_at: "2026-11-07T17:22:00Z",
    ...extra,
  };
}

describe("origem e Mia", () => {
  it("só a origem whatsapp-bot conta como conversa com a Mia", () => {
    expect(talkedToMia("whatsapp-bot")).toBe(true);
    expect(talkedToMia("hub_direct")).toBe(false);
    expect(talkedToMia(null)).toBe(false);
  });

  it("traduz a origem para o vocabulário do parceiro", () => {
    expect(recoveryOriginLabel("hub_direct")).toBe("Site");
    expect(recoveryOriginLabel("hub_search")).toBe("Site");
    expect(recoveryOriginLabel("hub_destino")).toBe("Página do destino");
    expect(recoveryOriginLabel("whatsapp-bot")).toBe("Mia no WhatsApp");
    expect(recoveryOriginLabel("algo-novo")).toBe("algo-novo");
  });
});

describe("onde parou", () => {
  it("rotula cada etapa e não esconde valor desconhecido", () => {
    expect(stoppedAtLabel("dados")).toBe("Antes de preencher os dados");
    expect(stoppedAtLabel("veiculo")).toBe("Antes de informar o veículo");
    expect(stoppedAtLabel("pagamento")).toBe("Na hora de pagar");
    expect(stoppedAtLabel("pix")).toBe("PIX gerado e não pago");
    expect(stoppedAtLabel("cartao")).toBe("Cartão não aprovado");
    expect(stoppedAtLabel("outra")).toBe("outra");
  });
});

describe("telefone", () => {
  it("lê o número com ou sem DDI e máscara", () => {
    expect(formatRecoveryPhone("+55 (11) 98765-4321")).toBe("(11) 98765-4321");
    expect(formatRecoveryPhone("5511987654321")).toBe("(11) 98765-4321");
    expect(formatRecoveryPhone("11987654321")).toBe("(11) 98765-4321");
    expect(formatRecoveryPhone(null)).toBeNull();
    expect(formatRecoveryPhone("+1 415 555 0100")).toBe("+1 415 555 0100");
  });

  it("monta o link do WhatsApp só para celular brasileiro", () => {
    expect(whatsappLink("11987654321")).toBe("https://wa.me/5511987654321");
    expect(whatsappLink("1133334444")).toBeNull();
    expect(whatsappLink(null)).toBeNull();
  });
});

describe("CSV", () => {
  it("tem uma coluna por campo pedido, na ordem do cabeçalho", () => {
    const row = recoveryCsvRow(linha({ origin: "whatsapp-bot", attempts: 2 }));
    expect(Object.keys(row)).toEqual([...RECOVERY_CSV_HEADERS]);
    expect(row).toMatchObject({
      Nome: "Ana Souza",
      Telefone: "(11) 98765-4321",
      "E-mail": "ana@exemplo.test",
      Reserva: "MP-AAA111",
      Vaga: "Vaga Descoberta",
      Diárias: "9",
      "Valor (R$)": "170,10",
      Tentativas: "2",
      Origem: "Mia no WhatsApp",
      "Falou com a Mia": "Sim",
      "Onde parou": "Na hora de pagar",
    });
  });

  it("campo vazio sai vazio, não 'null'", () => {
    const row = recoveryCsvRow(
      linha({ customer_name: null, customer_email: null, customer_phone: null, days: null, total_amount: null }),
    );
    expect(row.Nome).toBe("");
    expect(row["E-mail"]).toBe("");
    expect(row.Telefone).toBe("");
    expect(row.Diárias).toBe("");
    expect(row["Valor (R$)"]).toBe("");
    const csv = toCsv([row], [...RECOVERY_CSV_HEADERS]);
    expect(csv).not.toContain("null");
  });
});

describe("CSV seguro para planilha", () => {
  it("nome que parece fórmula vira texto", () => {
    expect(csvSafeText('=HYPERLINK("http://x","clique")')).toBe(`'=HYPERLINK("http://x","clique")`);
    expect(csvSafeText("+5511")).toBe("'+5511");
    expect(csvSafeText("@soma")).toBe("'@soma");
    expect(csvSafeText("Ana")).toBe("Ana");
    expect(csvSafeText(null)).toBe("");
    expect(recoveryCsvRow(linha({ customer_name: "=1+1" })).Nome).toBe("'=1+1");
  });
});
