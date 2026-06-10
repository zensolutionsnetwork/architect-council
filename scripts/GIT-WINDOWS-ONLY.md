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
