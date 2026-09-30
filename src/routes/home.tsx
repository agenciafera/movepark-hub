import { Helmet } from "react-helmet-async";
import { organizationSchema, webSiteSchema } from "@/lib/jsonld";
import { LOCALES, OG_LOCALE, clusterHreflang, urlDaHome, type Locale } from "@/lib/i18n";
import { Hero } from "@/features/home/Hero";
import { DestinationsGallery } from "@/features/home/DestinationsGallery";
import { FeaturedParkingLots } from "@/features/home/FeaturedParkingLots";
import { HowItWorks } from "@/features/home/HowItWorks";
import { TrustBand } from "@/features/home/TrustBand";
import { CtaBanner } from "@/components/shared/CtaBanner";
import { SITE_URL } from "@/lib/site";

export default function HomePage() {
  /*
    O cluster de idioma da home.

    Sem ele o `hreflang` seria de mão única: `/en` e `/es` declarariam a portuguesa como
    alternativa e a portuguesa não declararia nenhuma das duas. O Google exige o ciclo
    fechado e descarta o grupo inteiro quando ele não fecha, então metade do par não é
    meio caminho, é zero. As três rotas existem por deploy, não por dado, então a lista
    é fixa e o `x-default` fica no português.
  */
  const hreflangs = clusterHreflang(
    LOCALES.map((l: Locale) => ({ locale: l, caminho: urlDaHome(SITE_URL, l) })),
  );

  return (
    <div>
      <Helmet>
        <title>Estacionamento de aeroporto pelo menor preço | Movepark</title>
        <meta
          name="description"
          content="Estacionamento de aeroporto perto do terminal, com o menor preço por diária comparado entre os parceiros. Compare e reserve pela Movepark."
        />
        <meta property="og:title" content="Estacionamento de aeroporto pelo menor preço | Movepark" />
        <meta
          property="og:description"
          content="Estacionamento de aeroporto perto do terminal, com o menor preço por diária comparado entre os parceiros. Compare e reserve pela Movepark."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={SITE_URL} />
        {/* A og:image vem do shell (área `marca`). Aqui ela apontava para
            /og/home.jpg, arquivo que nunca foi commitado: o card da home ia com
            404 no lugar da imagem. */}
        <link rel="canonical" href={SITE_URL} />
        {hreflangs.map((h) => (
          <link key={h.hreflang} rel="alternate" hrefLang={h.hreflang} href={h.href} />
        ))}
        <meta property="og:locale" content={OG_LOCALE["pt-BR"]} />
        {/* A entidade Movepark: âncora do knowledge panel e da desambiguação de
            marca nos LLMs, no dado estruturado da porta de entrada do site. */}
        <script type="application/ld+json">{JSON.stringify(organizationSchema())}</script>
        {/* SearchAction: ensina buscador e agente a montar /search?dest=GRU. */}
        <script type="application/ld+json">{JSON.stringify(webSiteSchema())}</script>
      </Helmet>
      <Hero />
      <FeaturedParkingLots />
      <TrustBand />
      <HowItWorks />
      <DestinationsGallery />
      <CtaBanner />
    </div>
  );
}
