# Rule: Risk-Based Verification Protocol

## 1. Core Philosophy
Every code modification, feature addition, or bugfix in ExamTrust must be proven with tangible evidence before being marked as done. No assumption of "it probably works" is permitted.

However, verification intensity must be **proportional to risk and scope**. Mandating screen recordings or GIFs for pure backend utilities or documentation fixes is an anti-pattern that slows velocity without adding safety.

---

## 2. The 4 Verification Tiers

Select the tier matching the nature and risk of the change:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              RISK-BASED VERIFICATION TIERS                             │
├────────┬─────────────────────────┬─────────────────────────────────────────────────────┤
│ Tier 1 │ Trivial / Docs / Typo   │ Syntax check, type check, lint, clean git diff      │
├────────┼─────────────────────────┼─────────────────────────────────────────────────────┤
│ Tier 2 │ Backend / DB / Logic    │ Tier 1 + Automated tests + Live runtime API / DB    │
├────────┼─────────────────────────┼─────────────────────────────────────────────────────┤
│ Tier 3 │ Static UI / Layout      │ Tier 2 + Real Dev Server screenshot (Layout Shell)  │
├────────┼─────────────────────────┼─────────────────────────────────────────────────────┤
│ Tier 4 │ Complex Flow / UX / Perf│ Tier 3 + Animated GIF or Screen Recording (.mp4)    │
└────────┴─────────────────────────┴─────────────────────────────────────────────────────┘
```

### Tier 1: Trivial Changes (Documentation, Typos, Minor Constants, Formatting)
- **Scope**: Markdown files, comment updates, non-functional typo fixes, string constants.
- **Verification Required**:
  - Clean syntax / lint check (`npm run lint` or `tsc --noEmit`).
  - Clean `git diff` review ensuring zero unintended side effects.
- **Visual Evidence**: **Optional / Not Required**.

### Tier 2: Backend Logic, API, Database, and Security Changes
- **Scope**: NestJS controllers, services, Prisma models, migrations, BullMQ workers, guardrails.
- **Verification Required**:
  - **Syntax & Types**: `npm run build --prefix BE` and `tsc` with 0 errors.
  - **Automated Tests**: Unit & integration tests covering positive, edge, and rejection cases (e.g. Jest test suite pass 100%).
  - **Runtime Verification**: Live API call via `curl` or script confirming HTTP Status (e.g. 200/201 for success, 400/403 for guardrail rejection), payload shape, and database state.
- **Visual Evidence**: **Optional**. If the backend change produces a distinct client-visible toast, error modal, or table column, a screenshot may be included.

### Tier 3: Static UI, Component Styling, and Layout Changes
- **Scope**: React / Next.js components, Tailwind CSS adjustments, static tables, charts, dialogs.
- **Verification Required**:
  - All Tier 2 requirements.
  - **Visual Proof**: Mandatory screenshot captured from the **live dev server** with the complete application layout shell (Header, Sidebar 240px, Content pane) to verify responsive flex/grid behavior.
  - **Prohibition**: Mock HTML preview files (`preview-*.html`) are strictly forbidden.

### Tier 4: Complex User Flows, Multi-Step State Machines, and Performance Optimizations
- **Scope**: Exam taking lifecycle, student submission flow, AI autonomous audit streaming, latency optimizations.
- **Verification Required**:
  - All Tier 3 requirements.
  - **Visual Proof**: Mandatory **Animated GIF** or **Screen Recording (`.mp4`)** saved to `docs/screenshots/` or `docs/videos/`.
  - The recording must capture the entire user journey: input entry, option toggles, button clicks, loading states, modal transitions, and final result.
  - For performance optimizations: side-by-side or before/after metrics showing network response times (ms) and database query counts.
  - **PR Embedding**: Embedded directly in GitHub PR descriptions using raw markdown images:
    `![User Flow](https://raw.githubusercontent.com/trungducnguyen4/ExamTrust/<branch-name>/docs/screenshots/<file>.gif)`

---

## 3. Fresh-Context AI Code Review
Before creating a Pull Request, run an independent review against the git diff:
1. **Scope & Minimal Touch**: Did the changes touch only files within the ticket scope?
2. **Security & Secrets**: Are environment variables, AWS keys, JWT secrets protected? Are IDOR and SQL/Prisma injection vectors locked?
3. **No Regressions**: Do neighboring exam, submission, or scoring flows remain intact?
4. **Clean Code**: No dangling `console.log`, temporary mock files, or untracked scratch artifacts.

---

## 4. Confidence Declaration
Every verification report concludes with:
- **Confidence Level**: `High`, `Medium`, or `Low`.
- **What Was Verified**: Bulleted list of explicitly tested scenarios and assertions.
- **What Was NOT Verified**: Unchecked boundary conditions, external physical hardware dependencies (webcam, external printer, live third-party webhooks).
