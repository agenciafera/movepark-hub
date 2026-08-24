import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * O bundle do design system não pode divergir dos tokens que o app realmente renderiza.
 *
 * `docs/design-system/project/` é o mesmo diretório que a skill `movepark-design` serve
 * (`.claude/skills/movepark-design` é symlink pra ele) e é o que sobe pro projeto do
 * claude.ai/design. Quem gera tela nova lê de lá, não do `src/index.css`. Então bundle
 * defasado não quebra build nenhum: ele só faz o próximo layout nascer com a cor errada,
 * e ninguém descobre até a tela estar pronta.
 *
 * Já aconteceu duas vezes. Na primeira, o app migrou pra Inter com CTA violeta e o bundle
 * ficou meses em Roboto com CTA vermelho. Na segunda, mais silenciosa, dois tokens levaram
 * correção de contraste no app e não atravessaram: `--muted-steel` foi de #818FAF pra
 * #5D6D8E (3.26:1 reprovava AA no eyebrow de 11px) e `--warning` foi de #B96A00 pra
 * #8F5100 (4.18:1 sobre canvas). O bundle seguiu ensinando os valores que reprovam.
 *
 * ## Por que a comparação é perceptual, e não hex idêntico
 *
 * Os dois lados guardam a mesma cor em notações diferentes: o app em tripla HSL (o formato
 * que o Tailwind consome via `hsl(var(--token))`) e o bundle em hex. As triplas do
 * `index.css` foram arredondadas pra inteiro quando nasceram, então a volta pra hex quase
 * nunca fecha no mesmo byte: #29263F vira 248 26% 20% e volta como #292640.
 *
 * Exigir hex idêntico faria o guard acusar 12 divergências que ninguém enxerga e obrigaria
 * a reescrever um dos arquivos sem nenhum motivo visual. Guard que grita à toa é guard que
 * o time silencia. Então a comparação é a distância perceptual (ΔE CIE76), e o corte veio
 * de medir os pares reais, não de chute: o ruído de arredondamento vai no máximo a ΔE 2.90
 * (`--surface-strong`) e as duas divergências de verdade estavam em ΔE 13.51 e 16.33. O
 * teto de 3 passa o ruído inteiro e ainda deixa 4,5x de folga até a divergência mais
 * próxima.
 *
 * Ao trocar uma cor no `src/index.css`, mexa também no `colors_and_type.css` e empurre o
 * bundle pro claude.ai/design (ferramenta DesignSync). Ver docs/design-system/README.md.
 */

const RAIZ = process.cwd();
const CSS_APP = `${RAIZ}/src/index.css`;
const CSS_BUNDLE = `${RAIZ}/docs/design-system/project/colors_and_type.css`;
const TAILWIND = `${RAIZ}/tailwind.config.ts`;

/** Acima disso duas cores param de ser a mesma cor arredondada e viram decisão diferente. */
const TETO_DELTA_E = 3;

/**
 * Tokens do `:root` de um arquivo CSS.
 *
 * Lê só o primeiro bloco `:root`, porque o `index.css` tem um segundo conjunto sob `.dark`
 * e o bundle não tem tema escuro: comparar o claro de um com o escuro do outro acusaria
 * divergência em toda superfície.
 */
function tokensDoRoot(caminho: string): Map<string, string> {
  const css = readFileSync(caminho, "utf8");
  const inicio = css.indexOf(":root");
  const fim = css.indexOf("\n  }", inicio);
  const bloco = css.slice(inicio, fim === -1 ? undefined : fim);
  const mapa = new Map<string, string>();
  for (const [, nome, valor] of bloco.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+?)(?:;|\s*\/\*)/gim)) {
    mapa.set(nome, valor.trim());
  }
  return mapa;
}

/** Segue as cadeias de `var()` até o valor literal. */
function resolver(mapa: Map<string, string>, nome: string, saltos = 0): string | null {
  const valor = mapa.get(nome);
  if (!valor || saltos > 5) return null;
  const referencia = /^var\((--[a-z0-9-]+)\)$/.exec(valor);
  return referencia ? resolver(mapa, referencia[1], saltos + 1) : valor;
}

type Rgb = [number, number, number];

