import { describe, expect, it } from "vitest";
import { csvMoney, toCsv } from "./csv";

describe("toCsv", () => {
  it("separa por ponto e vírgula, escapa aspas e começa com BOM", () => {
    const out = toCsv([{ a: 'Ana "Bia"', b: 1 }, { a: null, b: "x;y" }]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out.slice(1).split("\r\n")).toEqual(['"a";"b"', '"Ana ""Bia""";"1"', '"";"x;y"']);
  });
  it("respeita a ordem de colunas pedida", () => {
    expect(toCsv([{ a: 1, b: 2 }], ["b", "a"]).slice(1).split("\r\n")[0]).toBe('"b";"a"');
  });
});

describe("csvMoney", () => {
  it("vírgula decimal, sem milhar", () => {
    expect(csvMoney(1234.5)).toBe("1234,50");
    expect(csvMoney(null)).toBe("");
  });
});
