---
name: implementation-planning
description: Turn an ongoing conversation about a software change into a clear, practical implementation plan before coding begins.
metadata:
  short-description: Plan readable, simple implementations
---

# Implementation planning

Use this skill when the user asks to plan implementation after discussing a feature, bug fix, or other software change. Treat the conversation and the current repository as the source of truth.

## Make the plan easy to follow

- Account for the user's ADHD in how you present and pace the plan. Keep it easy to scan and hold in mind: use short sections, plain language, and a clear next step. Avoid dense paragraphs, long undifferentiated checklists, and unnecessary choices.
- For larger work, break the plan into a few small milestones. Make progress visible by stating what is decided, what comes next, and what still needs the user's input.
- Give enough detail to make the plan useful, but do not front-load implementation minutiae. Offer deeper detail when it is needed or requested.
- Keep the user's stated readability preferences in view: prefer clear, self-documenting names, straightforward control flow, and focused changes over clever one-line fixes.
- Apply Occam's razor: choose the simplest approach that satisfies the requirements and fits the existing project. Do not omit necessary validation, error handling, or edge cases in the name of simplicity.

## Build a grounded plan

1. Summarize the intended outcome in one or two sentences, using the decisions already made in the conversation.
2. Inspect relevant project instructions and the smallest useful set of existing code, tests, and patterns. Do not assume a new architecture when the project already has a suitable one.
3. Present a short sequence of concrete implementation steps. Group related work so each step has a clear purpose and result.
4. Mention only material risks, dependencies, and unresolved decisions. Ask a concise question when an unresolved decision would change the implementation; otherwise state a reasonable assumption.
5. End with the immediate next step or the specific decision needed to proceed.

Planning does not itself authorize implementation. Stop after presenting the plan and let the user direct the next action.
