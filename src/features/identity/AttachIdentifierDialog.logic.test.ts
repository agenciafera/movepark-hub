import { describe, it, expect } from "vitest";
import { computeMergeLogins, type MergePreview } from "./AttachIdentifierDialog.logic";

const preview = (over: Partial<MergePreview> = {}): MergePreview => ({
  bookings: 12,
  vehicles: 4,
  saved: 0,
  reviews: 0,
  email: null,
  phone: null,
  ...over,
});

const mine = {
  email: "peu+teste2@fera.ag",
  phone: null,
  email_verified: true,
  phone_verified: false,
};

describe("computeMergeLogins", () => {
  it("avisa que o e-mail da conta fundida deixa de ser login ao anexar telefone", () => {
    const { losing, remaining } = computeMergeLogins({
      channel: "phone",
      identifier: "+5511987727182",
      preview: preview({ email: "peu+teste1@fera.ag", phone: "+5511987727182" }),
      mine,
    });
    expect(losing).toEqual(["peu+teste1@fera.ag"]);
    expect(remaining).toEqual(["peu+teste2@fera.ag", "+5511987727182"]);
  });

  it("não avisa nada quando a conta fundida só tem o identificador sendo anexado", () => {
    const { losing } = computeMergeLogins({
      channel: "phone",
      identifier: "+5511987727182",
      preview: preview({ phone: "+5511987727182" }),
      mine,
    });
    expect(losing).toEqual([]);
  });

  it("ao anexar e-mail, quem some é o telefone da conta fundida", () => {
    const { losing, remaining } = computeMergeLogins({
      channel: "email",
      identifier: "peu+teste1@fera.ag",
      preview: preview({ email: "peu+teste1@fera.ag", phone: "+5511987727182" }),
      mine: { email: null, phone: "+5511999999999", email_verified: false, phone_verified: true },
    });
    expect(losing).toEqual(["+5511987727182"]);
    expect(remaining).toEqual(["+5511999999999", "peu+teste1@fera.ag"]);
  });

  it("ignora credencial não verificada da conta em sessão", () => {
    const { remaining } = computeMergeLogins({
      channel: "phone",
      identifier: "+5511987727182",
      preview: preview({ phone: "+5511987727182" }),
      mine: { email: "nao@verificado.com", phone: null, email_verified: false, phone_verified: false },
    });
    expect(remaining).toEqual(["+5511987727182"]);
  });
});
