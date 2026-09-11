import { DownloadSimple } from "@phosphor-icons/react";
import { BotaoCopiar } from "./BotaoCopiar";
import {
  ALTURA_DO_SIMBOLO,
  CORPO,
  ESPECIFICACAO,
  montarUrl,
  RAIO,
  RESPIRO,
  textoDoSelo,
  type FraseId,
  type Fundo,
} from "./selo.logic";

/**
 * O caminho do Wix e do Google Sites, que não podem receber o snippet.
 *
 * Nesses editores o bloco de incorporar HTML vira um iframe, e link dentro de iframe
 * pertence ao documento do iframe: o selo apareceria e não transferiria autoridade
 * nenhuma. Então aqui o parceiro monta o mesmo desenho com os elementos nativos do
 * editor, e os números vêm de `ESPECIFICACAO`, a mesma fonte que o CSS do snippet usa.
 */

/** O símbolo pronto para subir no editor. Os dois PNGs já existem para os e-mails. */
const SIMBOLO: Record<Fundo, string> = {
  claro: "/brand/simbolo-movepark-email.png",
  escuro: "/brand/simbolo-movepark-white-email.png",
};

function Passo({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-surface-strong text-body-sm font-semibold text-ink">
        {n}
      </span>
      <span className="text-pretty text-body-md text-body">{children}</span>
    </li>
  );
}

