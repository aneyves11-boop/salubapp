import { Link } from "@tanstack/react-router";
import { ShieldCheck, MessageSquareHeart, Mail, Sparkles } from "lucide-react";

export function AppFooter() {
  return (
    <footer className="mt-12 border-t bg-card/60">
      <div className="mx-auto max-w-5xl px-4 py-6 text-xs text-muted-foreground">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2.5 text-center sm:text-left">
            <img
              src="/logo-salubapp.png"
              alt="Logo SalubApp"
              className="h-8 w-8 shrink-0 rounded-lg object-cover shadow-xs"
            />
            <div>
              <p className="font-medium text-foreground">
                © {new Date().getFullYear()} SalubApp — Pour des villes propres.
              </p>
              <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Sparkles className="h-3 w-3 text-emerald-600" />
                Conçu et développé par{" "}
                <strong className="font-bold tracking-wide text-emerald-700 dark:text-emerald-400">
                  AXY GROUP
                </strong>
              </p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <Link
              to="/contact"
              className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-800 hover:underline dark:text-emerald-400"
            >
              <Mail className="h-3.5 w-3.5" /> Nous contacter
            </Link>
            <Link
              to="/avis"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <MessageSquareHeart className="h-3.5 w-3.5" /> Donner mon avis
            </Link>
            <Link
              to="/confidentialite"
              className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Politique de confidentialité
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
