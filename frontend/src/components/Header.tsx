import { Link } from "@tanstack/react-router";

export function Header() {
  return (
    <header className="border-b-3 border-foreground bg-card px-6 py-4">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center bg-neon border-3 border-foreground font-mono font-bold text-lg">
            Æ
          </div>
          <span className="text-xl font-bold tracking-tight">Aether</span>
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          <Link to="/" className="text-sm font-semibold hover:underline decoration-2 underline-offset-4">Home</Link>
          <Link to="/auth" className="brutal-btn brutal-btn-primary px-5 py-2.5 text-sm">
            Go to Console →
          </Link>
        </nav>
        <Link to="/auth" className="brutal-btn brutal-btn-primary px-4 py-2 text-sm md:hidden">
          Console
        </Link>
      </div>
    </header>
  );
}
