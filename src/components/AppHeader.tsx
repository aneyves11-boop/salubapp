import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { LogOut, PlusCircle, ShieldCheck, Flame, Settings } from "lucide-react";

export function AppHeader() {
  const { user, isAutorite, roles, signOut } = useAuth();
  const isAdmin = roles.includes("admin");
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <img src="/mqp.png" alt="Mon Quartier Propre" className="h-9 w-9 rounded-lg object-cover" />
          <div>
            <div className="text-base font-bold leading-none">SalubApp</div>
            <div className="text-[10px] text-muted-foreground">Pour des villes propres</div>
          </div>
        </Link>
        <nav className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link to="/carte"><Flame className="mr-1 h-4 w-4" />Carte</Link>
          </Button>
          {isAutorite && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/dashboard"><ShieldCheck className="mr-1 h-4 w-4" />Tableau de bord</Link>
            </Button>
          )}
          {isAdmin && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin"><Settings className="mr-1 h-4 w-4" />Admin</Link>
            </Button>
          )}
          {user ? (
            <>
              <Button asChild size="sm" className="gap-1">
                <Link to="/signaler"><PlusCircle className="h-4 w-4" />Signaler</Link>
              </Button>
              <Button variant="ghost" size="icon" onClick={async () => { await signOut(); navigate({ to: "/" }); }} aria-label="Déconnexion">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button asChild size="sm"><Link to="/login">Se connecter</Link></Button>
          )}
        </nav>
      </div>
    </header>
  );
}