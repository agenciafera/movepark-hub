import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CLARITY_PROJECT_ID, initClarity, shouldLoadClarity } from "./clarity";
import { DEFAULT_SITE_URL } from "./site-host.mjs";

/**
 * O Clarity é um script de terceiro que só existe em runtime: nenhuma tela quebra se ele
 * sumir, e o dado só falta semanas depois, quando alguém for olhar o mapa de calor. Estes
 * casos seguram as três coisas que dão errado em silêncio: o gate de host (dashboard
 * poluído com sessão de dev), a chamada no `AppProviders` (fácil de apagar numa refatoração)
 * e a CSP (promover a política a enforce sem a allowlist mata a tag em produção).
 */
const HOST_CANONICO = new URL(DEFAULT_SITE_URL).hostname;

/** Troca a URL do documento no happy-dom, que é o que o gate lê. */
function navegarPara(url: string) {
  (window as unknown as { happyDOM: { setURL: (u: string) => void } }).happyDOM.setURL(url);
}

/**
 * O happy-dom não baixa script externo (bom: teste não vai à rede) e, no default, ainda
 * despeja a DOMException no stderr de cada caso. O que interessa aqui é a tag entrar no
 * DOM, não o conteúdo dela baixar, então tratamos o bloqueio como sucesso e a saída da
 * suíte fica limpa.
 */
const settings = (
  window as unknown as {
    happyDOM: { settings: { handleDisabledFileLoadingAsSuccess: boolean } };
  }
).happyDOM.settings;
const tratamentoOriginal = settings.handleDisabledFileLoadingAsSuccess;

beforeAll(() => {
  settings.handleDisabledFileLoadingAsSuccess = true;
});

afterAll(() => {
  settings.handleDisabledFileLoadingAsSuccess = tratamentoOriginal;
});

/**
 * O pacote insere a tag ANTES do primeiro `<script>` do documento, e desiste calado quando
 * não existe nenhum. No app isso nunca acontece (o `index.html` já abre com o GTM e fecha
 * com o módulo do Vite), mas o documento em branco do happy-dom não tem script nenhum, e
 * sem esta âncora o teste mediria a ausência do DOM em vez do comportamento do gate.
 */
beforeEach(() => {
  document.head.appendChild(document.createElement("script"));
});

afterEach(() => {
  document.head.innerHTML = "";
  navegarPara("http://localhost:3000/");
});

describe("gate de host", () => {
  it("grava no host canônico", () => {
    expect(shouldLoadClarity(HOST_CANONICO)).toBe(true);
  });

  it("não grava em dev, preview ou host de plataforma", () => {
    expect(shouldLoadClarity("localhost")).toBe(false);
    expect(shouldLoadClarity("hub.movepark.co")).toBe(false);
    expect(shouldLoadClarity("movepark-hub.pages.dev")).toBe(false);
    expect(shouldLoadClarity("movepark-hub.workers.dev")).toBe(false);
    expect(shouldLoadClarity(undefined)).toBe(false);
  });
});

describe("injeção da tag", () => {
  it("injeta o script do projeto quando o host é o canônico", () => {
    navegarPara(`https://${HOST_CANONICO}/destinos/aeroporto-de-confins`);

    expect(initClarity()).toBe(true);

    const tag = document.getElementById("clarity-script") as HTMLScriptElement | null;
    expect(tag).not.toBeNull();
    expect(tag!.src).toContain(`https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`);
    expect(tag!.async).toBe(true);
  });

  it("não injeta nada fora do host canônico", () => {
    navegarPara("http://localhost:5173/");

    expect(initClarity()).toBe(false);
    expect(document.getElementById("clarity-script")).toBeNull();
  });

  it("não duplica a tag quando roda duas vezes", () => {
    navegarPara(`https://${HOST_CANONICO}/`);

    initClarity();
    initClarity();

    expect(document.querySelectorAll("#clarity-script")).toHaveLength(1);
  });
});

describe("wiring no app", () => {
  it("o AppProviders inicializa o Clarity", () => {
    const fonte = readFileSync(
      join(process.cwd(), "src", "components", "shared", "AppProviders.tsx"),
      "utf8",
    );

    expect(fonte).toContain('from "@/lib/clarity"');
    expect(fonte).toContain("initClarity()");
  });
});

describe("CSP libera o Clarity", () => {
  const headers = readFileSync(join(process.cwd(), "public", "_headers"), "utf8");
  const csp = headers
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^Content-Security-Policy(-Report-Only)?:/.test(line))!;

  function directive(name: string): string[] {
    const found = csp
      .slice(csp.indexOf(":") + 1)
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith(`${name} `));

    return found ? found.split(/\s+/).slice(1) : [];
  }

  it("permite a tag em script-src", () => {
    expect(directive("script-src")).toContain("https://www.clarity.ms");
  });

  // O coletor responde num subdomínio de região (z.clarity.ms e afins), então o curinga
  // não é preguiça: a origem exata muda de sessão para sessão.
  it("permite o coletor em connect-src", () => {
    const connect = directive("connect-src");

    expect(connect).toContain("https://*.clarity.ms");
    expect(connect).toContain("https://c.bing.com");
  });
});
