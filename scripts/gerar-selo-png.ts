/**
 * Gera os PNGs do selo de parceiro em `public/selo/`.
 *
 * Por que existe: nem todo construtor de site aceita colar HTML. No Wix, quem quer o
 * desenho pronto sobe uma imagem e aplica o link nela. Sem este script, essa imagem
 * seria desenhada à mão e viraria a segunda verdade do selo, livre para divergir do
 * código na primeira vez que alguém mudasse uma cor.
 *
 * Ele renderiza o **mesmo** HTML de `gerarSnippet` num Chromium e fotografa o elemento,
 * então a imagem é o selo, e não uma imitação dele.
 *
 * Uso: `bun run gen:selo` (precisa do Chromium do Playwright: `bunx playwright install chromium`).
 *
 * Os arquivos saem em `public/`, que é superfície pública: nada de README ou nota ao lado
 * deles, senão a nota interna vira uma URL servida. A documentação mora na spec
 * (`docs/specs/selo-parceiro.md`) e aqui.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { FRASES, gerarSnippet, type Fundo } from "../src/features/selo/selo.logic";

/** 3x para o selo continuar nítido em tela retina depois de reescalado pelo editor. */
const ESCALA = 3;
const DESTINO = join(process.cwd(), "public", "selo");

async function main() {
  await mkdir(DESTINO, { recursive: true });

  const navegador = await chromium.launch();
  const pagina = await navegador.newPage({ deviceScaleFactor: ESCALA });
  const gerados: string[] = [];

  for (const frase of FRASES) {
    for (const fundo of ["claro", "escuro"] as Fundo[]) {
      const snippet = gerarSnippet({ frase: frase.id, estilo: "caixa", fundo });

      // `width:max-content` para o body encostar no selo: sem isso a foto sai com a
      // largura da viewport e o parceiro recebe uma imagem cheia de vazio transparente.
      await pagina.setContent(
        `<body style="margin:0;width:max-content;background:transparent">${snippet}</body>`,
      );

      const selo = pagina.locator("a").first();
      const arquivo = `selo-movepark-${frase.id}-${fundo}.png`;
      await selo.screenshot({ path: join(DESTINO, arquivo), omitBackground: true });
      gerados.push(arquivo);
    }
  }

  await navegador.close();

  console.log(`${gerados.length} selos gerados em public/selo/:`);
  for (const g of gerados) console.log(`  ${g}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
