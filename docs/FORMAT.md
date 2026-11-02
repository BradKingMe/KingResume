# Handoff format

KingResume writes one Markdown file. People can read the visible sections in any editor. A final HTML comment contains a Base64-encoded JSON record so the CLI can safely recover the structured fields without interpreting ordinary Markdown.

The record uses `format: "kingresume-handoff"` and `version: 1`. It stores the creation time, task status, author-reported notes, and an optional Git snapshot. It has no signature, secret key, trusted timestamp, or authenticity guarantee. `resume` checks whether visible prose still matches the embedded record and warns when it does not. Reconcile the full Markdown before acting on a hand-edited handoff.

## Git snapshot

When the workspace is a Git worktree and Git can read it, KingResume records:

- Repository folder basename, current branch (or detached-HEAD label), and `HEAD` commit when present.
- Counts of staged, unstaged, untracked, and conflicted status entries.
- A SHA-256 fingerprint over Git status codes and paths, used only to compare status later.
- Changed path names only when `--include-paths` was requested.

The selected output file is excluded from the status comparison when it lives inside the workspace. This keeps the handoff from making its own snapshot appear dirty. Ignored files remain invisible to Git and are not included. Git optional index writes and configured file-system monitors are disabled for these local observations.

## Resume comparison

The CLI recaptures the same fields and returns:

- `MATCH`: folder basename, branch, commit, and status fingerprint are equal.
- `DRIFT`: one or more comparison fields differ.
- `CANNOT COMPARE`: a snapshot was recorded, but current Git state was unavailable.
- `NOT RECORDED`: no comparable Git snapshot was captured when the handoff was made.

The fingerprint covers status codes and paths, not file bytes. Editing an already-modified or untracked file without changing its status code or path can still produce `MATCH`. This is not proof that both directories are the same repository, that every file is tracked, or that the described task was completed. It does not query remotes, CI, hosting, deployment providers, or services.

## Size and input limits

Handoff files are limited to 1 MiB. Each note is a single normalized text line of at most 4,000 characters, task title at most 500 characters, and each note category at most 50 entries. The status scan is limited to 20,000 paths and 4 MiB of Git status output. Larger or unreadable snapshots are reported as unavailable instead of silently truncated.