function hslParaRgb(valor: string): Rgb | null {
  const p = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/.exec(valor);
  if (!p) return null;
  const [h, s, l] = [Number(p[1]), Number(p[2]) / 100, Number(p[3]) / 100];
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const base: Rgb[] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [r, g, b] = base[Math.floor(h / 60) % 6];
  const m = l - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function hexParaRgb(valor: string): Rgb | null {
  const p = /^#([0-9a-f]{6})$/i.exec(valor.trim());
  if (!p) return null;
  const n = parseInt(p[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Aceita as duas notações, porque cada lado do contrato guarda a cor de um jeito. */
function paraRgb(valor: string | null): Rgb | null {
  if (!valor) return null;
  return hexParaRgb(valor) ?? hslParaRgb(valor);
}

function paraHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** CIE76. Basta pra separar arredondamento de decisão; não precisa do CIEDE2000 aqui. */
function deltaE(a: Rgb, b: Rgb): number {
  const lab = ([r, g, bl]: Rgb) => {
    const lin = [r, g, bl].map((v) => {
      const c = v / 255;
      return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
    });
    const [rr, gg, bb] = lin;
    const xyz = [
      (rr * 0.4124 + gg * 0.3576 + bb * 0.1805) / 0.95047,
      rr * 0.2126 + gg * 0.7152 + bb * 0.0722,
      (rr * 0.0193 + gg * 0.1192 + bb * 0.9505) / 1.08883,
    ];
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const [fx, fy, fz] = xyz.map(f);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  };
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** `[token do app, token do bundle]`. A ordem dos nomes difere porque o bundle prefixa `colors-`. */
const MAPA: ReadonlyArray<readonly [string, string]> = [
  ["--mp-navy", "--mp-navy"],
  ["--mp-indigo", "--mp-indigo"],
  ["--mp-violet", "--mp-violet"],
  ["--mp-pale", "--mp-pale"],
  ["--mp-red", "--mp-red"],
  ["--mp-red-deep", "--mp-red-deep"],
  ["--mp-teal", "--mp-teal"],
  ["--mp-primary", "--colors-primary"],
  ["--mp-primary-active", "--colors-primary-active"],
  ["--mp-primary-disabled", "--colors-primary-disabled"],
  ["--mp-indigo", "--colors-secondary"],
  ["--mp-violet", "--colors-secondary-soft"],
  ["--on-primary", "--colors-on-primary"],
  ["--canvas", "--colors-canvas"],
  ["--surface-soft", "--colors-surface-soft"],
  ["--surface-strong", "--colors-surface-strong"],
  ["--panel", "--colors-panel"],
  ["--surface-pale", "--colors-surface-pale"],
  ["--mp-navy", "--colors-surface-inverse"],
  ["--hairline", "--colors-hairline"],
  ["--hairline-soft", "--colors-hairline-soft"],
  ["--border-strong", "--colors-border-strong"],
  ["--mp-navy", "--colors-border-focus"],
  ["--ink", "--colors-ink"],
  ["--body", "--colors-body"],
  ["--muted", "--colors-muted"],
  ["--muted-soft", "--colors-muted-soft"],
  ["--muted-steel", "--colors-muted-steel"],
  ["--mp-navy", "--colors-star-rating"],
  ["--error", "--colors-error"],
  ["--success", "--colors-success"],
  ["--warning", "--colors-warning"],
  ["--info", "--colors-info"],
  ["--mp-indigo", "--colors-legal-link"],
];

/**
 * Tokens do bundle que o contrato não cobre, cada um com o motivo.
 *
 * Lista fechada de propósito: o teste de cobertura embaixo reprova qualquer token de cor
 * novo que não esteja aqui nem no MAPA, senão bastaria adicionar cor ao bundle pra ela
 * escapar do guard pra sempre.
 */
const ISENTOS: Readonly<Record<string, string>> = {
  "--colors-error-hover": "estado de hover que o app não declara como token; só o bundle usa",
  "--colors-scrim": "o app declara com alpha na tripla (`248 26% 20% / 0.55`) e o bundle em rgba(); o navy de base já entra pelo --mp-navy",
  "--mp-gradient-brand": "gradiente, não cor chapada",
  "--mp-gradient-soft": "gradiente, não cor chapada",
  "--mp-violet-on-navy": "só existe no app: violeta claro pra texto DENTRO da faixa navy, sem uso no bundle",
};

describe("tokens do design system", () => {
  const app = tokensDoRoot(CSS_APP);
  const bundle = tokensDoRoot(CSS_BUNDLE);

  it.each(MAPA)("%s do app e %s do bundle são a mesma cor", (nomeApp, nomeBundle) => {
    const corApp = paraRgb(resolver(app, nomeApp));
    const corBundle = paraRgb(resolver(bundle, nomeBundle));

    expect(corApp, `${nomeApp} não existe (ou não é cor) em src/index.css`).not.toBeNull();
    expect(corBundle, `${nomeBundle} não existe (ou não é cor) no bundle`).not.toBeNull();

    const distancia = deltaE(corApp!, corBundle!);
    expect(
      distancia,
      `${nomeApp} (${paraHex(corApp!)}) e ${nomeBundle} (${paraHex(corBundle!)}) estão a ΔE ${distancia.toFixed(2)}. ` +
        `Acima de ${TETO_DELTA_E} não é arredondamento: alguém mudou a cor de um lado só. ` +
        `Acerte o docs/design-system/project/colors_and_type.css e reenvie o bundle pro claude.ai/design.`,
    ).toBeLessThanOrEqual(TETO_DELTA_E);
  });

  it("cobre toda cor declarada no bundle", () => {
    const cobertos = new Set(MAPA.map(([, bundleToken]) => bundleToken));
    const descobertos = [...bundle.keys()].filter(
      (nome) =>
        (nome.startsWith("--colors-") || nome.startsWith("--mp-")) &&
        !cobertos.has(nome) &&
        !(nome in ISENTOS),
    );
    expect(
      descobertos,
      `token de cor novo no bundle sem par no app: ${descobertos.join(", ")}. ` +
        `Aponte pro token equivalente em MAPA, ou declare em ISENTOS com o motivo.`,
    ).toEqual([]);
  });

  /**
   * Os specimens repetem o hex na mão, no chip e no rótulo, porque cada card do painel do
   * Design System é um HTML solto que não importa o `colors_and_type.css`. Então corrigir o
   * token não conserta o card: quando `--colors-warning` foi de #B96A00 pra #8F5100 e
   * `--colors-muted-steel` de #818FAF pra #5D6D8E, os dois swatches continuaram exibindo o
   * valor antigo, que é justamente o que a pessoa olha ao escolher a cor.
   */
  it("nenhum swatch do preview mostra hex que não é mais token", () => {
    const declarados = new Set(
      [...bundle.keys()]
        .map((nome) => resolver(bundle, nome))
        .filter((valor): valor is string => !!valor && /^#[0-9a-f]{6}$/i.test(valor))
        .map((valor) => valor.toUpperCase()),
    );

    const orfaos: string[] = [];
    const dir = `${RAIZ}/docs/design-system/project/preview`;
    for (const arquivo of readdirSync(dir).filter((f) => f.endsWith(".html"))) {
      const html = readFileSync(`${dir}/${arquivo}`, "utf8");
      for (const [, hex] of html.matchAll(/<div class="hex">(#[0-9a-f]{6})<\/div>/gi)) {
        if (!declarados.has(hex.toUpperCase())) orfaos.push(`${arquivo}: ${hex}`);
      }
    }

    expect(
      orfaos,
      `swatch anunciando cor que não existe mais no colors_and_type.css: ${orfaos.join(", ")}`,
    ).toEqual([]);
  });

  it("a família tipográfica do bundle é a mesma do Tailwind", () => {
    const config = readFileSync(TAILWIND, "utf8");
    const bloco = /fontFamily:\s*\{\s*sans:\s*\[([^\]]+)\]/.exec(config);
    expect(bloco, "fontFamily.sans sumiu do tailwind.config.ts").not.toBeNull();

    const doTailwind = [...bloco![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const doBundle = (resolver(bundle, "--font-sans") ?? "")
      .split(",")
      .map((f) => f.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);

    expect(doBundle).toEqual(doTailwind);
  });

  it("a escala de raio do bundle é a mesma do Tailwind", () => {
    const config = readFileSync(TAILWIND, "utf8");
    const bloco = /borderRadius:\s*\{([^}]+)\}/.exec(config);
    expect(bloco, "borderRadius sumiu do tailwind.config.ts").not.toBeNull();

    for (const [, nome, valor] of bloco![1].matchAll(/(\w+):\s*"([^"]+)"/g)) {
      expect(resolver(bundle, `--radius-${nome}`), `--radius-${nome} divergiu do Tailwind`).toBe(
        valor,
      );
    }
  });
});
