# ExamTrust — AI Developer Harness & Guidelines

> **Single Source of Truth (SSOT)** for all AI agents, pairing assistants, and automated engineering workflows (Antigravity, DeepSeek Harness, Claude Code, Codex, Cline).

---

## 1. Knowledge Graph Navigation (`.graphify/`)

This repository maintains an active knowledge graph at `.graphify/graph.json`.

### Rules & Workflow:
- **Query-First**: For broad codebase, architecture, cross-module debugging, or tracing full FE ➔ BE ➔ DB flows, first run:
  ```bash
  graphify query "<task or question>"
  # or: graphify path "<NodeA>" "<NodeB>"
  # or: graphify explain "<concept>"
  ```
  This returns a compact, relevant subgraph (3–10 files) rather than reading massive files blindly.
- **Source of Truth**: The knowledge graph is for navigation and orientation only. Source code files remain the ultimate source of truth.
- **Do Not Dump Large Reports**: Do NOT read the entire `.graphify/GRAPH_REPORT.md` on every task. Use scoped `graphify query` instead.
- **Post-Change Graph Rebuild**: After modifying code files in any working session, run:
  ```bash
  npx graphify hook-rebuild
  ```
- **Portability Check**: Before committing changes, run `graphify portable-check .graphify`. Never track local machine paths, `branch.json`, `worktree.json`, `needs_update`, or `cache/`.

---

## 2. Modular Engineering Rules

All detailed engineering rules and invariants are modularized under `.agents/rules/`:

| Rule Module | Scope & Purpose | Link |
| :--- | :--- | :--- |
| **Core Principles** | SSOT, standard language policy (EN for tech specs / VI for user UI), minimal touch | [`.agents/rules/core.md`](.agents/rules/core.md) |
| **Git Flow & Boundaries** | Branching model, SemVer, PR protocol, safe autonomous Git boundaries | [`.agents/rules/git-workflow.md`](.agents/rules/git-workflow.md) |
| **Risk-Based Verification** | 4-Tier verification protocol (Tier 1 Trivial ➔ Tier 4 Full Journey/Perf), visual proofs | [`.agents/rules/verification.md`](.agents/rules/verification.md) |
| **Security & Invariants** | Hard-lock at tool/service logic layer, IDOR prevention, input guardrails, secret hygiene | [`.agents/rules/security.md`](.agents/rules/security.md) |
| **Attack Squad** | Pre-launch multi-agent attack simulation across features, chaos, perf, and security | [`.agents/rules/attack-squad.md`](.agents/rules/attack-squad.md) |

---

## 3. Risk-Based Verification Protocol Summary

Verification intensity is proportional to risk:

- **Tier 1 (Trivial / Docs / Typo)**: Syntax & type check (`tsc`, `lint`), clean `git diff`. Visual evidence optional.
- **Tier 2 (Backend / Logic / DB / Security)**: Tier 1 + automated test suite pass 100% + live API runtime verification (HTTP status 200/201/400).
- **Tier 3 (Static UI / Layout)**: Tier 2 + live Dev Server screenshot with full Layout Shell (Sidebar 240px, Header).
- **Tier 4 (Complex User Flow / Latency)**: Tier 3 + Animated GIF or Screen Recording (`.mp4` in `docs/videos/`) embedded directly in GitHub PR description.

---

## 4. Skills Directory (`.agents/skills/`)

Specialized executable capabilities available to agents:
- **`diagnostics`**: Scientific root-cause diagnosis protocol executed in isolated read-only context.
- **`graphify`**: Codebase knowledge graph querying and maintenance.
- **`context-hygiene`**: Context tracking, handoff generation, and `/compact` coordination.
- **`sync-role-screens`**: Tracing and synchronizing UI/logic changes across Student, Lecturer, and Admin roles.
- **`playwright-runner`**: Executing, authoring, and diagnosing Playwright E2E test suites, powering Attack Squad chaos tests, and generating automated Visual Proofs.
- **`verification-visual-proof`**: Standards for live dev server captures and animated user flow recordings.
- **`release-versioning`**: SemVer bumping, changelog updates, and release tag creation.
- **`design-taste-frontend`**: Anti-slop frontend craftsmanship for landing and core flows.
- **`redesign-existing-projects`**: UI upgrades preserving existing business logic.

---

## 5. Isolated Subagent Architecture & Diagnostics Protocol

To eliminate context pollution (large stack traces, exploratory logs, multiple hypothesis traces):

```
┌────────────────────────────────────────────────────────┐
│                   MAIN AGENT                           │
│   Maintains user intent, architecture, & scope         │
└──────────────────────────┬─────────────────────────────┘
                           │ 1. Delegate issue
                           ▼
┌────────────────────────────────────────────────────────┐
│             ISOLATED DIAGNOSTICS SUBAGENT              │
│   - Fresh context window (Read-Only)                   │
│   - Executes .agents/skills/diagnostics/SKILL.md       │
│   - Inspects AST/Graphify, logs, error reproduction    │
│   - Proves root cause & rules out alternatives         │
└──────────────────────────┬─────────────────────────────┘
                           │ 2. Returns DIAGNOSTIC REPORT only
                           ▼
┌────────────────────────────────────────────────────────┐
│                   MAIN AGENT                           │
│   - Evaluates confirmed root cause & evidence          │
│   - Implements minimal-touch code fix                  │
│   - Executes Risk-Based Verification                   │
└────────────────────────────────────────────────────────┘
```

### Harness Implementations:
- **Claude Code**: Uses `context: fork` configured in `.claude/agents/diagnostics.md`.
- **Antigravity / DeepSeek Harness**: Uses `invoke_subagent` with the `research` or dedicated read-only subagent.
- **Codex**: Delegates to read-only sub-session with the `diagnostics` prompt.

---

## 6. Session Hygiene & Handoff
- When a task or PR is completed, summarize changes into a run document: `docs/runs/<YYYY-MM-DD>-<ticket>.md`.
- AI agents cannot autonomously invoke `/compact` (it is an IDE UI command). Prompt the user to trigger `/compact` when context grows large or between distinct tickets.
