# Authority wording audit — 8 September 2026

Search used before and after the fix:

```sh
rg -n -i --glob '*.ts' --glob '*.tsx' --glob '!node_modules/**' --glob '!.next/**' --glob '!.vercel/**' 'approve|approved|approval' .
```

Generated dependencies and build output were excluded; every repository-owned
TypeScript/TSX file, including scripts and tests, was included. The initial scan
returned 410 matching lines.

## Authority-action matches — changed

- `components/admin/AdviceActions.tsx`: “Approved by …” and “Authority to approve” → Recommended/recommend.
- `app/admin/advice/[id]/page.tsx`: detail suffix “Approved …” and “Awaiting approval” → Recommended/recommendation.
- `app/admin/page.tsx`: Authority approval-time heading/subtitle/count copy → recommendation wording.
- `app/admin/layout.tsx`: “My Approvals” → “My Recommendations.”
- `app/admin/staff/page.tsx`: Recommending Authorities described as “approvers” → “recommending officers.”
- `components/admin/AuthoritiesSection.tsx`: “approval pages” → “recommendation pages.”
- `app/authority/login/page.tsx`, `app/authority/change-password/page.tsx`, `app/api/authority/login/route.ts`: “Authority Approvals” → “Authority Recommendations.”
- `app/submitted/[serial]/page.tsx`: share-link instruction now says review and recommend.
- `lib/email/templates.ts`: Recommendation Request heading, Recommend body/CTA, Recommendation Required subject, and submitter-confirmation wording.
- `lib/email/notify.ts`: internal delivery/preview diagnostic label now says “authority recommendation.”
- `lib/advice/authority-token.ts`: already-recommended and recommendation-link-expired errors.
- `app/api/authority-approval/[token]/attachments/[attachmentId]/route.ts`, `approve/route.ts`, `reject/route.ts`, and `confirm-identity/route.ts`: all visible invalid-link errors now say recommendation link.
- `app/api/authority-approval/[token]/confirm-identity/route.ts`: unavailable/mismatched-email errors now say recommendation.
- `app/api/admin/advice/[id]/receive/route.ts`: Finance prerequisite now says Authority recommendation.
- Authority-action comments corrected in `lib/db/schema.ts`, `lib/validation/payment-advice.ts`, `lib/admin/filters.ts`, `lib/advice/pipeline-stage.ts`, `lib/advice/stage-style.ts`, `lib/advice/authority-token.ts`, `lib/advice/authority-identity.ts`, `lib/advice/send-back.ts`, `lib/pdf/PaymentAdviceDocument.tsx`, `lib/pdf/CashVoucherDocument.tsx`, and `app/api/edit/[token]/route.ts`.
- Expectations/descriptions corrected in `lib/email/templates.test.ts`, `lib/email/notify.test.ts`, `lib/advice/authority-confirm-identity-route.test.ts`, `lib/advice/authority-approve-route.test.ts`, `lib/advice/authority-token.test.ts`, `lib/advice/finance-receive-route.test.ts`, and `lib/team-dashboard-ui.test.ts`.

Already-correct surfaces found during the scan and intentionally not altered:
`components/authority/AuthorityApprovalView.tsx`, `components/authority/AuthorityQueueActions.tsx`,
`app/authority/page.tsx`, `app/authority/advice/[id]/page.tsx`,
`app/authority-approval/[token]/page.tsx`, and both PDF stamp renderings.
Their remaining matches are technical identifiers/routes only; visible copy already says
Recommend/Recommended/Recommendation.

## Genuinely unrelated matches — retained

Every remaining match belongs to one of these buckets:

1. **Required document name:** `Approval / Budget Letter`, its stable
   `APPROVAL_BUDGET` enum, filenames/fixtures, and validation copy in
   `components/form/PaymentAdviceForm.tsx`, `lib/attachments/client-upload.ts`,
   `lib/validation/payment-advice.ts`, the Admin/Authority/token detail maps,
   their tests, and PDF fixture scripts.
2. **Finance completion/legacy persistence:** database status `APPROVED`, legacy
   `approved_at`/`approved_by_name`, Finance-only “Approved On/By” Excel columns,
   Finance PDF availability/errors, the Payment Advice PDF’s separate overall
   “Approved on” header, Finance route guards, and their tests. These describe
   Finance/final processing, never the Recommending Authority’s action.
3. **Stable internal contracts:** `authorityApprovedAt`, `performAuthorityApproval`,
   `notifyAuthorityApproval`, `AuthorityApprovalView`, `/authority-approval/...`
   and `/approve` route paths, `approvalLink` object keys, and historical audit key
   `AUTHORITY_APPROVED`. Renaming these would be a schema/API/data migration and
   provides no user-visible wording benefit.
4. **Ordinary unrelated English:** an “approved travel policy” PDF fixture and
   “approved initial-password convention” seed-script diagnostics.
5. **Regression proof:** negative assertions that explicitly verify old strings
   such as `Review &amp; Approve` are absent.

## Final targeted grep proof

```text
./lib/email/templates.test.ts:29:    expect(message.html).not.toContain("Review &amp; Approve");
./app/api/admin/export/route.ts:44:  { header: "Approved By", key: "approvedBy", width: 20 },
```

Those are respectively a negative regression assertion and the separate Finance
completion export field. Zero remaining matches describe the Recommending
Authority’s action as Approve/Approved/Approval.