export function PassoAPassoWix({ frase, fundo }: { frase: FraseId; fundo: Fundo }) {
  const spec = ESPECIFICACAO[fundo];
  const texto = textoDoSelo(frase);
  const url = montarUrl();
  const imagem = `/selo/selo-movepark-${frase}-${fundo}.png`;

  const ficha = [
    ["Preenchimento da caixa", spec.fundoLegivel],
    ["Borda", `1px, ${spec.bordaLegivel}`],
    ["Cantos arredondados", `${RAIO}px`],
    [
      "Espaço interno",
      `${RESPIRO.vertical}px em cima e embaixo, ${RESPIRO.horizontal}px nas laterais`,
    ],
    ["Tamanho do texto", `${CORPO}px`],
    ["Cor do texto", spec.texto],
    ["Peso", "a palavra Movepark em negrito, o resto normal"],
    ["Altura do símbolo", `${ALTURA_DO_SIMBOLO}px`],
  ];

  return (
    <section className="flex flex-col gap-6 rounded-sm border border-hairline p-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-balance text-display-sm text-ink">No Wix, o selo se monta no editor</h2>
        <p className="max-w-[68ch] text-pretty text-body-md text-body">
          Não use o bloco de incorporar HTML do Wix. Ele coloca o código dentro de uma moldura
          isolada, e o link deixa de contar para a Movepark. O desenho do selo você reproduz com os
          próprios elementos do editor, com estes valores. O Google Sites segue a mesma lógica.
        </p>
      </div>

      {/* Os dois valores que os dois caminhos pedem, no topo, para não caçar no meio dos passos. */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 rounded-sm bg-surface-soft px-3 py-2">
          <span className="min-w-0 truncate text-body-sm text-body">
            <span className="text-muted">Texto: </span>
            {texto}
          </span>
          <BotaoCopiar valor={texto} rotulo="Copiar texto" variant="ghost" />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-sm bg-surface-soft px-3 py-2">
          <span className="min-w-0 truncate text-body-sm text-body">
            <span className="text-muted">Link: </span>
            {url}
          </span>
          <BotaoCopiar valor={url} rotulo="Copiar link" variant="ghost" />
        </div>
      </div>

      <div className="grid gap-8 tablet:grid-cols-2">
        <div className="flex flex-col gap-4">
          <h3 className="text-title-md text-ink">Caixa e texto do Wix</h3>
          <p className="text-pretty text-body-sm text-muted">
            É o caminho recomendado. O texto do link fica sendo texto de verdade, que é o que mais
            conta.
          </p>
          <ol className="flex flex-col gap-3">
            <Passo n={1}>
              No Editor, clique no rodapé e depois em <b>Adicionar Elementos</b>. Em <b>Caixa</b>{" "}
              (ou Container), arraste uma caixa para dentro do rodapé.
            </Passo>
            <Passo n={2}>
              Com a caixa selecionada, abra <b>Design</b> e aplique: preenchimento{" "}
              {spec.fundoLegivel}, borda de 1px em {spec.bordaLegivel}, cantos de {RAIO}px.
            </Passo>
            <Passo n={3}>
              <b>Adicionar Elementos</b>, <b>Texto</b>, e arraste um parágrafo para dentro da caixa.
              Escreva {texto}, com a palavra Movepark em negrito, tamanho {CORPO} e cor {spec.texto}
              .
            </Passo>
            <Passo n={4}>
              Selecione a frase inteira, clique no ícone de link, escolha <b>Endereço da Web</b> e
              cole o link. Marque para abrir em nova aba.
            </Passo>
            <Passo n={5}>
              Ainda no painel do link, confira que a opção <b>nofollow</b> está desligada. Com ela
              ligada, o link não vale nada para a Movepark.
            </Passo>
            <Passo n={6}>
              Opcional: suba o símbolo pelo <b>Adicionar Elementos</b>, <b>Imagem</b>, e coloque à
              esquerda do texto com {ALTURA_DO_SIMBOLO}px de altura.
            </Passo>
          </ol>
          <a
            href={SIMBOLO[fundo]}
            download
            className="inline-flex w-fit items-center gap-2 text-body-sm text-mp-primary underline underline-offset-4"
          >
            <DownloadSimple />
            Baixar o símbolo em PNG
          </a>
        </div>

        <div className="flex flex-col gap-4">
          <h3 className="text-title-md text-ink">Ou suba o selo como imagem</h3>
          <p className="text-pretty text-body-sm text-muted">
            Mais rápido, e o desenho sai idêntico. Em compensação, quem faz o papel do texto do link
            passa a ser o texto alternativo da imagem, que conta menos que texto de verdade.
          </p>
          <div
            className={`flex items-center justify-center rounded-sm border border-hairline p-6 ${
              fundo === "escuro" ? "bg-mp-navy" : "bg-white"
            }`}
          >
            <img src={imagem} alt={texto} className="h-[29px] w-auto" />
          </div>
          <ol className="flex flex-col gap-3">
            <Passo n={1}>Baixe a imagem abaixo.</Passo>
            <Passo n={2}>
              No Editor, <b>Adicionar Elementos</b>, <b>Imagem</b>, <b>Enviar mídia</b>, e suba o
              arquivo no rodapé.
            </Passo>
            <Passo n={3}>
              Clique na imagem, abra o ícone de link, escolha <b>Endereço da Web</b> e cole o link.
              Deixe o nofollow desligado.
            </Passo>
            <Passo n={4}>
              Nas configurações da imagem, preencha o <b>texto alternativo</b> exatamente com{" "}
              {texto}.
            </Passo>
          </ol>
          <a
            href={imagem}
            download
            className="inline-flex w-fit items-center gap-2 text-body-sm text-mp-primary underline underline-offset-4"
          >
            <DownloadSimple />
            Baixar o selo em PNG
          </a>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-title-md text-ink">Os valores do desenho</h3>
        <dl className="grid gap-x-8 gap-y-2 tablet:grid-cols-2">
          {ficha.map(([rotulo, valor]) => (
            <div key={rotulo} className="flex justify-between gap-4 border-b border-hairline py-2">
              <dt className="text-body-sm text-muted">{rotulo}</dt>
              <dd className="text-right text-body-sm text-ink">{valor}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-b border-hairline py-2">
            <dt className="text-body-sm text-muted">Link</dt>
            <dd className="truncate text-right text-body-sm text-ink">{url}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
