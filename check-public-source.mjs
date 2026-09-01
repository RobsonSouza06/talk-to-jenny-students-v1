import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const prohibitedPaths = [
  "app/pending-book-import.ts",
  "imports",
  "private-imports",
  "private-content",
];
const ignoredDirectories = new Set([".git", ".next", "node_modules", "out"]);
const prohibitedExtensions = new Set([".pdf"]);
const importerMarkers = [
  "export const pendingBookImport",
  "type PendingBookImport",
  "const bookOneDefinition",
  "const bookTwoDefinition",
  "createUserWithEmailAndPassword",
  "provisioningAuth",
];
const errors = [];

for (const path of prohibitedPaths) {
  if (existsSync(join(root, path))) {
    errors.push(`conteúdo privado encontrado: ${path}`);
  }
}

function inspect(path) {
  const stats = statSync(path);
  const name = path.split(/[\\/]/).at(-1) ?? "";
  if (stats.isDirectory()) {
    if (ignoredDirectories.has(name)) return;
    for (const child of readdirSync(path)) inspect(join(path, child));
    return;
  }

  const projectPath = relative(root, path).replaceAll("\\", "/");
  if (projectPath === "scripts/check-public-source.mjs") return;
  if (prohibitedExtensions.has(extname(name).toLowerCase())) {
    errors.push(`PDF encontrado no projeto público: ${projectPath}`);
  }
  if (!/\.(?:js|mjs|cjs|ts|tsx|txt)$/i.test(name)) return;
  const contents = readFileSync(path, "utf8");
  for (const marker of importerMarkers) {
    if (contents.includes(marker)) {
      errors.push(`marcador de importador encontrado em ${projectPath}: ${marker}`);
    }
  }
}

inspect(root);

if (errors.length > 0) {
  console.error("A publicação foi bloqueada para proteger o conteúdo dos livros:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Verificação pública concluída: nenhum importador ou PDF encontrado.");
