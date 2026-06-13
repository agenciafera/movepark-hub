import { describe, expect, it } from "vitest";
import type { CompanyMember } from "@/types/domain";
import { canModifyMember, COMPANY_ROLE_LABEL, isLastOwner, ownerCount } from "./team.logic";

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

  it("rótulos em pt-BR", () => {
    expect(COMPANY_ROLE_LABEL.owner).toBe("Dono");
    expect(COMPANY_ROLE_LABEL.operator).toBe("Operacional");
  });
});
