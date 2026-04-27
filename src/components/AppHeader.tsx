import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { LogOut, MapPin, PlusCircle, ShieldCheck } from "lucide-react";

export function AppHeader() {
  const { user, isAutorite, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-bold leading-none">SalubApp</div>
            <div className="text-[10px] text-muted-foreground">Pour des villes propres</div>
          </div>
        </Link>
        <nav className="flex items-center gap-1">
          {isAutorite && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/dashboard"><ShieldCheck className="mr-1 h-4 w-4" />Tableau de bord</Link>
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