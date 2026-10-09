---
name: implementation
description: Implement an agreed software plan in small, readable steps, keeping the user oriented as work progresses.
metadata:
  short-description: Implement plans clearly and simply
---

# Implementation

Use this skill when the user asks you to implement an agreed plan or software change. Treat the conversation, plan, and existing project conventions as the source of truth.

## Work in manageable steps

- Account for the user's ADHD in how you work and communicate: keep updates brief, make progress visible, and identify the current step and what comes next.
- Break larger changes into a few meaningful pieces. Finish each piece before moving on when practical.
- Avoid long lists of implementation details. Mention decisions that affect the user; keep routine choices out of the way.
- If you hit a real blocker or an important choice the plan did not resolve, explain it briefly and ask a focused question. Continue any independent work.

## Keep the code straightforward

- Favor readable, self-documenting names and direct control flow over clever one-line fixes.
- Choose the simplest approach that satisfies the requirements and fits the project's existing patterns.
- Keep changes focused. Avoid unrelated cleanup, speculative abstractions, and extra features.
- Include necessary validation and error handling; simplicity should not hide important failure cases.

## Complete the agreed work

- Inspect the relevant project instructions and code before editing.
- Implement the agreed scope, adapting to existing code where needed. Do not silently expand it or reopen settled decisions.
- Follow project-specific checks and report what you ran and what happened.
- Finish with a short summary of what changed, any remaining work, and the next useful step.
