import { Helmet } from "react-helmet-async";
import { ArrowUpRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { CtaBanner } from "@/components/shared/CtaBanner";
import { MarcaLogo } from "@/features/grupo/MarcaLogo";
import { Organograma } from "@/features/grupo/Organograma";
import { MARCAS, ESTAGIO_ROTULO, RESPONSAVEIS } from "@/features/grupo/marcas";
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
      <section className="relative isolate overflow-hidden bg-mp-navy">
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 py-16 desktop:grid-cols-[1.1fr_1fr] desktop:px-8 desktop:py-24">
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
          <div className="relative mx-auto w-full max-w-[420px] desktop:max-w-none">
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
      <section id="marcas" className="scroll-mt-24 border-b border-hairline bg-canvas">
        <div className="mx-auto max-w-[1080px] px-4 py-16 desktop:px-8 desktop:py-24">
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
              público e o próprio estágio, e a linha de baixo mostra quem responde pela
              cobrança de cada um hoje.
            </p>
          </div>

          <div className="mt-12">
            <Organograma />
          </div>

          <dl className="mt-12 grid gap-4 tablet:grid-cols-2">
            {RESPONSAVEIS.map((r) => (
              <div
                key={r.razao}
                className="flex flex-col gap-1 rounded-md border border-hairline bg-canvas p-5"
              >
                <dt className="text-title-md text-ink">{r.razao}</dt>
                <dd className="text-body-sm text-body">
                  {r.cnpj ? `CNPJ ${r.cnpj}. ` : ""}
                  Responde por: {r.porQuais}.
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Um bloco por produto */}
      <section className="bg-canvas">
        <div className="mx-auto flex max-w-[1080px] flex-col gap-6 px-4 py-16 desktop:px-8 desktop:py-24">
          <h2 className="text-balance text-display-2xl text-ink">Produto a produto</h2>
          {MARCAS.map((m) => (
            <article
              key={m.id}
              id={m.id}
              className="scroll-mt-24 overflow-hidden rounded-md border border-hairline bg-canvas"
            >
              <div className="h-1 w-full" style={{ backgroundColor: m.cor }} aria-hidden />
              <div className="grid gap-6 p-6 desktop:grid-cols-[260px_1fr] desktop:p-8">
                <div className="flex flex-col items-start gap-4">
                  <MarcaLogo id={m.id} className="h-8 desktop:h-9" />
                  <SeloEstagio marca={m} />
                  {m.url && (
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1 text-body-sm font-semibold text-mp-primary underline underline-offset-4"
                    >
                      {m.url.replace("https://", "")}
                      <ArrowUpRight className="h-4 w-4" aria-hidden />
                    </a>
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  <h3 className="text-title-md text-ink">{m.nome}</h3>
                  {m.paragrafos.map((p) => (
                    <p key={p.slice(0, 24)} className="text-pretty text-body-md text-body">
                      {p}
                    </p>
                  ))}
                </div>
              </div>
            </article>
          ))}
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
