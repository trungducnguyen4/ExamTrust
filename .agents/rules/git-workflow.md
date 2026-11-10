# Git Flow & Release Protocol

## 1. Branching Model

```
[Feature/Bugfix Branches]       [develop]               [Release Branches]         [UAT/release]      [Production/main]
       (EX-xxx)                 (DEV Env)                    (SemVer)                (UAT Env)            (PROD Env)
          │                         │                           │                        │                     │
      (A) ├────────────────────────>│ (A)                       │                        │                     │
          │                         │                           │                        │                     │
      (B) ├────────────────────────>│ (AB)                      │                        │                     │
          │                         │                           │                        │                     │
      (C) ├────────────────────────>│ (ABC) ───────────────────>│ (v1.0.0) ─────────────>│ (ABC) ─────────────>│ (main: v1.0.0)
          │                         │                           │                        │                     │
      (D) ├────────────────────────>│ (ABCD)                    │                        │                     │
          │                         │                           │                        │                     │
      (E) ├────────────────────────>│ (ABCDE)                   │                        │                     │
          │                         │                           │                        │                     │
 [Critical Bugfix / Hotfix (F)]     │                           │                        │                     │
      (F) ├────────────────────────────────────────────────────>│ (v1.0.1 - ABCF) ───────>│ (ABCF) ────────────>│ (main: v1.0.1)
          │                         │                           │                        │                     │
          └────────────────────────>│ (ABCDEF) ────────────────>│ (v1.1.0 - ABCDEF) ────>│ (ABCDEF) ──────────>│ (main: v1.1.0)
          (Back-merge to develop)   │                           │                        │                     │
```

- **Feature / Bugfix Branches (`EX-xxx` or `feature/EX-xxx`, `bugfix/EX-xxx`)**:
  - Name MUST correspond to the Jira Issue / Ticket: e.g. `feature/EX-001`, `bugfix/EX-055`.
  - Branched off `develop` (or `main` when `develop` is synced) for new features or standard fixes.
  - Must pass automated tests, lint, and verification protocol before PR merge.
- **`develop` Branch (DEV Environment)**:
  - Continuous integration for internal development. Merges automatically trigger DEV deployment.
- **Release Branches (`release/vX.Y.Z` or `v1.0.0`)**:
  - Named following Semantic Versioning (SemVer: `vMAJOR.MINOR.PATCH`).
  - Branched from `develop` when the feature milestone is complete.
- **Critical Hotfix Protocol (Branch F in diagram)**:
  - Critical production bugs (e.g. crash on startup, critical security breach):
    1. Create a hotfix branch (`hotfix/EX-xxx`).
    2. Fix directly on the release patch without pulling unready develop changes.
    3. Deploy to UAT -> Production (`main`).
    4. **MANDATORY BACK-MERGE**: Immediately back-merge the hotfix into `develop` to prevent regression in future releases.
- **`main` / `master` (Production Environment)**:
  - Stable production release. Every merge must have a Git Tag in SemVer format (`v1.x.x`).

---

## 2. Git Automation Boundaries for AI Agents

To balance velocity and safety, AI Agents operate under strict boundaries:

### ✅ Permitted (Autonomous)
- Create and switch to new feature/bugfix branches matching the ticket pattern (`feature/EX-xxx`).
- Stage and commit code with standard Conventional Commit messages (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`).
- Push working feature branches to remote (`git push origin <branch-name>`).
- Open Pull Requests on GitHub referencing the issue ID and formatted with the standard PR template.

### ⛔ Strictly Prohibited (Requires Explicit Human Authorization)
- NEVER push directly to protected branches (`main`, `master`, `production`, `develop`).
- NEVER use force push (`git push --force` or `--force-with-lease`).
- NEVER merge Pull Requests autonomously without human confirmation or explicit review approval.
- NEVER delete remote branches or tags.

---

## 3. Pull Request (PR) Specification Template

Every pull request created by an agent MUST follow this format:

```markdown
### 📌 PR: [EX-xxx] <type>(<scope>): <Concise summary>

#### 1. PR Type
- [ ] Feature (New capability targeting `develop` / `main`)
- [ ] Bugfix (Defect fix targeting `develop` / `main`)
- [ ] Refactor (Code or architecture restructuring)
- [ ] Critical Hotfix (Production emergency patch with back-merge required)

#### 2. Problem & Root Cause
- **Ticket / Issue ID:** EX-xxx
- **Symptom:** [Detailed description of the issue or requirement]
- **Root Cause:** [Technical explanation of why the defect occurred]

#### 3. Solution & Key Changes
- **Files Changed:**
  - `path/to/file`: [Specific changes made]
- **Summary:** [Architectural overview of the implementation]

#### 4. Verification Protocol (Risk-Based Tiered Proof)
- [x] **Tier Applied:** [Tier 1 / Tier 2 / Tier 3 / Tier 4]
- [x] **Tests:** [TypeScript compilation, Jest/Vitest suite results, coverage]
- [x] **Runtime:** [Actual API HTTP status, latency, database query inspection]
- [x] **Visual Evidence:** [Screenshot / Animated GIF / Video MP4 link — required for Tier 3 & 4]
  *(Markdown Image syntax: `![Caption](https://raw.githubusercontent.com/trungducnguyen4/ExamTrust/<branch>/docs/screenshots/<file>.png)`)*
- [x] **Confidence Level:** [High / Medium / Low] — list verified and unverified boundaries.

#### 5. Target & Back-merge Plan
- **Source Branch:** `feature/EX-xxx`
- **Target Branch:** `develop` (or `main`)
- **Back-merge required:** [Yes / No]
```
