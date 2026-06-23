import { describe, expect, it } from "vitest";
import type { CompanyMember } from "@/types/domain";
import {
  ASSIGNABLE_ROLES,
  canModifyMember,
  COMPANY_ROLE_HINT,
  COMPANY_ROLE_LABEL,
  isLastOwner,
  ownerCount,
} from "./team.logic";

function member(profile_id: string, role: CompanyMember["role"]): CompanyMember {
  return { profile_id, full_name: profile_id, email: `${profile_id}@x.com`, role, created_at: "2026-06-01T00:00:00Z" };
}

const team = [member("ana", "owner"), member("bob", "operator"), member("cris", "owner")];

describe("team.logic", () => {
  it("ownerCount conta só donos", () => {
    expect(ownerCount(team)).toBe(2);
    expect(ownerCount([member("ana", "operator")])).toBe(0);
  });

  it("isLastOwner: dono único → true; com 2 donos → false; operacional → false", () => {
    expect(isLastOwner([member("ana", "owner")], "ana")).toBe(true);
    expect(isLastOwner(team, "ana")).toBe(false);
    expect(isLastOwner(team, "bob")).toBe(false);
  });

  it("canModifyMember é o inverso de isLastOwner", () => {
    expect(canModifyMember([member("ana", "owner")], "ana")).toBe(false);
    expect(canModifyMember(team, "ana")).toBe(true);
    expect(canModifyMember(team, "bob")).toBe(true);
  });

  it("rótulos em pt-BR dos 4 papéis fixos", () => {
    expect(COMPANY_ROLE_LABEL.owner).toBe("Dono");
    expect(COMPANY_ROLE_LABEL.manager).toBe("Gerente");
    expect(COMPANY_ROLE_LABEL.operator).toBe("Operação");
    expect(COMPANY_ROLE_LABEL.finance).toBe("Financeiro");
  });

  it("ASSIGNABLE_ROLES tem os 4 presets e cada um tem rótulo + dica", () => {
    expect(ASSIGNABLE_ROLES).toEqual(["owner", "manager", "operator", "finance"]);
    for (const r of ASSIGNABLE_ROLES) {
      expect(COMPANY_ROLE_LABEL[r]).toBeTruthy();
      expect(COMPANY_ROLE_HINT[r]).toBeTruthy();
    }
  });

  it("rebaixar o único dono pra qualquer não-owner é bloqueado (guarda multi-papel)", () => {
    // isLastOwner não depende do papel-alvo: o único dono nunca é modificável.
    expect(isLastOwner([member("ana", "owner")], "ana")).toBe(true);
  });
});
