import { Metadata } from 'next';
import { Navigation } from "@/components/landing/navigation";
import { PageSnapScroll } from "@/components/landing/page-snap-scroll";
import { HeroSection } from "@/components/landing/hero-section";
import { HorizontalScrollSection } from "@/components/landing/horizontal-scroll-section";
import { IntegrationsSection } from "@/components/landing/integrations-section";
import { SecuritySection } from "@/components/landing/security-section";
import { DevelopersSection } from "@/components/landing/developers-section";
import { FooterSection } from "@/components/landing/footer-section";

export const metadata: Metadata = {
  title: 'Institutional Credit Protocol',
};

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-x-clip">
      <PageSnapScroll />
      <Navigation />
      <HeroSection />
      <HorizontalScrollSection />
      <IntegrationsSection />
      <SecuritySection />
      <DevelopersSection />
      <FooterSection />
    </main>
  );
}
