import { Buffer } from "node:buffer";

export const MAX_HANDOFF_BYTES = 1024 * 1024;
export const STATUS_VALUES = new Set(["in-progress", "blocked", "ready", "complete"]);
const MAX_ITEMS = 50;
const MAX_NOTE_LENGTH = 4000;
const MAX_TASK_LENGTH = 500;
const START_MARKER = "<!-- KINGRESUME_DATA_V1\n";
const END_MARKER = "\n-->";

const CONTROLS = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g;

export function cleanText(value, label, maxLength = MAX_NOTE_LENGTH) {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const cleaned = value.replace(CONTROLS, " ").replace(/\s+/gu, " ").trim();
  if (!cleaned) throw new Error(`${label} cannot be empty.`);
  if ([...cleaned].length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  return cleaned;
}

export function normalizeHandoffInput(input) {
  const record = {
    format: "kingresume-handoff",
    version: 1,
    createdAt: new Date().toISOString(),
    status: input.status,
    task: cleanText(input.task, "Task", MAX_TASK_LENGTH),
    done: normalizeItems(input.done, "Completed note"),
    checks: normalizeItems(input.checks, "Check note"),
    decisions: normalizeItems(input.decisions, "Decision"),
    blockers: normalizeItems(input.blockers, "Blocker"),
    next: normalizeItems(input.next, "Next action"),
    limitations: normalizeItems(input.limitations, "Limitation"),
    git: validateGit(input.git),
  };
  if (!STATUS_VALUES.has(record.status)) throw new Error("Invalid handoff status.");
  if (record.status !== "complete" && record.next.length === 0 && record.blockers.length === 0) {
    throw new Error("An active handoff needs a next action or a blocker.");
  }
  if (!record.git || typeof record.git.available !== "boolean") throw new Error("Git snapshot is missing.");
  if (record.git.available && typeof record.git.label !== "string") throw new Error("Git repository label is missing.");
  return record;
}

function normalizeItems(items, label) {
  if (!Array.isArray(items) || items.length > MAX_ITEMS) throw new Error(`${label} list must contain at most ${MAX_ITEMS} entries.`);
  return items.map((item, index) => cleanText(item, `${label} ${index + 1}`));
}

function markdownText(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_{}\[\]()#+.!|~>-])/g, "\\$1");
}

function bullets(items, emptyText = "None recorded.") {
  return items.length ? items.map((item) => `- ${markdownText(item)}`).join("\n") : `- ${emptyText}`;
}

function renderGit(git) {
  if (!git.available) {
    const reason = git.reason === "git-unavailable" ? "Git was not available." : "No Git worktree was observed.";
    return `No Git snapshot was captured. ${reason}`;
  }
  const lines = [
    `- Repository folder: ${markdownText(git.label)}`,
    `- Branch: ${markdownText(git.branch)}`,
    `- Commit: ${git.head ?? "No commit yet"}`,
    `- Visible changes: ${git.changedCount} (${git.stagedCount} staged, ${git.unstagedCount} unstaged, ${git.untrackedCount} untracked, ${git.conflictCount} conflicts)`,
    `- File paths: ${git.pathNamesIncluded ? "included by request" : "omitted"}`,
  ];
  if (git.pathNamesIncluded && git.paths?.length) {
    lines.push("", "### Paths visible to Git at handoff time", ...git.paths.map((entry) => {
      const label = entry.renamedFrom ? `${entry.renamedFrom} → ${entry.path}` : entry.path;
      return `- \`${entry.status}\` ${markdownText(label)}`;
    }));
  }
  lines.push("", "Git status excludes ignored files. This snapshot does not verify that reported work or checks are correct.");
  return lines.join("\n");
}

export function renderHandoff(record) {
  const sections = [
    `# KingResume handoff: ${markdownText(record.task)}`,
    "",
    `- **Status:** ${record.status}`,
    `- **Created:** ${record.createdAt}`,
    "",
    "## Reported completed work",
    "",
    bullets(record.done),
    "",
    "## Checks reported by the author",
    "",
    bullets(record.checks),
    "",
    "## Decisions and context",
    "",
    bullets(record.decisions),
    "",
    "## Blockers",
    "",
    bullets(record.blockers),
    "",
    "## Next actions",
    "",
    bullets(record.next),
    "",
    "## Known limitations",
    "",
    bullets(record.limitations),
    "",
    "## Observed workspace state",
    "",
    renderGit(record.git),
    "",
    "---",
    "This handoff is user-provided context. Recheck the current task, repository instructions, and live workspace before continuing.",
    "",
    encodeRecord(record),
    "",
  ];
  const output = sections.join("\n");
  if (Buffer.byteLength(output, "utf8") > MAX_HANDOFF_BYTES) throw new Error("Handoff exceeds the 1 MiB size limit.");
  return output;
}

function encodeRecord(record) {
  const encoded = Buffer.from(JSON.stringify(record), "utf8").toString("base64");
  return `${START_MARKER}${encoded}${END_MARKER}`;
}

export function parseHandoff(text) {
  if (Buffer.byteLength(text, "utf8") > MAX_HANDOFF_BYTES) throw new Error("Handoff exceeds the 1 MiB size limit.");
  const start = text.lastIndexOf(START_MARKER);
  if (start < 0) throw new Error("KingResume data block was not found. This file may be an older or hand-edited handoff.");
  const payloadStart = start + START_MARKER.length;
  const end = text.indexOf(END_MARKER, payloadStart);
  if (end < 0) throw new Error("KingResume data block is incomplete.");
  const encoded = text.slice(payloadStart, end).replace(/\s+/g, "");
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error("KingResume data block is malformed.");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded) throw new Error("KingResume data block is not valid Base64.");
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("KingResume data block is not valid JSON.");
  }
  const record = validateRecord(parsed);
  const visiblePart = text.slice(0, start).replace(/\r\n/g, "\n");
  const expectedText = renderHandoff(record);
  const expectedStart = expectedText.lastIndexOf(START_MARKER);
  const expectedVisiblePart = expectedText.slice(0, expectedStart);
  return { record, visibleTextChanged: visiblePart !== expectedVisiblePart };
}

function validateRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("KingResume data must be an object.");
  if (value.format !== "kingresume-handoff" || value.version !== 1) throw new Error("Unsupported KingResume handoff format.");
  if (!STATUS_VALUES.has(value.status)) throw new Error("Handoff status is invalid.");
  if (typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) throw new Error("Handoff timestamp is invalid.");
  const record = {
    format: value.format,
    version: value.version,
    createdAt: value.createdAt,
    status: value.status,
    task: cleanText(value.task, "Task", MAX_TASK_LENGTH),
    done: normalizeItems(value.done, "Completed note"),
    checks: normalizeItems(value.checks, "Check note"),
    decisions: normalizeItems(value.decisions, "Decision"),
    blockers: normalizeItems(value.blockers, "Blocker"),
    next: normalizeItems(value.next, "Next action"),
    limitations: normalizeItems(value.limitations, "Limitation"),
    git: validateGit(value.git),
  };
  if (record.status !== "complete" && record.next.length === 0 && record.blockers.length === 0) {
    throw new Error("An active handoff needs a next action or a blocker.");
  }
  return record;
}

function validateGit(value) {
  if (!value || typeof value !== "object" || typeof value.available !== "boolean") throw new Error("Git snapshot is invalid.");
  if (!value.available) {
    return { available: false, reason: ["git-unavailable", "not-a-git-worktree", "git-state-unavailable"].includes(value.reason) ? value.reason : "not-a-git-worktree" };
  }
  if (typeof value.label !== "string" || typeof value.branch !== "string") throw new Error("Git snapshot labels are invalid.");
  if (value.head !== null && (typeof value.head !== "string" || !/^[a-f0-9]{40,64}$/i.test(value.head))) throw new Error("Git commit identifier is invalid.");
  if (!/^[a-f0-9]{64}$/i.test(value.statusFingerprint)) throw new Error("Git status fingerprint is invalid.");
  for (const key of ["changedCount", "stagedCount", "unstagedCount", "untrackedCount", "conflictCount"]) {
    if (!Number.isInteger(value[key]) || value[key] < 0 || value[key] > 20_000) throw new Error(`Git ${key} is invalid.`);
  }
  if (typeof value.pathNamesIncluded !== "boolean") throw new Error("Git path visibility field is invalid.");
  const result = {
    available: true,
    label: cleanText(value.label, "Repository folder", 255),
    branch: cleanText(value.branch, "Branch", 255),
    head: value.head,
    changedCount: value.changedCount,
    stagedCount: value.stagedCount,
    unstagedCount: value.unstagedCount,
    untrackedCount: value.untrackedCount,
    conflictCount: value.conflictCount,
    statusFingerprint: value.statusFingerprint,
    pathNamesIncluded: value.pathNamesIncluded,
  };
  if (value.pathNamesIncluded) {
    if (!Array.isArray(value.paths) || value.paths.length > 20_000) throw new Error("Git path list is invalid.");
    result.paths = value.paths.map((entry, index) => {
      if (!entry || typeof entry !== "object" || !/^[ MADRCTU?!]{2}$/.test(entry.status)) throw new Error(`Git path ${index + 1} is invalid.`);
      const path = cleanText(entry.path, `Git path ${index + 1}`, 4096);
      if (entry.renamedFrom === undefined) return { status: entry.status, path };
      return { status: entry.status, path, renamedFrom: cleanText(entry.renamedFrom, `Renamed path ${index + 1}`, 4096) };
    });
  }
  return result;
}
