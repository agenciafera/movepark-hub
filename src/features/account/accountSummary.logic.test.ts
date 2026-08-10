import { describe, expect, it } from "vitest";
import {
  activeBooking,
  historyFilters,
  nightsOf,
  paginate,
  yearToDate,
} from "./accountSummary.logic";
import type { MyBookingListItem } from "@/features/bookings/customerApi";

const AGORA = new Date("2026-08-03T12:00:00Z");

function booking(over: Partial<MyBookingListItem> & { id: string }): MyBookingListItem {
  return {
    code: `MP-${over.id}`,
    status: "completed",
    check_in_at: "2026-07-01T10:00:00Z",
    check_out_at: "2026-07-03T10:00:00Z",
    expires_at: null,
    total_amount: 100,
    created_at: "2026-06-01T10:00:00Z",
    location: {
      name: "Unidade",
      slug: "unidade",
      address: null,
      company: { name: "Virapark", slug: "virapark" },
      destination: null,
    },
    parking_type: { name: "Coberto", code: "COB" },
    ...over,
  } as MyBookingListItem;
}

describe("nightsOf", () => {
  it("conta os dias de calendário ocupados", () => {
    expect(nightsOf({ check_in_at: "2026-07-01T10:00:00Z", check_out_at: "2026-07-03T10:00:00Z" })).toBe(3);
  });

  it("entrada e saída no mesmo dia contam uma diária", () => {
    expect(nightsOf({ check_in_at: "2026-07-01T08:00:00Z", check_out_at: "2026-07-01T20:00:00Z" })).toBe(1);
  });

  /** Sair à meia-noite não ocupa o dia da saída. */
  it("check-out à meia-noite não cobra o dia seguinte", () => {
    expect(nightsOf({ check_in_at: "2026-07-01T10:00:00Z", check_out_at: "2026-07-02T00:00:00Z" })).toBe(1);
  });

  it("data inválida não vira NaN", () => {
    expect(nightsOf({ check_in_at: "nem data", check_out_at: "2026-07-02T00:00:00Z" })).toBe(0);
  });
});

describe("activeBooking", () => {
  it("a reserva em uso ganha da futura", () => {
    const emUso = booking({ id: "1", status: "checked_in" });
    const futura = booking({
      id: "2",
      status: "confirmed",
      check_in_at: "2026-08-10T10:00:00Z",
      check_out_at: "2026-08-12T10:00:00Z",
    });
    expect(activeBooking([futura, emUso], AGORA)?.id).toBe("1");
  });

  it("sem nenhuma em uso, escolhe o check-in mais próximo", () => {
    const longe = booking({
      id: "longe",
      status: "confirmed",
      check_in_at: "2026-09-01T10:00:00Z",
      check_out_at: "2026-09-03T10:00:00Z",
    });
    const perto = booking({
      id: "perto",
      status: "confirmed",
      check_in_at: "2026-08-05T10:00:00Z",
      check_out_at: "2026-08-07T10:00:00Z",
    });
    expect(activeBooking([longe, perto], AGORA)?.id).toBe("perto");
  });

  /** Histórico e cancelada não podem subir pro card de destaque. */
  it("só passado e cancelada volta null", () => {
    const passada = booking({ id: "1", status: "completed" });
    const cancelada = booking({ id: "2", status: "cancelled" });
    expect(activeBooking([passada, cancelada], AGORA)).toBeNull();
  });
});

