import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth-context";

import appCss from "../styles.css?url";
import leafletCss from "leaflet/dist/leaflet.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page introuvable</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          La page que vous cherchez n'existe pas ou a été déplacée.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#059669" },
      { title: "SalubApp — Signalez l'insalubrité dans votre quartier" },
      {
        name: "description",
        content:
          "Plateforme citoyenne et municipale pour signaler et résoudre les problèmes d'insalubrité urbaine à Abidjan.",
      },
      { name: "author", content: "SalubApp" },
      { property: "og:site_name", content: "SalubApp" },
      { property: "og:title", content: "SalubApp — Signalez l'insalubrité dans votre quartier" },
      {
        property: "og:description",
        content:
          "Plateforme citoyenne et municipale pour signaler et résoudre les problèmes d'insalubrité urbaine à Abidjan.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/og-salubapp.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "SalubApp — Signalez l'insalubrité dans votre quartier" },
      {
        name: "twitter:description",
        content:
          "Plateforme citoyenne et municipale pour signaler et résoudre les problèmes d'insalubrité urbaine à Abidjan.",
      },
      { name: "twitter:image", content: "/og-salubapp.png" },
    ],
    links: [
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/favicon-192x192.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: leafletCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
      })
  );
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <Outlet />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
