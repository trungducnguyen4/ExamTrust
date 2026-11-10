---
name: diagnostics
description: >-
  Hypothesis-driven root cause diagnosis for runtime failures, failing tests, state desynchronization,
  and anomalous behavior in ExamTrust (NestJS, Prisma, BullMQ, Redis, Next.js). Operates strictly in
  an isolated, read-only context to eliminate context pollution, returning only a structured Diagnostic Report.
whenToUse: >-
  Use whenever encountering an unexplained bug, server crash, database transaction deadlock, BullMQ queue stalling,
  IDOR anomaly, unexpected UI regression, or complex multi-layer failure. MUST be invoked in an isolated
  subagent or forked context before attempting code modifications.
---

# Diagnostics Skill — Hypothesis-Driven Root Cause Investigation

## 1. Core Principles

### 🔒 Invariant: Read-Only Investigation
The Diagnostics agent is **STRICTLY READ-ONLY**.
- **PROHIBITED**: Modifying source code, creating production records, staging git changes, committing, or pushing.
- **PERMITTED**: Reading files, running non-destructive tests (`npm test`, `jest`), checking runtime API endpoints, querying read-only database states, and analyzing logs.
- The investigation must prove the root cause **before** the Main Agent writes a single line of fix.

### 🫧 Context Isolation
Complex bugs produce voluminous stack traces, large grep outputs, and multiple candidate hypothesis traces. Running these inside the Main Agent causes **context pollution** and leads to hallucination or dropped constraints.
- Always delegate diagnostics to an **isolated subagent** (or Claude `context: fork`).
- The subagent conducts the exhaustive probe in its fresh context and returns **ONLY** the standardized `DIAGNOSTIC REPORT` to the Main Agent.

---

## 2. The 5-Stage Scientific Debugging Protocol

```
┌────────────────────────────────────────────────────────────────────────┐
│                   SCIENTIFIC DIAGNOSTICS PROTOCOL                      │
├─────────────────┬──────────────────────────────────────────────────────┤
│ 1. Reproduce    │ Isolate the minimal trigger reproducing the failure  │
├─────────────────┼──────────────────────────────────────────────────────┤
│ 2. Hypothesize  │ Formulate 2-3 falsifiable technical hypotheses        │
├─────────────────┼──────────────────────────────────────────────────────┤
│ 3. Instrument   │ Probe logs, AST relationships, or targeted assertions│
├─────────────────┼──────────────────────────────────────────────────────┤
│ 4. Validate     │ Disprove alternatives and confirm single root cause  │
├─────────────────┼──────────────────────────────────────────────────────┤
│ 5. Synthesize   │ Deliver structured report with minimal-touch remedy  │
└─────────────────┴──────────────────────────────────────────────────────┘
```

### Stage 1: Reproduce & Minimize
1. Identify the exact trigger: HTTP method, payload, route parameter, or user UI sequence.
2. Determine failure boundaries: Is it deterministic or a concurrency race condition (e.g. BullMQ worker vs DB transaction lock)?
3. Strip away irrelevant payload fields until the minimal failing case is isolated.

### Stage 2: Hypothesize
1. Never guess blindly. Formulate at least two competing hypotheses:
   - *Hypothesis A (e.g. Relational integrity or missing foreign key check)*
   - *Hypothesis B (e.g. State-machine transition conflict or stale cache)*
   - *Hypothesis C (e.g. Asynchronous race condition or unhandled promise rejection)*
2. Each hypothesis must be **falsifiable** with a specific code check or log assertion.

### Stage 3: Instrument & Inspect (ExamTrust Stack)
Inspect the relevant subsystem using specialized tools:
- **Architecture & Dependency Flow**: Query `.graphify/graph.json` via `graphify path <source> <target>` to trace cross-boundary dependencies between FE components, NestJS controllers, services, and Prisma schemas.
- **Database & Transactions**: Inspect Prisma schema relations, transaction boundaries (`prisma.$transaction`), and cascade rules.
- **Async Queues & Redis**: Inspect BullMQ job definitions in `BE/src/queue/processors/`, payload serialization, and Redis locks.
- **Frontend State**: Check React hook dependencies (`useEffect`, `useCallback`), double-fetch triggers, and state synchronization across role screens.

### Stage 4: Validate with Evidence
1. Collect unambiguous evidence: specific line numbers, mismatching types, or conflicting lifecycle states.
2. Disprove the alternative hypotheses using counter-evidence.
3. Confirm the primary root cause.

### Stage 5: Synthesize Diagnostic Report
Synthesize findings into the mandatory 9-part report format.

---

## 3. Mandatory Output Format: `DIAGNOSTIC REPORT`

The subagent must conclude its investigation by returning strictly the following report:

```markdown
# 🔬 DIAGNOSTIC REPORT

### 1. Problem Summary
[One-sentence technical summary of the failure, error code, or unexpected behavior]

### 2. Reproduction Steps & Minimal Case
- **Trigger**: [Endpoint / UI Action / Test command]
- **Input Payload**: [Minimal failing payload or parameters]
- **Observed Behavior**: [Actual error message, HTTP status, or corrupted state]
- **Expected Behavior**: [What should have happened according to specs]

### 3. Evidence Collected
- **Logs / Stack Traces**: [Key log excerpt or error trace with timestamps]
- **Data State**: [Database record snapshot or memory state before/after trigger]
- **Component / Service Flow**: [Trace path identified via Graphify or call stack]

### 4. Root Cause Analysis
[Detailed technical explanation of the fundamental mechanism that caused the defect. Must explain WHY it happened, not merely WHAT happened.]

### 5. Alternative Hypotheses Evaluated & Disproved
- *Hypothesis 1*: [Why this was initially plausible and what evidence disproved it]
- *Hypothesis 2*: [Why this was initially plausible and what evidence disproved it]

### 6. Affected Files & Line Numbers
- [`path/to/file.ts`](file:///absolute/path/to/file.ts#L12-L34): [Role of this file in the defect]

### 7. Recommended Minimal-Touch Fix
- **Remedy Strategy**: [How to resolve the defect cleanly with minimal code changes]
- **Draft Solution**:
```typescript
// Proposed snippet adhering to existing patterns
```

### 8. Regression Prevention Tests
- **Test Scenarios Needed**: [List of unit or integration test cases to guarantee zero regression]
- **Edge Cases**: [Boundary conditions to verify during validation]

### 9. Confidence Level
- **Level**: `High` | `Medium` | `Low`
- **Justification**: [Explicit statement of what was conclusively proven vs any remaining unknowns]
```
