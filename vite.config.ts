// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("@mediapipe"))    return "mediapipe";
            if (id.includes("leaflet"))       return "maps";
            if (id.includes("react-leaflet")) return "maps";
            if (id.includes("recharts"))      return "charts";
            if (id.includes("@radix-ui"))     return "ui";
            if (id.includes("@supabase"))     return "supabase";
            if (id.includes("react-dom") || id.includes("react/")) return "react";
            if (id.includes("node_modules")) return "vendor";
          },
        },
      },
    },
  },
});
