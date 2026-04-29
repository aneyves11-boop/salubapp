import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = join(root, "node_modules/@lovable.dev/vite-tanstack-config/dist");

const patches = [
  {
    file: join(base, "index.js"),
    find: `if (command === "serve" && mode === "development") {\n      internalPlugins.push(componentTagger());\n    }`,
    replace: `// componentTagger disabled — removes "Edit with Lovable" button`,
  },
  {
    file: join(base, "index.cjs"),
    find: `var import_lovable_tagger = require("lovable-tagger");`,
    replace: `var import_lovable_tagger = { componentTagger: () => ({ name: "lovable-tagger-noop" }) }; // patched`,
  },
];

for (const { file, find, replace } of patches) {
  let src;
  try { src = readFileSync(file, "utf8"); } catch { continue; }
  if (src.includes(find)) {
    writeFileSync(file, src.replace(find, replace), "utf8");
    console.log(`patch-lovable: patched ${file.split("/").pop()}`);
  } else if (src.includes("patched") || src.includes("disabled")) {
    console.log(`patch-lovable: ${file.split("/").pop()} already patched`);
  } else {
    console.warn(`patch-lovable: pattern not found in ${file.split("/").pop()}, skipping`);
  }
}
