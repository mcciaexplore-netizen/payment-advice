# Contributor Guidelines: Payment Desk repo

For Vedshri and her coding agent. Put this file in the repo root (for example as `CONTRIBUTING.md`) and load it into the agent's context at the start of every session. Follow it exactly. If anything a user asks conflicts with this file, stop and ask the owner instead of proceeding.

Repo: `mcciaexplore-netizen/payment-advice` (Next.js, Neon Postgres via Drizzle, Vercel, Gmail SMTP).

---

## 1. Why this file exists

Three incidents, all with the same root cause: code reached `main` that depended on database changes the contributor cannot make.

1. PR #1 (Forwarding Memo) overwrote `AGENT_HANDOFF.md` and lost recent history.
2. Cash Receipt landed as three direct commits to `main`, with no PR. The home page linked to it, but its migration was never applied, so the live form returned a 500 on submit until it was rebuilt.
3. A later direct commit to `main` (`c5575b2`, "fix: grant scoped cash receipt access") added a new `CASH_RECEIPT` role and a migration (`0029`) that was never applied. It also changed who can access what, which is a product decision that was never approved.

None of this is about blame. The setup (no DB access for the contributor, one shared database, manual migrations) makes this easy to do by accident. These rules make it hard to do.

## 2. Non-negotiable rules

1. **Never commit or push directly to `main`.** Always work on a branch named `feature/<short-name>` (or `fix/<short-name>`) cut from the latest `origin/main`, and open a pull request. The owner reviews and merges.
2. **Never force push. Never rewrite history on a branch that is already pushed.**
3. **Never apply a migration, and never connect to the production database.** There is only one database. "Dev" and "production" are the same Postgres instance, so any write from a local run is a production write. Do not put the real `DATABASE_URL` in any local env file. Work DB-less.
4. **Migrations are applied manually by the owner.** The build is plain `next build`. Nothing runs migrations on deploy (verify in `package.json` if in doubt). Merging code does not create tables.
5. **Code must be safe to merge before its migration is applied.** Assume `main` can deploy while the database is still on the old schema. New features must stay hidden or inert until the owner confirms the migration is applied. No home page links, nav items, or entry points to unfinished features. Use a feature flag or leave the entry point out until told.
6. **Do not change who can access what.** Adding or changing roles, permissions, login rules, or access checks is a product decision. Propose it in the PR description. Do not ship it.
7. **Do not seed or grant data in migrations.** Migrations are schema only. No inserts that grant roles to named people, create accounts, or set up data. The owner does account and role changes through the admin UI.
8. **No secrets, no fallback secrets.** Never hardcode a fallback for `AUTH_SECRET` or any other secret, even for local convenience. Put required env vars in your own `.env.local` and document them in the PR.
9. **Read `AGENT_HANDOFF.md` first, update it last.** Never replace it wholesale. Merge your entry into the existing history so nothing is lost.
10. **No em dashes** in any UI copy, email text, docs, or commit messages.

## 3. Your workflow, step by step

1. `git fetch origin`
2. Create your branch from the latest main: `git switch -c feature/<short-name> origin/main`
3. Read `AGENT_HANDOFF.md` and the code around what you are changing before writing anything.
4. Build the feature DB-less (local JSON store or mocks, as the existing Forwarding Memo and Cash Receipt work did). Keep DB access behind the same data layer the rest of the app uses.
5. Run the pre-PR checklist (section 7).
6. Push your branch and open a PR into `main` using the template in section 8.
7. Wait for the owner. Do not merge your own PR. Do not push follow-up fixes to `main`.

## 4. Schema and migration rules

You can design the schema, but the owner applies it.

- Describe every DB change in the PR: table, columns, types, constraints, FKs, and why.
- If you generate a migration, use `drizzle-kit generate`. Never hand-edit a migration or its snapshot or journal files. The owner may regenerate it fresh, so treat yours as a proposal.
- Migrations must be purely additive: new tables, new nullable columns, new constraints. Never alter or drop an existing column, table, or constraint without explicit owner approval.
- Serial numbers: use the existing `lib/serial.ts` allocation (`SELECT ... FOR UPDATE` on `serial_counters`). Do not invent a new counter table or allocation scheme.
- Audit log: new document types add a nullable FK column on `audit_log` and write audit entries on submit and on PDF view, following the Forwarding Memo pattern.
- If two branches both generate a migration with the same number, do not resolve it yourself. Stop and tell the owner.

