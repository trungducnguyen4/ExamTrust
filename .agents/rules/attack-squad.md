# Rule: Multi-Agent Pre-Launch Attack Squad

## 1. Core Philosophy
Before any major release, production launch, or high-stakes examination event in **ExamTrust**, the full system stack (Next.js Frontend + NestJS Backend + Prisma / PostgreSQL Database + Redis / BullMQ) must undergo an automated simulation run by the **4-Agent Pre-Launch Attack Squad**.

---

## 2. The 4 Attack Angles

```
┌────────────────────────────────────────────────────────┐
│             PRE-LAUNCH ATTACK SQUAD                    │
├──────────────────────────┬─────────────────────────────┤
│ 1. Features              │ 2. Bugs (Chaos & Edge)      │
│    Run every user flow   │    Explore abnormal states  │
├──────────────────────────┼─────────────────────────────┤
│ 3. Performance           │ 4. Security                 │
│    Profile slow paths    │    Probe inputs, permissions│
└──────────────────────────┴─────────────────────────────┘
```

### 1. 🧭 Feature Navigator
- Execute core end-to-end user journeys for both student and lecturer roles:
  - **Student Flow**: Login ➔ Join Exam Room ➔ Take Exam & Answer Questions ➔ Submit ➔ View Results.
  - **Lecturer / Admin Flow**: Create Exam & Questions ➔ Launch & Monitor Integrity Flags ➔ Review / Grade Submissions ➔ Export Gradebook.

### 2. 🐒 Chaos Monkey & Edge Hunter
- Probe race conditions and abnormal client behaviors:
  - Rapid double-submission clicks (verifying idempotency key locks).
  - Malformed payload submissions, zero-length files, or oversized inputs.
  - Inspect UI boundary responsiveness under extreme window resize or empty data states.

### 3. ⚡ Performance Profiler
- Measure critical path latency: submission sync, question retrieval (Target: < 500ms p95).
- Verify database query efficiency (detecting and eliminating N+1 regressions).
- Inspect Next.js bundle footprint and load times.

### 4. 🛡️ Security Auditor
- **IDOR & Exam Impersonation**: Student A cannot access or tamper with Student B's submission answers via URL or API ID tampering.
- **Data Protection & Guardrails**: Validate domain boundary guardrails and input sanitization.
- **Credential & Secret Protection**: Zero leaks of AWS keys, JWT secrets, or DB credentials.

---

## 3. Release Gate Policy
- 🔴 **BLOCK**: Integrity vulnerability, exam impersonation, secret leak, or exam submission crash.
- 🟡 **WARNING**: Minor UI glitch or latency exceeding soft threshold without breaking flow.
- 🟢 **PASS**: All 4 attack angles verified cleanly with zero regressions.
