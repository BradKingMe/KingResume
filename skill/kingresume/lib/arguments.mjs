const repeatable = new Set(["--done", "--check", "--decision", "--blocker", "--next", "--limitation"]);

function splitOption(token) {
  const index = token.indexOf("=");
  return index < 0 ? [token, undefined] : [token.slice(0, index), token.slice(index + 1)];
}

function readOptions(tokens, allowedFlags, allowedValues, repeatableValues = new Set()) {
  const values = new Map();
  const flags = new Set();
  for (let i = 0; i < tokens.length; i += 1) {
    const [key, inlineValue] = splitOption(tokens[i]);
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${tokens[i]}`);
    if (allowedFlags.has(key)) {
      if (inlineValue !== undefined) throw new Error(`${key} does not take a value.`);
      if (flags.has(key)) throw new Error(`${key} may only be used once.`);
      flags.add(key);
      continue;
    }
    if (!allowedValues.has(key)) throw new Error(`Unknown option: ${key}`);
    const value = inlineValue === undefined ? tokens[++i] : inlineValue;
    if (value === undefined || (inlineValue === undefined && value.startsWith("--"))) {
      throw new Error(`${key} requires a value. Use ${key}=VALUE when the value starts with --.`);
    }
    if (!repeatableValues.has(key) && values.has(key)) throw new Error(`${key} may only be used once.`);
    if (repeatableValues.has(key)) values.set(key, [...(values.get(key) ?? []), value]);
    else values.set(key, value);
  }
  return { values, flags };
}

export function parseCreateArgs(tokens) {
  const allowedFlags = new Set(["--include-paths"]);
  const allowedValues = new Set([
    "--workspace", "--task", "--status", "--done", "--check", "--decision",
    "--blocker", "--next", "--limitation", "--out",
  ]);
  const { values, flags } = readOptions(tokens, allowedFlags, allowedValues, repeatable);
  for (const key of ["--task", "--out"]) {
    if (!values.has(key) || !values.get(key).trim()) throw new Error(`${key} is required.`);
  }
  const status = values.get("--status") ?? "in-progress";
  if (!["in-progress", "blocked", "ready", "complete"].includes(status)) {
    throw new Error("--status must be in-progress, blocked, ready, or complete.");
  }
  const list = (key) => values.get(key) ?? [];
  const next = list("--next");
  const blockers = list("--blocker");
  if (status !== "complete" && next.length === 0 && blockers.length === 0) {
    throw new Error("Add at least one --next action or --blocker so the handoff can be resumed.");
  }
  return {
    workspace: values.get("--workspace") ?? process.cwd(),
    task: values.get("--task"),
    status,
    done: list("--done"),
    checks: list("--check"),
    decisions: list("--decision"),
    blockers,
    next,
    limitations: list("--limitation"),
    out: values.get("--out"),
    includePaths: flags.has("--include-paths"),
  };
}

export function parseResumeArgs(tokens) {
  const positional = [];
  const optionStart = tokens.findIndex((token) => token.startsWith("--"));
  const head = optionStart < 0 ? tokens : tokens.slice(0, optionStart);
  const tail = optionStart < 0 ? [] : tokens.slice(optionStart);
  positional.push(...head);
  if (positional.length !== 1) throw new Error("resume requires one handoff Markdown path.");
  const { values } = readOptions(tail, new Set(), new Set(["--workspace"]));
  return { handoff: positional[0], workspace: values.get("--workspace") ?? process.cwd() };
}
