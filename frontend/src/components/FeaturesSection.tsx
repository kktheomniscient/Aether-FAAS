import { Zap, Shield, Layers } from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "Instant Deploy",
    description: "Paste your code, hit deploy, get an endpoint. No infrastructure configuration, no YAML files, no waiting.",
    accent: "bg-neon",
  },
  {
    icon: Shield,
    title: "Secure Isolation",
    description: "Every function runs in its own Docker container. Complete isolation, zero cross-contamination, automatic cleanup.",
    accent: "bg-chart-4",
  },
  {
    icon: Layers,
    title: "Async Scaling",
    description: "Background processing handled via Redis Queue workers. Fire-and-forget or poll for results. Scale horizontally.",
    accent: "bg-chart-2",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="px-6 py-10 md:py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12">
          <span className="brutal-section-title text-muted-foreground">Why Aether</span>
          <h2 className="mt-2 text-3xl font-bold md:text-5xl">
            Ship functions,<br />not infrastructure.
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="brutal-card p-8">
              <div className={`${feature.accent} border-3 border-foreground inline-flex items-center justify-center h-14 w-14 mb-6`}>
                <feature.icon className="h-7 w-7" strokeWidth={2.5} />
              </div>
              <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