describe("yearToDate", () => {
  const consumidas = [
    booking({ id: "1", status: "completed", total_amount: 150 }),
    booking({
      id: "2",
      status: "completed",
      total_amount: 90,
      check_in_at: "2026-05-01T10:00:00Z",
      check_out_at: "2026-05-02T10:00:00Z",
    }),
  ];

  it("soma o que já foi consumido", () => {
    const r = yearToDate(consumidas, [], AGORA);
    expect(r.spent).toBe(240);
    expect(r.stays).toBe(2);
    expect(r.nights).toBe(3 + 2);
  });

  /** Reserva futura ainda não é estadia, e cancelada nunca foi. */
  it("ignora futura e cancelada", () => {
    const futura = booking({
      id: "3",
      status: "confirmed",
      total_amount: 500,
      check_in_at: "2026-09-01T10:00:00Z",
      check_out_at: "2026-09-03T10:00:00Z",
    });
    const cancelada = booking({ id: "4", status: "cancelled", total_amount: 400 });
    const r = yearToDate([...consumidas, futura, cancelada], [], AGORA);
    expect(r.spent).toBe(240);
    expect(r.stays).toBe(2);
  });

  it("ignora estadia de outro ano", () => {
    const anoPassado = booking({
      id: "5",
      status: "completed",
      total_amount: 999,
      check_in_at: "2025-07-01T10:00:00Z",
      check_out_at: "2025-07-03T10:00:00Z",
    });
    expect(yearToDate([...consumidas, anoPassado], [], AGORA).spent).toBe(240);
  });

  it("soma só o cashback do ano, e converte de centavos", () => {
    const r = yearToDate(
      consumidas,
      [
        { amount_cents: 1840, kind: "cashback", created_at: "2026-06-01T10:00:00Z" },
        { amount_cents: 500, kind: "referral", created_at: "2026-06-01T10:00:00Z" },
        { amount_cents: 9900, kind: "cashback", created_at: "2025-06-01T10:00:00Z" },
      ],
      AGORA,
    );
    expect(r.cashback).toBe(18.4);
  });

  it("o destino favorito é o mais visitado no ano", () => {
    const gru = (id: string) =>
      booking({
        id,
        status: "completed",
        location: {
          name: "Unidade",
          slug: "u",
          address: null,
          company: { name: "V", slug: "v" },
          destination: { city: "Guarulhos", short_name: null },
        },
      });
    const vcp = booking({
      id: "vcp",
      status: "completed",
      location: {
        name: "Unidade",
        slug: "u",
        address: null,
        company: { name: "V", slug: "v" },
        destination: { city: "Campinas", short_name: null },
      },
    });
    expect(yearToDate([gru("a"), gru("b"), vcp], [], AGORA).topDestination).toBe("Guarulhos");
  });

  /** Unidade sem destino não pode inventar um: o bloco simplesmente some. */
  it("sem destino cadastrado, não há destino favorito", () => {
    expect(yearToDate(consumidas, [], AGORA).topDestination).toBeNull();
  });

  it("conta zerada não vira NaN", () => {
    const r = yearToDate([], [], AGORA);
    expect(r).toEqual({
      spent: 0,
      stays: 0,
      nights: 0,
      cashback: 0,
      fromCoupon: 0,
      fromPromo: 0,
      fromCounter: 0,
      discounts: 0,
      saved: 0,
      topDestination: null,
    });
  });

  it("soma a economia contra o balcão junto com as outras fontes", () => {
    const r = yearToDate(
      [booking({ id: "1", total_amount: 100, savedFromCounter: 3.98 })],
      [],
      AGORA,
    );
    expect(r.fromCounter).toBeCloseTo(3.98, 2);
    expect(r.discounts).toBeCloseTo(3.98, 2);
    expect(r.saved).toBeCloseTo(3.98, 2);
  });

  it("soma a economia por fonte, e o total junta as três", () => {
    const r = yearToDate(
      [
        booking({ id: "1", total_amount: 200, savedFromCoupon: 30, savedFromPromo: 10 }),
        booking({ id: "2", total_amount: 100, savedFromCoupon: 12.68 }),
      ],
      [{ amount_cents: 1840, kind: "cashback", created_at: "2026-04-01T10:00:00Z" }],
      AGORA,
    );

    expect(r.fromCoupon).toBeCloseTo(42.68, 2);
    expect(r.fromPromo).toBe(10);
    // `discounts` deixa o cashback de fora: desconto no preço e dinheiro de volta
    // são coisas diferentes, mesmo que os dois entrem no total economizado.
    expect(r.discounts).toBeCloseTo(52.68, 2);
    expect(r.saved).toBeCloseTo(71.08, 2);
    expect(r.spent).toBe(300);
  });

  /** Reserva sem cupom nem promoção não pode virar NaN na soma. */
  it("reserva sem desconto conta como zero", () => {
    const r = yearToDate([booking({ id: "1", total_amount: 100 })], [], AGORA);
    expect(r.saved).toBe(0);
    expect(r.discounts).toBe(0);
  });

  // A economia do ano passado não entra no ano corrente.
  it("desconto de reserva de outro ano fica de fora", () => {
    const r = yearToDate(
      [
        booking({
          id: "1",
          check_in_at: "2025-05-01T10:00:00Z",
          check_out_at: "2025-05-02T10:00:00Z",
          savedFromCoupon: 99,
        }),
      ],
      [],
      AGORA,
    );
    expect(r.saved).toBe(0);
  });
});

describe("historyFilters", () => {
  it("só entra o filtro que tem resultado, com Todas na frente", () => {
    const f = historyFilters(
      [
        booking({ id: "1", status: "completed" }),
        booking({ id: "2", status: "cancelled" }),
        booking({ id: "3", status: "cancelled" }),
      ],
      AGORA,
    );
    expect(f.map((x) => x.id)).toEqual(["all", "history", "cancelled"]);
    expect(f.find((x) => x.id === "cancelled")?.count).toBe(2);
    expect(f[0].count).toBe(3);
  });

  it("sem reserva nenhuma, não mostra chip", () => {
    expect(historyFilters([], AGORA)).toEqual([]);
  });
});

describe("paginate", () => {
  const lista = Array.from({ length: 25 }, (_, i) => i + 1);

  it("recorta a página pedida e conta o intervalo exibido", () => {
    const p = paginate(lista, 2, 10);
    expect(p.items).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(p).toMatchObject({ page: 2, pages: 3, total: 25, from: 11, to: 20 });
  });

  it("a última página fica curta, sem completar com vazio", () => {
    const p = paginate(lista, 3, 10);
    expect(p.items).toEqual([21, 22, 23, 24, 25]);
    expect(p.to).toBe(25);
  });

  /** Trocar de filtro encurta a lista; a página antiga não pode virar tela vazia. */
  it("página fora do intervalo cai na última existente", () => {
    expect(paginate(lista, 99, 10).page).toBe(3);
    expect(paginate(lista, 0, 10).page).toBe(1);
    expect(paginate(lista, -5, 10).page).toBe(1);
  });

  it("lista vazia continua com uma página, e intervalo zerado", () => {
    expect(paginate([], 1, 10)).toMatchObject({ items: [], page: 1, pages: 1, total: 0, from: 0, to: 0 });
  });

  it("cabendo tudo numa página, não há segunda", () => {
    expect(paginate([1, 2, 3], 1, 10).pages).toBe(1);
  });
});
