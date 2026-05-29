import { Hero } from "@/features/home/Hero";
import { CategoryStrip } from "@/features/home/CategoryStrip";
import { PopularDestinations } from "@/features/home/PopularDestinations";
import { TrustBand } from "@/features/home/TrustBand";
import { HowItWorks } from "@/features/home/HowItWorks";

export default function HomePage() {
  return (
    <div>
      <Hero />
      <CategoryStrip />
      <PopularDestinations />
      <TrustBand />
      <HowItWorks />
    </div>
  );
}
