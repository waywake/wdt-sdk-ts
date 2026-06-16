import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const distDir = resolve(import.meta.dir, "../dist");

for (const file of readdirSync(distDir)) {
  if (!file.endsWith(".d.ts")) {
    continue;
  }

  const path = resolve(distDir, file);
  const source = readFileSync(path, "utf8");
  const fixed = source.replace(/(from\s+["']\.\/[^"']+)(["'])/g, (match, specifier: string, quote: string) => {
    if (specifier.endsWith(".js")) {
      return match;
    }
    return `${specifier}.js${quote}`;
  });

  if (fixed !== source) {
    writeFileSync(path, fixed);
  }
}
