import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PlusCircle, Flame, ShieldCheck, Mail } from "lucide-react";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
      <div className="bg-emerald-50 px-4 py-1 text-center text-[11px] text-emerald-900">
        <Link to="/confidentialite" className="inline-flex items-center gap-1.5 font-medium hover:underline">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
          <span>Accès libre sans inscription • Identité 100 % protégée — Politique de confidentialité</span>
        </Link>
      </div>
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <img
            src="/logo-salubapp.png"
            alt="Logo SalubApp"
            className="h-9 w-9 rounded-lg object-cover shadow-xs"
          />
          <div>
            <div className="text-base font-bold leading-none">SalubApp</div>
            <div className="text-[10px] text-muted-foreground">Pour des villes propres</div>
          </div>
        </Link>
        <nav className="flex items-center gap-1.5">
          <Button asChild variant="ghost" size="sm">
            <Link to="/carte"><Flame className="mr-1 h-4 w-4" />Carte</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/contact"><Mail className="mr-1 h-4 w-4" />Nous contacter</Link>
          </Button>
          <Button asChild size="sm" className="gap-1">
            <Link to="/signaler"><PlusCircle className="h-4 w-4" />Signaler</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
