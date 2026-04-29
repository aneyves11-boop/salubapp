import { readFileSync, writeFileSync } from "fs";

const file = new URL(
  "../node_modules/@lovable.dev/vite-tanstack-config/dist/index.js",
  import.meta.url
).pathname.replace(/^\/([A-Z]:)/, "$1");

let src = readFileSync(file, "utf8");
const needle = `if (command === "serve" && mode === "development") {\n      internalPlugins.push(componentTagger());\n    }`;
const replacement = `// componentTagger disabled — removes "Edit with Lovable" floating button`;

if (src.includes(needle)) {
  writeFileSync(file, src.replace(needle, replacement), "utf8");
  console.log("patch-lovable: componentTagger disabled.");
} else if (src.includes("componentTagger disabled")) {
  console.log("patch-lovable: already applied, nothing to do.");
} else {
  console.warn("patch-lovable: pattern not found, skipping.");
}
