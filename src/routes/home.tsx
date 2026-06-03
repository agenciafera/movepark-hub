import { Helmet } from "react-helmet-async";
import { Hero } from "@/features/home/Hero";
import { CategoryStrip } from "@/features/home/CategoryStrip";
import { PopularDestinations } from "@/features/home/PopularDestinations";
import { TrustBand } from "@/features/home/TrustBand";
import { HowItWorks } from "@/features/home/HowItWorks";

export default function HomePage() {
  return (
    <div>
      <Helmet>
        <title>Movepark — Estacionamentos em aeroportos e destinos</title>
        <meta
          name="description"
          content="Reserve sua vaga com antecedência. Estacionamentos cobertos, descobertos e valet nos principais aeroportos e destinos do Brasil."
        />
        <meta property="og:title" content="Movepark — Estacionamentos em aeroportos e destinos" />
        <meta
          property="og:description"
          content="Reserve sua vaga com antecedência. Estacionamentos cobertos, descobertos e valet nos principais aeroportos e destinos do Brasil."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://hub.movepark.co" />
        <link rel="canonical" href="https://hub.movepark.co" />
      </Helmet>
      <Hero />
      <CategoryStrip />
      <PopularDestinations />
      <TrustBand />
      <HowItWorks />
    </div>
  );
}
