/**
 * CSV que o Excel em português abre certo: separador `;` (a vírgula é o decimal aqui), BOM UTF-8
 * para os acentos e aspas em todo campo. Valor em reais sai com vírgula decimal.
 */
export function toCsv(rows: Record<string, string | number | null | undefined>[], headers?: string[]): string {
  const cols = headers ?? (rows[0] ? Object.keys(rows[0]) : []);
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  return "﻿" + [cols.map(cell).join(";"), ...rows.map((r) => cols.map((c) => cell(r[c])).join(";"))].join("\r\n");
}

/** 1234.5 → "1234,50" (sem separador de milhar, para a planilha ler como número). */
export function csvMoney(v: number | null | undefined): string {
  return v === null || v === undefined ? "" : v.toFixed(2).replace(".", ",");
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
