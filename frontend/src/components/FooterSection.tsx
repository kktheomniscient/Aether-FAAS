export function FooterSection() {
  return (
    <footer className="border-t-3 border-foreground bg-foreground text-primary-foreground px-6 py-12">
      <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center bg-neon border-2 border-primary-foreground font-mono font-bold text-sm text-neon-foreground">
            Æ
          </div>
          <span className="font-bold">Aether</span>
        </div>
        <p className="text-sm opacity-60">
          © 2026 Aether. Functions as a Service, built on Docker.
        </p>
      </div>
    </footer>
  );
}
