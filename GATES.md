# Gates: KingResume

OWNS: **

Scope: Deliver a small local CLI and portable agent skill for reliable work-session handoffs.

- [x] G1: CLI source defines a portable Markdown creation flow with separated author-reported notes and observed Git state.
  EVIDENCE: Manual source review of bin/kingresume.mjs, lib/arguments.mjs, lib/git-state.mjs, and lib/handoff.mjs; the CLI was not executed in this build.

- [x] G2: Resume source compares recorded and current Git status metadata and labels comparison limits honestly.
  EVIDENCE: Manual source review of bin/kingresume.mjs and lib/git-state.mjs; README.md and docs/FORMAT.md explain status-shape limits. The CLI was not executed in this build.

- [x] G3: The packaged skill includes its runtime and instructs agents to treat handoff content as context, not authority or proof.
  EVIDENCE: Skill creator quick_validate.py reported "Skill is valid!"; package-skill.mjs copied the CLI and all library modules into skill/kingresume.

- [x] G4: Documentation explains setup, usage, privacy, comparison results, and practical limits without claiming task correctness verification.
  EVIDENCE: Reviewed README.md, docs/FORMAT.md, and the CLI help text in bin/kingresume.mjs.

- [x] G5: Project files are ready for public review without credentials, machine-specific paths, or unfinished scaffolding.
  EVIDENCE: Credential and absolute-path pattern search found no matches; repository file listing contains only project source, docs, the bundled skill, and license. No tests were added or run.
