import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillRoot = path.join(root, "skill", "kingresume");
const skillScripts = path.join(skillRoot, "scripts");
const skillLib = path.join(skillRoot, "lib");
mkdirSync(skillScripts, { recursive: true });
mkdirSync(skillLib, { recursive: true });
copyFileSync(path.join(root, "bin", "kingresume.mjs"), path.join(skillScripts, "kingresume.mjs"));
for (const file of readdirSync(path.join(root, "lib"))) {
  if (file.endsWith(".mjs")) copyFileSync(path.join(root, "lib", file), path.join(skillLib, file));
}
console.log("KingResume skill runtime packaged.");
