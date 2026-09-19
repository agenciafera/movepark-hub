import { Helmet } from "react-helmet-async";
import { ArrowUpRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { CtaBanner } from "@/components/shared/CtaBanner";
import { MarcaLogo } from "@/features/grupo/MarcaLogo";
import { Organograma } from "@/features/grupo/Organograma";
import { MARCAS, ESTAGIO_ROTULO } from "@/features/grupo/marcas";
import { breadcrumbSchema, organizationSchema } from "@/lib/jsonld";
import { siteUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

const TITULO = "O grupo Movepark";
const META =
  "As quatro marcas da Movepark: o Hub de reserva de vaga, a Go2Park de rastreio da van, a Go2Med e o Coopark. O que cada uma faz, em que estágio está e quem responde por ela.";
const LEAD =
  "São quatro produtos em torno da mesma ideia: vaga e van com hora marcada, preço combinado antes e acompanhamento até o fim.";

/**
 * A página do grupo.
 *
 * É a superfície onde o vínculo entre as quatro marcas passa a existir, para gente e
 * para máquina: a tela mostra logo, estágio e quem fatura, e o JSON-LD emite as quatro
 * em `brand` da mesma entidade. Até ela existir, a Go2Park só aparecia no site como selo
 * de três unidades, e nenhum dado estruturado dizia o nome dela.
 *
 * Faixa de **hero de marketing**, e não página de conteúdo: é vitrine de marca, como a
 * `/sobre` e a `/seja-parceiro`. A decisão está registrada na skill `harmonizar-paginas`,
 * que exige justificativa para mudar uma página de faixa.
 *
 * A trava que governa a copy daqui está em docs/specs/grupo-movepark.md §3: a página fala
 * em produtos da mesma casa, e nada nela pode afirmar sociedade enquanto a Go2Park
 * faturar pelo CNPJ da Agência Fera.
 */
export default function GrupoPage() {
  const { "@context": _orgCtx, ...orgEntidade } = organizationSchema();
  const aboutSchema = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: TITULO,
    description: META,
    url: siteUrl("/grupo"),
    mainEntity: orgEntidade,
  };

  return (
    <>
      <Helmet>
        <title>{`${TITULO} | Movepark`}</title>
        <meta name="description" content={META} />
        <meta property="og:title" content={TITULO} />
        <meta property="og:description" content={META} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={siteUrl("/grupo")} />
        <link rel="canonical" href={siteUrl("/grupo")} />
        <script type="application/ld+json">{JSON.stringify(aboutSchema)}</script>
        <script type="application/ld+json">
          {JSON.stringify(
            breadcrumbSchema([
              { name: "Início", url: siteUrl("/") },
              { name: "O grupo", url: siteUrl("/grupo") },
            ]),
          )}
        </script>
      </Helmet>

      {/* Hero: a ilustração entra recortada (alfa de verdade), então ela flutua sobre o
          navy em vez de trazer um retângulo branco junto. */}
      {/* Para a van passar POR CIMA da seção clara, duas coisas precisam ser verdade, e a
          segunda já esteve errada: (1) o hero não pode ter `overflow-hidden`, que cortaria
          a arte na borda do navy; (2) o hero precisa de z-index MAIOR que a seção seguinte.
          O `isolate` que estava aqui fazia justamente o contrário: criava um contexto de
          empilhamento e prendia o `z-10` da imagem dentro do hero, então a seção de baixo,
          que vem depois no DOM, pintava por cima e recortava a van na linha exata do navy.
          Só do desktop para cima: em 375px a arte ocupa a largura toda e descer só empurra
          o conteúdo para baixo, sem sobreposição nenhuma para render. */}
      <section className="relative z-10 bg-mp-navy">
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 py-16 desktop:grid-cols-[1.1fr_1fr] desktop:px-8 desktop:pb-10 desktop:pt-24">
          <div className="flex flex-col gap-5">
            <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-mp-violet-on-navy">
              O grupo
            </span>
            <h1 className="text-balance text-display-3xl text-white">
              Quatro produtos, a mesma ideia
            </h1>
            <p className="max-w-[52ch] text-pretty text-body-md text-white/80">
              {LEAD} Esta página diz o que é cada um, em que estágio está e quem responde
              por ele.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Button asChild>
                <a href="#marcas">Ver as marcas</a>
              </Button>
              <Button asChild variant="outlineInverse">
                <a href="#estrutura">Ver a estrutura</a>
              </Button>
            </div>
          </div>

          {/* A sombra é `drop-shadow`, não `box-shadow`: como o arquivo tem alfa de
              verdade, ela segue o contorno da van e do celular. `box-shadow` desenharia a
              sombra do retângulo da imagem, e apareceria um bloco escuro no meio do navy.
              Halo atrás da arte. A saia da van é navy #29263F, a mesma cor do hero, então
              sem ele a base do veículo e as rodas somem no fundo. É luz, não caixa: um
              brilho radial fraco que devolve o contorno sem recortar um retângulo. */}
          <div className="relative z-10 mx-auto w-full max-w-[420px] desktop:max-w-none desktop:-mb-28 desktop:translate-y-14">
            <div
              className="pointer-events-none absolute inset-[8%] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.14),rgba(255,255,255,0)_68%)] blur-xl"
              aria-hidden
            />
          <img
            src="/images/grupo-ecossistema.webp"
            alt="Ilustração isométrica de uma van elétrica de traslado ao lado de uma vaga demarcada e de um celular com o mapa da rota"
            width={918}
            height={827}
            className="relative mx-auto w-full [filter:drop-shadow(0_24px_28px_rgba(15,14,30,0.38))]"
            loading="eager"
            decoding="async"
          />
          </div>
        </div>
      </section>

      {/* Mural de marcas: o pedido central da página, os quatro logos juntos. */}
      <section id="marcas" className="relative z-0 scroll-mt-24 border-b border-hairline bg-canvas">
        <div className="mx-auto max-w-[1080px] px-4 py-16 desktop:px-8 desktop:pb-24 desktop:pt-32">
          <h2 className="text-balance text-display-2xl text-ink">As marcas da casa</h2>
          <ul className="mt-10 grid grid-cols-1 gap-x-8 gap-y-10 tablet:grid-cols-2 desktop:grid-cols-4">
            {MARCAS.map((m) => (
              <li key={m.id} className="flex flex-col items-start gap-3">
                <div className="flex h-8 items-center">
                  <MarcaLogo id={m.id} />
                </div>
                <p className="text-pretty text-body-sm text-body">{m.resumo}</p>
                <SeloEstagio marca={m} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Estrutura */}
      <section id="estrutura" className="scroll-mt-24 bg-surface-soft">
        <div className="mx-auto max-w-[1080px] px-4 py-16 desktop:px-8 desktop:py-24">
          <div className="flex flex-col gap-3">
            <h2 className="text-balance text-display-2xl text-ink">Como a casa se organiza?</h2>
            <p className="max-w-[68ch] text-pretty text-body-md text-body">
              A Movepark é a marca que reúne os quatro produtos. Cada um tem o próprio
              público e o próprio estágio.
            </p>
          </div>

          <div className="mt-12">
            <Organograma />
          </div>

        </div>
      </section>

      {/* Produto a produto, em timeline centralizada: a linha desce pelo meio e os itens
          alternam os lados. A linha amarra os quatro como uma sequência da casa; antes eram
          cartões soltos, que empilhavam sem dizer que fazem parte de um conjunto.

          No celular a linha volta para a esquerda e os itens empilham de um lado só. Meia
          tela para cada lado em 375px daria 160px de texto útil, onde "estacionamento"
          sozinho já quebra em duas linhas. */}
      <section className="bg-canvas">
        <div className="mx-auto max-w-[1080px] px-4 py-16 desktop:px-8 desktop:py-24">
          <h2 className="text-balance text-center text-display-2xl text-ink">
            Produto a produto
          </h2>

          <ol className="relative mx-auto mt-10 max-w-[920px] desktop:mt-14">
            <span
              className="absolute inset-y-0 left-[7px] w-px bg-hairline desktop:left-1/2"
              aria-hidden
            />
            {MARCAS.map((m, i) => {
              const aEsquerda = i % 2 === 0;
              return (
                <li
                  key={m.id}
                  id={m.id}
                  className={cn(
                    "relative scroll-mt-24 pb-12 pl-8 last:pb-0 desktop:w-1/2 desktop:pl-0",
                    aEsquerda ? "desktop:pr-12" : "desktop:ml-auto desktop:pl-12",
                  )}
                >
                  {/* O marcador monta em cima da linha: no celular ela passa pela esquerda
                      do item, no desktop pela borda que encosta no meio da tela. */}
                  <span
                    className={cn(
                      "absolute top-1.5 left-0 h-3.5 w-3.5 rounded-full ring-4 ring-canvas",
                      aEsquerda
                        ? "desktop:left-auto desktop:-right-[7px]"
                        : "desktop:-left-[7px]",
                    )}
                    style={{ backgroundColor: m.cor }}
                    aria-hidden
                  />
                  <div className="flex flex-col gap-4">
                    <div
                      className={cn(
                        "flex flex-wrap items-center gap-x-4 gap-y-2",
                        aEsquerda && "desktop:justify-end",
                      )}
                    >
                      {/* O logo É o heading do item. Escrever o nome de novo embaixo dele
                          repete a informação na tela e no leitor de tela, que já ouve o
                          nome pelo alt da imagem. O nível 3 mantém a hierarquia. */}
                      <h3 className="flex items-center">
                        <MarcaLogo id={m.id} className="h-7 desktop:h-8" />
                      </h3>
                      <SeloEstagio marca={m} />
                    </div>
                    {m.desde && (
                      <p
                        className={cn(
                          "-mt-2 text-caption font-semibold uppercase tracking-[0.4px] text-muted",
                          aEsquerda && "desktop:text-right",
                        )}
                      >
                        Desde {m.desde}
                      </p>
                    )}
                    <div className="flex flex-col gap-3">
                      {m.paragrafos.map((t) => (
                        <p key={t.slice(0, 24)} className="text-pretty text-body-md text-body">
                          {t}
                        </p>
                      ))}
                      {m.url && (
                        <a
                          href={m.url}
                          target="_blank"
                          rel="noopener"
                          className={cn(
                            "inline-flex w-fit items-center gap-1 text-body-sm font-semibold text-mp-primary underline underline-offset-4",
                            aEsquerda && "desktop:ml-auto",
                          )}
                        >
                          {m.url.replace("https://", "")}
                          <ArrowUpRight className="h-4 w-4" aria-hidden />
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* Desambiguação */}
      <section className="border-t border-hairline bg-surface-soft">
        <div className="mx-auto max-w-[1080px] px-4 py-16 desktop:px-8 desktop:py-24">
          <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-mp-indigo">
            Pra não confundir
          </span>
          <h2 className="mt-3 text-balance text-display-2xl text-ink">
            Quem é a Movepark, e quem não é?
          </h2>
          <div className="mt-8 grid gap-6 tablet:grid-cols-2">
            <p className="text-pretty text-body-md text-body">
              A Movepark não opera pátio próprio. Quem guarda o carro é o estacionamento
              parceiro, com nome, endereço e avaliação na página de cada unidade.
            </p>
            <p className="text-pretty text-body-md text-body">
              Existem empresas e estacionamentos com nome parecido, sem nenhuma relação com
              esta casa. O CNPJ acima é o que identifica a Movepark, e o site oficial é{" "}
              <Link to="/" className="text-mp-primary underline underline-offset-4">
                movepark.co
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <CtaBanner largura="conteudo" />
    </>
  );
}

/** Selo de estágio. Produto sem estágio declarado vira promessa (ver `marcas.ts`). */
function SeloEstagio({ marca }: { marca: (typeof MARCAS)[number] }) {
  const noAr = marca.estagio === "no-ar";
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span
        className="rounded-full px-2.5 py-0.5 text-caption font-bold"
        style={{
          color: noAr ? "#0F7A3D" : "#5A5A5A",
          backgroundColor: noAr ? "#E6F6EC" : "#EFEFF1",
        }}
      >
        {ESTAGIO_ROTULO[marca.estagio]}
      </span>
      <span className="text-caption text-muted">{marca.estagioDetalhe}</span>
    </span>
  );
}
