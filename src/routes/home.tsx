import { Helmet } from "react-helmet-async";
import { organizationSchema, webSiteSchema } from "@/lib/jsonld";
import { Hero } from "@/features/home/Hero";
import { DestinationsGallery } from "@/features/home/DestinationsGallery";
import { FeaturedParkingLots } from "@/features/home/FeaturedParkingLots";
import { HowItWorks } from "@/features/home/HowItWorks";
import { TrustBand } from "@/features/home/TrustBand";
import { CtaBanner } from "@/components/shared/CtaBanner";
import { SITE_URL } from "@/lib/site";

export default function HomePage() {
  return (
    <div>
      <Helmet>
        <title>Movepark | Estacionamentos em aeroportos e destinos</title>
        <meta
          name="description"
          content="Reserve sua vaga com antecedência. Estacionamentos cobertos, descobertos e valet nos principais aeroportos e destinos do Brasil."
        />
        <meta property="og:title" content="Movepark | Estacionamentos em aeroportos e destinos" />
        <meta
          property="og:description"
          content="Reserve sua vaga com antecedência. Estacionamentos cobertos, descobertos e valet nos principais aeroportos e destinos do Brasil."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={SITE_URL} />
        {/* A og:image vem do shell (área `marca`). Aqui ela apontava para
            /og/home.jpg, arquivo que nunca foi commitado: o card da home ia com
            404 no lugar da imagem. */}
        <link rel="canonical" href={SITE_URL} />
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
