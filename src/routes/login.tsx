import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Accès direct — SalubApp" },
      { name: "description", content: "Accès libre sans inscription • Identité 100 % protégée." },
    ],
  }),
  component: DirectAccessRedirectPage,
});

function DirectAccessRedirectPage() {
  const navigate = useNavigate();
  const { ensureCitizenSession } = useAuth();

  useEffect(() => {
    let active = true;
    (async () => {
      await ensureCitizenSession().catch(() => null);
      if (active) {
        navigate({ to: "/signaler", replace: true });
      }
    })();
    return () => {
      active = false;
    };
  }, [ensureCitizenSession, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>Ouverture du formulaire de signalement…</span>
      </div>
    </div>
  );
}