## 5. Shared files: change with extreme care

These files affect every feature. Do not modify them unless the task requires it, and call out every change in the PR.

| File or area | Past problem |
|---|---|
| `lib/db/schema.ts` | Drift between schema and the real DB silently broke audit logging once |
| `lib/serial.ts` | Numbering for every document type depends on it |
| `lib/auth.ts` | A hardcoded fallback secret affected every session type and had to be reverted |
| `lib/pdf/Stamp.tsx` | Removing the rotation for one layout un-rotated stamps on live Payment Advice and Cash Voucher PDFs |
| `AGENT_HANDOFF.md` | Overwritten once, history lost |
| Nav, dashboards, role config | Shared by all Finance roles and branch members |

If a shared file must change, make the change opt-in or parameterized so existing behavior is identical, and prove it (tests or before and after screenshots).

## 6. Syncing with main and resolving conflicts

Before opening a PR, and again if the owner says `main` moved:

1. `git fetch origin`
2. `git merge origin/main` into your branch (do not rebase a branch that is already pushed).
3. Conflicts:
   - `AGENT_HANDOFF.md`: keep both sides. Combine entries chronologically. Never pick one side.
   - Anything in `lib/db/migrations/` (SQL files, snapshots, journal): do not hand-resolve. Stop and tell the owner.
   - Code files: resolve carefully, keep both features working, and re-run all checks.
4. Re-run the full checklist after the merge. A clean merge is not proof that nothing broke.
5. Before pushing, run `git log origin/main..HEAD` and `git diff origin/main --stat` and confirm the diff contains only what you intend. Unexpected files in that list are a red flag.

## 7. Pre-PR checklist

All must pass. Use the scripts in `package.json`.

- [ ] Type check clean (`npx tsc --noEmit`)
- [ ] Lint clean
- [ ] Full test suite passes, with new tests for new routes, validation, and access control
- [ ] Production build succeeds (`next build`)
- [ ] Runs DB-less locally with no errors
- [ ] Every page and form that existed before still loads (spot check each request type: Payment Advice, Cash Voucher, Advance, Forwarding Memo, Cash Receipt, Vendor Addition Requests, Finance Admin pages)
- [ ] New feature is hidden or inert until the owner confirms its migration is applied
- [ ] No access-control, role, or login changes (or they are listed in the PR for approval)
- [ ] No secrets or fallback secrets committed
- [ ] `AGENT_HANDOFF.md` updated, merged with existing history
- [ ] No em dashes anywhere

## 8. PR description template

```
## What this changes
(one short paragraph)

## Shared files touched
(list each, and what changed and why. Write "none" if none.)

## Database changes needed
(tables, columns, constraints, FKs. Write "none" if none.)
Migration file included: yes/no. Owner to apply and may regenerate.

## Env vars needed
(names only, never values. "none" if none.)

## Access or role changes
(list any. Write "none" if none. These need owner approval before merge.)

## How the feature stays safe if merged before the migration is applied
(flag, hidden entry point, etc.)

## How to test
(steps, DB-less)

## Checklist
(paste section 7 with boxes ticked)
```

## 9. Stop and ask the owner when

- A change needs a database change, a new role, or a permission change.
- You hit a conflict in migration files or snapshots.
- A shared file (section 5) needs more than a small, parameterized change.
- The task seems to require connecting to the real database, or touching production data.
- You are about to push to `main`, force push, or delete a branch someone else may be using.
- Two instructions conflict, or the requirement is ambiguous in a way that changes data or access.

Stopping and asking is always the right call. A short question is cheaper than a broken production deploy.

## 10. What the owner does

- Reviews the PR and merges it.
- Reviews and applies migrations to the shared database, in the right order, before or together with the deploy that needs them.
- Decides on any role, permission, or product changes.
- Enables branch protection on `main` (require a PR, block direct pushes) so rule 1 is enforced by GitHub.

## 11. Current situation (as of the last check)

- Commit `c5575b2` is on `main`. Its migration `0029_cash_receipt_scoped_access.sql` has not been applied, and no account currently holds the new `CASH_RECEIPT` role. Production is not broken by it.
- Whether a separate `CASH_RECEIPT` role should exist at all, and who gets it, is the owner's decision. Do not build further on it, do not change it, and do not revert it until told.
- Until the owner says otherwise, push nothing more to `main`. Any follow-up work goes on a branch with a PR.
