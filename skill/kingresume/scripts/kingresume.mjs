#!/usr/bin/env node
import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, unlinkSync, writeSync } from "node:fs";
import path from "node:path";
import { parseCreateArgs, parseResumeArgs } from "../lib/arguments.mjs";
import { captureGitState, compareGitState } from "../lib/git-state.mjs";
import { MAX_HANDOFF_BYTES, normalizeHandoffInput, parseHandoff, renderHandoff } from "../lib/handoff.mjs";

const HELP = `KingResume — create and resume portable work handoffs

Usage:
  node bin/kingresume.mjs create --task TEXT --next TEXT --out FILE [options]
  node bin/kingresume.mjs resume HANDOFF.md [--workspace DIR]

Create options:
  --workspace DIR       Workspace to observe (default: current directory)
  --task TEXT           Short description of the task (required)
  --status VALUE        in-progress | blocked | ready | complete
  --done TEXT           Reported completed work; repeatable
  --check TEXT          Check and result reported by author; repeatable
  --decision TEXT       Decision or context; repeatable
  --blocker TEXT        Current blocker; repeatable
  --next TEXT           Concrete next action; repeatable
  --limitation TEXT     Known gap or unverified result; repeatable
  --include-paths       Include Git-visible changed paths (may expose names)
  --out FILE            New Markdown handoff path (never overwrites)

Resume compares recorded branch, commit, and Git-visible changes with a workspace.
It does not change files, run saved commands, or verify that reported work is correct.
`;

function ensureDirectory(input, label) {
  let resolved;
  try { resolved = realpathSync(input); } catch { throw new Error(`${label} does not exist or cannot be resolved.`); }
  let stat;
  try { stat = lstatSync(resolved); } catch { throw new Error(`${label} cannot be inspected.`); }
  if (!stat.isDirectory()) throw new Error(`${label} must be a directory.`);
  return resolved;
}

function prepareOutput(input) {
  const absolute = path.resolve(input);
  const parent = ensureDirectory(path.dirname(absolute), "Output directory");
  return path.join(parent, path.basename(absolute));
}

function writeNewFile(file, content) {
  let descriptor;
  try {
    descriptor = openSync(file, "wx", 0o600);
    const bytes = Buffer.from(content, "utf8");
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(descriptor, bytes, offset, bytes.length - offset);
      if (written < 1) throw new Error("Could not finish writing the handoff.");
      offset += written;
    }
    fsyncSync(descriptor);
    closeSync(descriptor);
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* already closed */ }
      try { unlinkSync(file); } catch { /* preserve the original write error */ }
    }
    if (error?.code === "EEXIST") throw new Error("Output already exists; choose a new path.");
    throw error;
  }
}

function safeLabel(text) {
  return String(text).replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g, " ");
}

function line(label, value) {
  console.log(`${label}${safeLabel(value)}`);
}

function create(tokens) {
  const options = parseCreateArgs(tokens);
  const workspace = ensureDirectory(options.workspace, "Workspace");
  const out = prepareOutput(options.out);
  const git = captureGitState(workspace, { ignorePath: out, includePaths: options.includePaths });
  const record = normalizeHandoffInput({ ...options, git });
  const output = renderHandoff(record);
  writeNewFile(out, output);
  line("Created handoff: ", out);
  line("Status: ", record.status);
  line("Git snapshot: ", git.available ? `${git.label} / ${git.branch} / ${git.head ?? "no commit"}` : git.reason);
  if (!options.includePaths && git.available && git.changedCount > 0) {
    console.log("Changed path names were omitted. Use --include-paths only when the names are safe to share.");
  }
}

function readHandoff(file) {
  const absolute = path.resolve(file);
  let stat;
  try { stat = lstatSync(absolute); } catch { throw new Error("Handoff file does not exist or cannot be inspected."); }
  if (!stat.isFile()) throw new Error("Handoff path must be a regular file.");
  if (stat.size > MAX_HANDOFF_BYTES) throw new Error("Handoff exceeds the 1 MiB size limit.");
  return { absolute, text: readFileSync(absolute, "utf8") };
}

function resume(tokens) {
  const options = parseResumeArgs(tokens);
  const { absolute, text } = readHandoff(options.handoff);
  const { record, visibleTextChanged } = parseHandoff(text);
  const workspace = ensureDirectory(options.workspace, "Workspace");
  const current = captureGitState(workspace, { ignorePath: absolute, includePaths: false });
  const comparison = compareGitState(record.git, current);

  line("KingResume: ", record.task);
  line("Status at handoff: ", record.status);
  line("Created: ", record.createdAt);
  if (visibleTextChanged) {
    console.log("Warning: visible Markdown differs from its embedded record. This summary uses the embedded fields; read and reconcile the full handoff before continuing.");
  }
  if (comparison.result === "match") {
    console.log("Git status-shape comparison: MATCH — folder label, branch, commit, and changed path/status codes match.");
  } else if (comparison.result === "drift") {
    line("Git status-shape comparison: DRIFT — ", comparison.differences.join(", "));
  } else if (comparison.result === "cannot-compare") {
    line("Git status-shape comparison: CANNOT COMPARE — ", comparison.reason);
  } else {
    line("Git status-shape comparison: NOT RECORDED — ", comparison.reason);
  }
  console.log("Reported completed work:");
  printItems(record.done);
  console.log("Checks reported by the author:");
  printItems(record.checks);
  console.log("Decisions and context:");
  printItems(record.decisions);
  console.log("Blockers:");
  printItems(record.blockers);
  console.log("Next actions:");
  printItems(record.next);
  if (record.limitations.length) {
    console.log("Known limitations:");
    printItems(record.limitations);
  }
  if (record.git.available) {
    line("Recorded workspace: ", `${record.git.label} / ${record.git.branch} / ${record.git.head ?? "no commit"}`);
    line("Current workspace: ", current.available ? `${current.label} / ${current.branch} / ${current.head ?? "no commit"}` : current.reason);
  }
  console.log("This compares Git status shape, not file bytes. Further edits within an already-changed path may still match. It does not establish repository identity, task correctness, or that every workspace file is tracked.");
}

function printItems(items) {
  if (!items.length) {
    console.log("  (none)");
    return;
  }
  for (const item of items) console.log(`  - ${safeLabel(item)}`);
}

const [command, ...tokens] = process.argv.slice(2);
try {
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(HELP);
  } else if (command === "create") {
    create(tokens);
  } else if (command === "resume") {
    resume(tokens);
  } else {
    throw new Error(`Unknown command: ${command}\n\n${HELP}`);
  }
} catch (error) {
  console.error(`KingResume: ${safeLabel(error?.message ?? error)}`);
  process.exitCode = 1;
}
