# Core Rules & Principles

## 1. Single Source of Truth (SSOT)
- `AGENTS.md` at the project root is the central index and single source of truth for all AI agent behaviors, workflows, and standards across all developer harnesses (Antigravity, DeepSeek Harness, Claude Code, Codex, Cline).
- Specialized harness configurations (`.claude/`, `.codex/`, `.clinerules`) act as thin adapters that point to or extend the root standards, never overriding core invariants.

## 2. Standard Language Policy
To eliminate prompt drift, hallucinations, and fragmentation across multiple AI engines:
- **Technical Documentation & Agent Instructions**: **English** is the mandatory language for all rules (`.agents/rules/*`), skills (`.agents/skills/*`), pull request templates, and technical architecture specifications (`docs/architecture/*`).
- **User-Facing Product & Business Requirements**: **Vietnamese** is used for end-user UI strings, business-facing descriptions, educational context, and Vietnamese locale data.
- **Git Commits & Pull Requests**: Conventional Commits in English (e.g. `feat(ai): ...`, `fix(security): ...`). PR bodies may summarize Vietnamese business impact while preserving technical precision.

## 3. Minimal Touch & Codebase Integrity
- **Minimal Invasive Changes**: Modify only the necessary files and lines required to implement the feature or fix the bug. Do not reformat, re-indent, or rearrange unrelated code.
- **Documentation Integrity**: Preserve existing comments, docstrings, and type definitions unless specifically requested to update them.
- **Dependency Hygiene**: Never add external NPM or Python packages without explicit justification. Prefer existing standard libraries and established project utilities.

## 4. Context Hygiene & Compaction
- Keep conversation contexts compact and focused on the current deliverable.
- When a task or pull request is complete, record a structured handoff document in `docs/runs/<YYYY-MM-DD>-<ticket>.md`.
- Agents must never claim to have executed `/compact` autonomously (it is an IDE UI command). Instead, write the handoff document and prompt the user to trigger `/compact`.
- Details: refer to `context-hygiene` skill in `.agents/skills/context-hygiene/SKILL.md`.
