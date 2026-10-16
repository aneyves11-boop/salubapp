import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { LogOut, PlusCircle, Flame, UserCircle2, Lock } from "lucide-react";

export function AppHeader() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
      <div className="bg-emerald-50 px-4 py-1 text-center text-[11px] text-emerald-900">
        <Link to="/confidentialite" className="inline-flex items-center gap-1 font-medium hover:underline">
          <Lock className="h-3 w-3" /> Mode 100% anonyme — voir notre politique de confidentialité
        </Link>
      </div>
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <img src="/mqp.png" alt="Mon Quartier Propre" className="h-9 w-9 rounded-lg object-cover" />
          <div>
            <div className="text-base font-bold leading-none">SalubApp</div>
            <div className="text-[10px] text-muted-foreground">Pour des villes propres</div>
          </div>
        </Link>
        <nav className="flex items-center gap-1.5">
          <Button asChild variant="ghost" size="sm">
            <Link to="/carte"><Flame className="mr-1 h-4 w-4" />Carte</Link>
          </Button>
          {user ? (
            <>
              <span className="hidden items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 sm:inline-flex">
                <UserCircle2 className="h-3 w-3" /> Anonyme
              </span>
              <Button asChild size="sm" className="gap-1">
                <Link to="/signaler"><PlusCircle className="h-4 w-4" />Signaler</Link>
              </Button>
              <Button variant="ghost" size="icon" onClick={async () => { await signOut(); navigate({ to: "/" }); }} aria-label="Déconnexion">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button asChild size="sm" className="gap-1">
              <Link to="/login"><PlusCircle className="h-4 w-4" />Signaler</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
