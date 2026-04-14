import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { HeroSection } from "@/components/HeroSection";
import { FeaturesSection } from "@/components/FeaturesSection";
import { FooterSection } from "@/components/FooterSection";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aether — Functions as a Service" },
      { name: "description", content: "Run Python functions instantly, without the server headache. Docker isolation, Redis Queue speed, one simple API." },
      { property: "og:title", content: "Aether — Functions as a Service" },
      { property: "og:description", content: "Run Python functions instantly, without the server headache." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <HeroSection />
      <FeaturesSection />
      <FooterSection />
    </div>
  );
}
