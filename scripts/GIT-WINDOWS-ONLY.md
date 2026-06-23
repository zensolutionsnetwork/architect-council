# ⚠️ Git on this repo: WINDOWS ONLY

Running git against this working tree from BOTH the Linux (Cowork/WSL/sandbox) side and
Windows corrupts the index — phantom staged-deletions of whole directories, stale
`index.lock`, divergent status views. Proven root cause of the recurring "corrupt repo"
incidents (2026-06-09 session; memory: `git-cross-os-hazard`).

Rules:
- ALL git writes (status used for decisions, add, commit, reset, checkout, push) run from
  **Windows** (Desktop Commander / PowerShell).
- The Linux sandbox is **read-only inspection only**: `cat`, `grep`, `git cat-file -p HEAD:…`
  (object reads are safe; index/worktree operations are not).
- If the index looks broken: from Windows, delete `.git\index.lock`, then `git reset`.

## Commit-message quoting — use `-F msgfile` (ratified meeting 2026-06-22)

A commit message containing inner quotes, parentheses, commas, or newlines folded into an inline
`git commit -m "..."` (especially through `cmd /c` or a nested PowerShell wrapper) is a **silent
failure mode**: the shell parses the message words as pathspecs and the commit does NOT run, surfacing
only as confusing pathspec errors or, worse, no error at all. Hit live twice on 2026-06-22.

Rule: write the message to a UTF-8 (ASCII-only) file and commit with **`git commit -F <msgfile>`**,
then **verify the operation out-of-band** — `git rev-parse HEAD == origin/main` after push (do not
trust the shell's exit code when quoting is involved). Bind the truth-signal to the operation, never
to a fragile inline invocation. (Same class as Nova's no-silent-swallow finding `c8aca08d`.)
