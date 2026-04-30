import { Link } from "@tanstack/react-router";
import { ShieldCheck, MessageSquareHeart } from "lucide-react";

export function AppFooter() {
  return (
    <footer className="mt-12 border-t bg-card/40">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} SalubApp — Pour des villes propres.</p>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <Link to="/confidentialite" className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> Politique de confidentialité
          </Link>
          <Link to="/avis" className="inline-flex items-center gap-1 hover:text-foreground">
            <MessageSquareHeart className="h-3.5 w-3.5" /> Donner mon avis
          </Link>
        </nav>
      </div>
    </footer>
  );
}
