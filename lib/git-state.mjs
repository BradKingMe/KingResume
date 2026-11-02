import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";

const MAX_STATUS_BYTES = 4 * 1024 * 1024;
const MAX_STATUS_ENTRIES = 20_000;

function git(args, cwd, timeout = 5000) {
  return spawnSync("git", ["-C", cwd, "-c", "core.fsmonitor=false", ...args], {
    cwd,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" },
    encoding: "buffer",
    timeout,
    maxBuffer: MAX_STATUS_BYTES,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function outputText(result) {
  return Buffer.isBuffer(result.stdout) ? result.stdout.toString("utf8").trim() : "";
}

function parseStatus(buffer) {
  const entries = [];
  let cursor = 0;
  while (cursor < buffer.length) {
    const end = buffer.indexOf(0, cursor);
    if (end < 0) throw new Error("Git returned incomplete status data.");
    const record = buffer.subarray(cursor, end).toString("utf8");
    cursor = end + 1;
    if (record.length < 4 || record[2] !== " ") throw new Error("Git returned an unexpected status record.");
    const code = record.slice(0, 2);
    const file = record.slice(3);
    let previousFile;
    if (code.includes("R") || code.includes("C")) {
      const previousEnd = buffer.indexOf(0, cursor);
      if (previousEnd < 0) throw new Error("Git returned an incomplete rename record.");
      previousFile = buffer.subarray(cursor, previousEnd).toString("utf8");
      cursor = previousEnd + 1;
    }
    entries.push({ code, file, ...(previousFile === undefined ? {} : { previousFile }) });
    if (entries.length > MAX_STATUS_ENTRIES) throw new Error("Git status exceeds the 20,000 path limit.");
  }
  return entries;
}

function normalizeRelative(file) {
  return file.split(path.sep).join("/").replace(/^\.\//, "");
}

function comparePath(file) {
  const normalized = normalizeRelative(file);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function captureGitState(workspace, { ignorePath, includePaths = false } = {}) {
  const rootResult = git(["rev-parse", "--show-toplevel"], workspace);
  if (rootResult.error?.code === "ENOENT") return { available: false, reason: "git-unavailable" };
  if (rootResult.error || rootResult.status !== 0) return { available: false, reason: "not-a-git-worktree" };
  const root = path.resolve(outputText(rootResult));

  const headResult = git(["rev-parse", "--verify", "HEAD"], root);
  const branchResult = git(["symbolic-ref", "--short", "-q", "HEAD"], root);
  const statusResult = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"], root);
  if (statusResult.error || statusResult.status !== 0 || !Buffer.isBuffer(statusResult.stdout)) {
    return { available: false, reason: "git-state-unavailable" };
  }
  let allEntries;
  try {
    allEntries = parseStatus(statusResult.stdout);
  } catch {
    return { available: false, reason: "git-state-unavailable" };
  }
  let ignoredOutputPath;
  if (ignorePath) {
    const relative = path.relative(root, path.resolve(ignorePath));
    if (relative && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)) {
      ignoredOutputPath = comparePath(relative);
    }
  }
  const entries = ignoredOutputPath
    ? allEntries.filter((entry) => comparePath(entry.file) !== ignoredOutputPath)
    : allEntries;
  const digestSource = entries.map(({ code, file, previousFile }) => [code, file, previousFile ?? null]);
  const hash = createHash("sha256").update(JSON.stringify(digestSource), "utf8").digest("hex");
  let staged = 0;
  let unstaged = 0;
  let untracked = 0;
  let conflicts = 0;
  for (const entry of entries) {
    const [indexStatus, worktreeStatus] = entry.code;
    if (entry.code === "??") untracked += 1;
    else {
      if (indexStatus !== " ") staged += 1;
      if (worktreeStatus !== " ") unstaged += 1;
    }
    if (["AA", "AU", "UA", "DD", "DU", "UD", "UU"].includes(entry.code)) conflicts += 1;
  }
  const result = {
    available: true,
    label: path.basename(root),
    branch: branchResult.status === 0 ? outputText(branchResult) : "(detached HEAD)",
    head: headResult.status === 0 ? outputText(headResult) : null,
    changedCount: entries.length,
    stagedCount: staged,
    unstagedCount: unstaged,
    untrackedCount: untracked,
    conflictCount: conflicts,
    statusFingerprint: hash,
    pathNamesIncluded: includePaths,
  };
  if (includePaths) {
    result.paths = entries.map((entry) => ({
      status: entry.code,
      path: entry.file,
      ...(entry.previousFile === undefined ? {} : { renamedFrom: entry.previousFile }),
    }));
  }
  return result;
}

export function compareGitState(recorded, current) {
  if (!recorded?.available) return { result: "not-captured", reason: recorded?.reason ?? "git-not-captured" };
  if (!current?.available) return { result: "cannot-compare", reason: current?.reason ?? "git-unavailable" };
  const differences = [];
  if (recorded.label !== current.label) differences.push("repository-folder-name");
  if (recorded.branch !== current.branch) differences.push("branch");
  if (recorded.head !== current.head) differences.push("commit");
  if (recorded.statusFingerprint !== current.statusFingerprint) differences.push("working-tree-status");
  return differences.length === 0
    ? { result: "match", differences: [] }
    : { result: "drift", differences };
}
