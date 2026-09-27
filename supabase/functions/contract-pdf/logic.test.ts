import { assertEquals } from "jsr:@std/assert";
import {
  checkContractAccess,
  checkContractAuth,
  checkContractProof,
  contractPdfFilename,
  parseContractInput,
  wrapParagraph,
} from "./logic.ts";

const CO = "8d4c5a0e-2f6b-4d3a-9c1e-5b7f8a9d0c1e";

Deno.test("checkContractAuth: exige Bearer no header", () => {
  assertEquals(checkContractAuth(null), { status: 401, error: "Autenticação necessária" });
  assertEquals(checkContractAuth("Basic abc"), { status: 401, error: "Autenticação necessária" });
  assertEquals(checkContractAuth("Bearer jwt"), null);
});

Deno.test("parseContractInput: company_id obrigatório e uuid", () => {
  assertEquals(parseContractInput(null).error, "company_id é obrigatório");
  assertEquals(parseContractInput({ company_id: "  " }).error, "company_id é obrigatório");
  assertEquals(parseContractInput({ company_id: "abc" }).error, "company_id inválido");
  assertEquals(parseContractInput({ company_id: ` ${CO} ` }).input, { company_id: CO });
});

Deno.test("checkContractAccess: hub_admin ou membro da empresa; o resto é 403", () => {
  assertEquals(checkContractAccess({ role: "hub_admin", isMember: false }), null);
  assertEquals(checkContractAccess({ role: "company_operator", isMember: true }), null);
  assertEquals(checkContractAccess({ role: "company_operator", isMember: false }), {
    status: 403,
    error: "Sem acesso a esta empresa",
  });
  assertEquals(checkContractAccess({ role: null, isMember: false })?.status, 403);
});

const V1 = { version: "v1", sha256: "a".repeat(64), body: "CONTRATO" };

Deno.test("checkContractProof: empresa inexistente é 404", () => {
  assertEquals(checkContractProof(null, V1), { status: 404, error: "Empresa não encontrada" });
});

Deno.test("checkContractProof: sem aceite não há PDF (409)", () => {
  assertEquals(
    checkContractProof(
      { contract_accepted_at: null, contract_version: null, contract_sha256: null },
      V1,
    ),
    { status: 409, error: "Contrato ainda não foi aceito" },
  );
});

Deno.test("checkContractProof: versão aceita fora do catálogo é 409", () => {
  assertEquals(
    checkContractProof(
      { contract_accepted_at: "2026-09-27T12:00:00Z", contract_version: "v0", contract_sha256: "x" },
      null,
    ),
    { status: 409, error: "Versão aceita não existe mais no catálogo" },
  );
});

Deno.test("checkContractProof: hash que não bate (ou ausente) é 409", () => {
  const base = { contract_accepted_at: "2026-09-27T12:00:00Z", contract_version: "v1" };
  assertEquals(checkContractProof({ ...base, contract_sha256: "b".repeat(64) }, V1)?.status, 409);
  assertEquals(checkContractProof({ ...base, contract_sha256: null }, V1)?.status, 409);
});

Deno.test("checkContractProof: aceite com hash da versão libera", () => {
  assertEquals(
    checkContractProof(
      { contract_accepted_at: "2026-09-27T12:00:00Z", contract_version: "v1", contract_sha256: V1.sha256 },
      V1,
    ),
    null,
  );
});

Deno.test("contractPdfFilename: um arquivo por versão, sem espaço", () => {
  assertEquals(contractPdfFilename("v1"), "contrato-parceria-movepark-v1.pdf");
  assertEquals(contractPdfFilename("2026 09/B"), "contrato-parceria-movepark-2026-09-b.pdf");
});

Deno.test("wrapParagraph: quebra por palavra na largura medida", () => {
  const fits = (s: string) => s.length <= 12;
  assertEquals(wrapParagraph("a b c", fits), ["a b c"]);
  assertEquals(wrapParagraph("O Parceiro define preço de balcão", fits), [
    "O Parceiro",
    "define preço",
    "de balcão",
  ]);
});

Deno.test("wrapParagraph: palavra maior que a linha sai inteira, sem cortar", () => {
  const fits = (s: string) => s.length <= 5;
  assertEquals(wrapParagraph("ab supercalifragilistic cd", fits), [
    "ab",
    "supercalifragilistic",
    "cd",
  ]);
  assertEquals(wrapParagraph("   ", fits), []);
});
