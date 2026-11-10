# Security & Invariant Hard-Lock Protocol

## 1. Golden Principle: Tool & Service Logic Hard-Lock
> **All business constraints, relational invariants, and security boundaries MUST be hard-locked directly in the backend tool and service layer code.**

- **Never rely solely on Frontend UI**: Disabled buttons, form validations, and hidden elements can be bypassed trivially via Postman, cURL, or devtools.
- **Never rely solely on LLM System Prompts**: AI agents can suffer from hallucinations, prompt injection, or jailbreaks. Any tool given to an agent (e.g. `generateQuestion`, `applyAuditImprovements`, `createDraft`) must validate and enforce its own invariants in code before writing to the database.

---

## 2. Insecure Direct Object Reference (IDOR) Defense
- **Entity Access Verification**: When operating on a resource (exam, submission, course, question), verify that the requesting user possesses valid ownership or role permissions (`isAdmin`, `isCreator`, or `isCourseLecturer`).
- **Relational Integrity Verification**: When updating nested or associated resources (e.g., applying improvements to questions belonging to an exam), verify that every target child entity actually belongs to the specified parent entity before performing any updates:
  ```typescript
  // Example: Verify every questionId belongs to exam.examQuestions
  const validQuestionIds = new Set(exam.examQuestions.map(eq => eq.questionId));
  for (const item of improvements) {
    if (!validQuestionIds.has(item.questionId)) {
      throw new BadRequestException(`Question ${item.questionId} does not belong to Exam ${examId}`);
    }
  }
  ```
- **Atomic Execution**: Multi-entity modifications must execute inside a `prisma.$transaction` to guarantee consistency and prevent partial state corruption.

---

## 3. Input Validation & Fast-Fail Guardrails
- **Fast-Fail Boundary**: Run guardrails (such as `TopicGuardrailsService.validateTopicScope`) directly at the controller / API layer to fast-fail malicious or out-of-scope prompts before queueing jobs into BullMQ / Redis.
- **Structural Integrity**: Enforce non-empty content, length boundaries (`assertQuestionContentLength`), and structural validity (e.g. multiple-choice questions must have at least 2 valid non-empty options).

---

## 4. Secret & Credential Hygiene
- Never commit `.env`, credentials, AWS access keys, JWT secrets, or DB passwords to Git.
- Never hardcode API keys in source files. Use `ConfigService` and environment variables.
- Review every `git diff` before committing to verify zero accidental secret leaks.
