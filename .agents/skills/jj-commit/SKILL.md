---
name: jj-commit
description: Create logical, well-described commits from pending changes in a Jujutsu repository. Use whenever the user asks to commit, write commit messages, or organize changes into commits with jj. Never push.
---

# Jujutsu Commit

Review and commit pending work immediately. Do not ask for confirmation unless a risky untracked file is found.

1. Inspect in parallel: `jj status`, `jj diff`, and `jj log -n 5`. Read the diff and inspect all untracked files to understand the changes and match the repository's commit style.
2. Group related changes into separate commits. Include all untracked files except the risky patterns below. If any risky untracked paths are present, show a warning and stop before committing; ask the user whether to include them.
3. Show the commit plan, then execute it without waiting. Use `jj commit -m "<Imperative sentence-case subject>"` for one group. When changes need splitting, use `jj commit -m "<subject>" -- <paths...>` to put those paths in the current commit; jj leaves the remaining changes in a new working-copy commit. Repeat for each group, checking `jj status` and `jj diff` between commits so each description matches its contents. Use `jj commit --interactive -m "<subject>"` when a group cannot be expressed cleanly as paths. Do not use Git staging commands.
4. Never push. After committing, run `jj status` and `jj log -n 5`, then report the commits and any remaining changes.

Treat these untracked paths as risky: `.claude/`, `.env` or `.env.*`, `*.key`, `*.pem`, `*.p12`, `*.pfx`, `node_modules/`, `vendor/`, `.venv/`, `*.log`, `dist/`, `build/`, `.next/`, and `__pycache__/`. Exclude them by default; ask before proceeding with any commit plan that contains them.
