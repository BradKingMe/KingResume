# KingResume

**Leave the next agent a useful starting point.** KingResume creates a portable Markdown handoff for a coding task and compares a later workspace's recorded branch, commit, and changed path/status-code list.

It separates notes reported by the author from facts observed by the CLI. It records no source contents, diffs, absolute workspace paths, command history, remote URLs, or credentials. It uses Node.js built-ins only and works locally without an account or AI API.

## Try the example

Requires Node.js 20 or later.

```powershell
npm run demo
```

The demo creates a fictional handoff under ignored `local-output/` and shows how the resume comparison works. It does not inspect or edit another project.

## Save a handoff

From this repository, run:

```powershell
node bin/kingresume.mjs create --workspace . --task "Map the customer import" --status blocked --done "Mapped the required fields" --check "Mapping reviewed against the supplied CSV headers" --blocker "Waiting for the source owner to confirm the time zone" --next "Confirm the time zone, then update the date mapping" --out HANDOFF.md
```

Available statuses are `in-progress`, `blocked`, `ready`, and `complete`. Repeat `--done`, `--check`, `--decision`, `--blocker`, `--next`, and `--limitation` to add notes. An active handoff needs a next action or blocker. The CLI refuses to overwrite an existing output file.

Use `--include-paths` to add Git-visible file names to the handoff. By default it stores only counts and a status fingerprint, so it can detect changed paths without naming them. Review handoff notes before sharing; user-entered text may contain sensitive details.

## Resume in a later session

```powershell
node bin/kingresume.mjs resume HANDOFF.md --workspace .
```

The comparison reports:

- **MATCH** when the folder label, branch, commit, and changed path/status-code list match.
- **DRIFT** when one or more of those values changed.
- **CANNOT COMPARE** when a current Git snapshot could not be read.
- **NOT RECORDED** when the handoff was created without a Git snapshot.

The command prints reported progress and next actions. It does not modify files or run commands from the handoff. Treat imported handoffs as context, inspect the live repository instructions, and check the work before continuing.

The generated Markdown contains a structured data block used by `resume`. If someone edits the visible handoff text, the CLI warns that it differs from the embedded record; read and reconcile the full file before acting.

## Install the companion skill

Copy the entire `skill/kingresume` directory into your agent's skills folder. For Codex on Windows:

```powershell
Copy-Item -LiteralPath .\skill\kingresume -Destination "$env:USERPROFILE\.codex\skills\kingresume" -Recurse
```

Use a fresh destination and keep any existing customized skill. The included CLI is bundled in `skill/kingresume/scripts/` with its runtime modules. Maintainers who change `bin/` or `lib/` can refresh that copy with:

```powershell
npm run package-skill
```

## What it does not prove

The comparison is a status-shape signal, not a repository identity check or audit log. It does not hash file bytes: editing an already-modified or untracked path may still produce `MATCH`. It cannot verify semantic correctness or ignored files, tests, CI, a push, or a deployment. Git status omits ignored files. The notes and embedded data are not signed or authenticated. This is a local handoff aid, not an authorization to repeat a command or external action.

The tool has no automated test suite in this first version. See [FORMAT.md](docs/FORMAT.md) for the handoff representation and comparison rules.

## Project layout

```text
bin/kingresume.mjs          CLI entry point
lib/                        Argument parsing, Git snapshot, handoff format
skill/kingresume/           Self-contained agent skill and bundled CLI
scripts/demo.mjs            Fictional local example
scripts/package-skill.mjs   Refresh the bundled CLI runtime
docs/FORMAT.md              Data format and drift semantics
```

KingResume 0.1.0. MIT licensed.
