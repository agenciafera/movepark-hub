import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FALLBACK_ICON, getAmenityIcon } from "./AmenityList.logic";

/**
 * Contrato: todo nome de ícone do catálogo `amenity` resolve para um desenho de verdade.
 *
 * Existe por causa de um caso real. `amenity.icon` guarda nome do **lucide**, e a leitura
 * traduz para o Phosphor por `src/lib/icon-aliases.ts`. Nome sem tradução não quebra nada:
 * cai calado no `Sparkle`. Quatro comodidades (`lounge`, `wifi`, `car_wash` e
 * `flight_insurance`) passaram meses exibindo o brilho genérico na página da unidade, e
 * nenhum teste reclamou porque nenhum teste olhava o par nome/componente. Aqui o par é a
 * asserção: o defeito é silencioso, então quem tem que gritar é o teste.
 *
 * A lista de nomes sai do SQL versionado, não de um array escrito à mão aqui, para o teste
 * cobrir comodidade nova sem ninguém lembrar de vir editá-lo. São duas fontes porque a
 * linha pode entrar pelas duas: `supabase/seed.sql` (espelho do catálogo vivo) e as
 * migrations que inserem no catálogo.
 */

const raiz = resolve(__dirname, "../../..");

/**
 * Captura a coluna `icon` de qualquer INSERT em `public.amenity`, que em todos eles vem na
 * ordem `(code, name, description, icon, category, sort_order)`. Aspas simples dobradas
 * dentro do texto são toleradas (`''`), que é como o Postgres escapa apóstrofo.
 */
const TUPLA_AMENITY =
  /\(\s*'([a-z0-9_]+)'\s*,\s*'(?:[^']|'')*'\s*,\s*'(?:[^']|'')*'\s*,\s*'([A-Za-z0-9]+)'\s*,\s*'(security|service|access|extras)'/g;

function iconesDeclarados(): { code: string; icon: string }[] {
  const arquivos = [
    readFileSync(resolve(raiz, "supabase/seed.sql"), "utf8"),
    ...readdirSync(resolve(raiz, "supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(resolve(raiz, "supabase/migrations", f), "utf8")),
  ];

  const porCodigo = new Map<string, string>();
  for (const sql of arquivos) {
    if (!/public\.amenity|"public"\."amenity"/.test(sql)) continue;
    for (const [, code, icon] of sql.matchAll(TUPLA_AMENITY)) {
      porCodigo.set(code, icon);
    }
  }
  return [...porCodigo].map(([code, icon]) => ({ code, icon }));
}

const DECLARADOS = iconesDeclarados();

describe("ícones das comodidades", () => {
  // Se a extração parar de achar linha (mudou a ordem das colunas, mudou o formato do
  // INSERT), o teste abaixo passaria vazio e diria "tudo certo" sobre nada.
  it("acha o catálogo no SQL versionado", () => {
    expect(DECLARADOS.length).toBeGreaterThanOrEqual(19);
  });

  it.each(DECLARADOS)("$code não cai no ícone genérico (icon: $icon)", ({ icon }) => {
    expect(getAmenityIcon(icon)).not.toBe(FALLBACK_ICON);
  });

  it("comodidade sem ícone declarado usa o genérico", () => {
    expect(getAmenityIcon(null)).toBe(FALLBACK_ICON);
  });

  it("nome que não existe em lugar nenhum usa o genérico, sem quebrar a página", () => {
    expect(getAmenityIcon("IconeQueNaoExiste")).toBe(FALLBACK_ICON);
  });
});
