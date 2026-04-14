import { Link } from "@tanstack/react-router";

export function HeroSection() {
  return (
    <section className="px-6 py-10 md:py-10">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
          <div>
            {/* <div className="brutal-badge inline-block bg-neon px-3 py-1 mb-6">
              Now in Public Beta
            </div> */}
            <h1 className="text-4xl font-bold leading-tight md:text-6xl lg:text-6xl tracking-tight">
              Run Python functions{" "}
              <span className="bg-neon px-2 inline-block -rotate-1">instantly</span>,{" "}
              without the server headache.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-lg leading-relaxed">
              Docker isolation. Redis Queue speed. One simple API. 
              Deploy functions in seconds, scale to millions.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link to="/auth" className="brutal-btn brutal-btn-primary px-8 py-4 text-base">
                Start for Free →
              </Link>
              <a href="#features" className="brutal-btn brutal-btn-secondary px-8 py-4 text-base">
                See How It Works
              </a>
            </div>
          </div>
          <div className="brutal-card p-0 overflow-hidden hover:transform-none hover:shadow-[var(--brutal-shadow)]">
            <div className="bg-foreground text-primary-foreground px-4 py-2 flex items-center gap-2 text-sm font-mono">
              <span className="h-3 w-3 rounded-full bg-destructive inline-block"></span>
              <span className="h-3 w-3 rounded-full bg-chart-4 inline-block"></span>
              <span className="h-3 w-3 rounded-full bg-neon inline-block"></span>
              <span className="ml-2 opacity-60">terminal</span>
            </div>
            <div className="bg-foreground text-primary-foreground p-6 font-mono text-sm leading-relaxed">
              <p className="text-neon">$ aether deploy hello.py</p>
              <p className="opacity-60 mt-2">→ Building container...</p>
              <p className="opacity-60">→ Installing dependencies...</p>
              <p className="opacity-60">→ Deploying function...</p>
              <p className="mt-2 text-neon">✓ Live at /api/hello</p>
              <p className="opacity-60 mt-4">$ curl https://aether.run/api/hello</p>
              <p className="mt-1">{"{"}"message": "Hello, World!"{"}"}</p>
              <span className="inline-block w-2.5 h-5 bg-neon animate-pulse ml-1"></span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
