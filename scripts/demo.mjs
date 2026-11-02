import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const id = new Date().toISOString().replaceAll(":", "-");
const demoRoot = path.join(root, "local-output", `demo-${id}`);
const workspace = path.join(demoRoot, "sample-workspace");
const handoff = path.join(demoRoot, "HANDOFF.md");
mkdirSync(workspace, { recursive: true });

const cli = path.join(root, "bin", "kingresume.mjs");
function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("This is a fictional example. It does not inspect or edit another project.");
run([
  "create", "--workspace", workspace,
  "--task", "Map a fictional customer import",
  "--status", "blocked",
  "--done", "Reviewed a synthetic field list and marked required columns.",
  "--check", "The notes above are illustrative and were not validated against a real system.",
  "--blocker", "Waiting for the fictional source owner to confirm the time zone.",
  "--next", "Confirm the source time zone, then update the date mapping.",
  "--limitation", "No real customer data or ERP connection is involved in this example.",
  "--out", handoff,
]);
run(["resume", handoff, "--workspace", workspace]);
console.log(`\nOpen the generated file: ${path.relative(root, handoff)}`);
