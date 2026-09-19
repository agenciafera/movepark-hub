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

          {/* Halo atrás da arte. A saia da van é navy #29263F, a mesma cor do hero, então
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
            className="relative mx-auto w-full"
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

      {/* Produto a produto, em timeline vertical: a linha amarra os quatro como uma
          sequência da casa, e o marcador na cor da marca dá o ritmo da leitura. Antes eram
          quatro cartões soltos, que empilhavam sem dizer que fazem parte de um conjunto. */}
      <section className="bg-canvas">
        <div className="mx-auto max-w-[1080px] px-4 py-16 desktop:px-8 desktop:py-24">
          <h2 className="text-balance text-display-2xl text-ink">Produto a produto</h2>

          <ol className="relative mt-10 border-l border-hairline pl-7 desktop:mt-12 desktop:pl-12">
            {MARCAS.map((m) => (
              <li key={m.id} id={m.id} className="relative scroll-mt-24 pb-12 last:pb-0">
                {/* O marcador monta em cima da linha, com anel da cor do fundo para a
                    linha não atravessar o círculo. */}
                <span
                  className="absolute top-1.5 h-3.5 w-3.5 rounded-full ring-4 ring-canvas"
                  style={{ backgroundColor: m.cor, left: "calc(-1.75rem - 7px)" }}
                  aria-hidden
                />
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                    {/* O logo É o heading do item. Escrever o nome de novo embaixo dele
                        repete a informação na tela e no leitor de tela, que já ouve o nome
                        pelo alt da imagem. O nível 3 mantém a hierarquia da seção. */}
                    <h3 className="flex items-center">
                      <MarcaLogo id={m.id} className="h-7 desktop:h-8" />
                    </h3>
                    <SeloEstagio marca={m} />
                  </div>
                  <div className="flex flex-col gap-3">
                    {m.paragrafos.map((t) => (
                      <p key={t.slice(0, 24)} className="max-w-[68ch] text-pretty text-body-md text-body">
                        {t}
                      </p>
                    ))}
                    {m.url && (
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex w-fit items-center gap-1 text-body-sm font-semibold text-mp-primary underline underline-offset-4"
                      >
                        {m.url.replace("https://", "")}
                        <ArrowUpRight className="h-4 w-4" aria-hidden />
                      </a>
                    )}
                  </div>
                </div>
              </li>
            ))}
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
