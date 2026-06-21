# Mail Driven Ledger Design Spec

## Purpose

The next version of the research subsidy ledger uses monthly accounting emails as the primary input. Accountants send ledger exports as attachments; the system imports the attachments, flags uncertain rows for review, updates subsidy ledger data, and sends a simplified HTML conclusion to CEO/CFO.

This spec intentionally keeps the CEO/CFO experience simple. Detailed parsing, matching, review, and logs stay in the backend/operator workflow.

## Scope

### In Scope

- One dedicated company mailbox receives accounting ledger emails.
- The system reads new emails from that mailbox.
- The system accepts Excel `.xlsx` and CSV `.csv` attachments.
- The system extracts monthly expense rows from attachments.
- The system identifies likely R&D expense rows from accounting subjects and summaries.
- The system maps rows to杭州微新 or深圳微智.
- The system auto-matches rows with clear project hints.
- The system sends ambiguous rows to an operator review list.
- The project owner reviews uncertain allocation rows.
- Approved rows update the existing subsidy ledger snapshot.
- The system generates a CEO/CFO HTML report.
- The system sends the report to configured recipients once per month.

### Out of Scope For The First Automated Version

- Direct integration with a complete accounting system API.
- Voucher, invoice, PDF, image, or compressed attachment ingestion.
- Automatic tax or audit qualification judgment.
- Multi-level approval workflow.
- Mobile app or mini-program.
- Complex CEO/CFO drill-down pages.

## Recommended Defaults Pending Business Confirmation

- Dedicated mailbox: `subsidy-ledger@synbiome.cn`
- Report send time: monthly, 6th day, 09:00
- CEO/CFO report recipients:
  - `yin.chen@synbiome.cn`
  - `yin.zhang@synbiome.cn`
  - `108234704@qq.com`
- Supported attachment formats: `.xlsx`, `.csv`
- Reviewer for uncertain rows: 张英
- CEO/CFO report content: warning level, R&D investment completion rate, R&D investment gap, subsidy receipt rate, top three actions

These defaults are recorded in `outputs/research-subsidy-ledger/邮件闭环设计确认单.md`. Development should not treat them as final until business confirmation is received.

## Confirmation Artifacts

Before implementation, the business team should review these concrete artifacts:

- `outputs/research-subsidy-ledger/附件字段映射确认表.csv`: confirms how the accountant's real export columns map to system fields.
- `outputs/research-subsidy-ledger/管理层月报样张.html`: confirms the simplified HTML page CEO/CFO will receive.
- `outputs/research-subsidy-ledger/邮箱授权安全交接说明.md`: confirms the safe handoff process for mailbox authorization.
- `outputs/research-subsidy-ledger/邮件闭环上线前检查清单.md`: confirms the go-live checklist before calling the workflow automated.
- `outputs/research-subsidy-ledger/邮件闭环三方确认回执表.csv`: records sign-off from management, accounting, project owner, and IT.
- `outputs/research-subsidy-ledger/邮件闭环测试验收流程.md`: defines the end-to-end test flow for the first real mailbox run.

The field mapping table is required because accounting systems often use different column names for the same business meaning. Development should use the confirmed real export columns instead of guessing from sample names.

## User Roles

### Accountant

- Exports monthly R&D expense ledger from the accounting system.
- Sends the attachment to the dedicated mailbox.
- Does not manually re-enter all expense rows into the ledger.

### Project Owner

- Reviews rows that the system cannot confidently allocate.
- Confirms project allocation and personnel cost split.
- Does not review rows that the system confidently ignores as non-R&D expenses.

### CEO/CFO

- Receives a short HTML report.
- Sees only warning level and key numbers.
- Does not review accounting row details in the management report.

## Monthly Workflow

1. Accountant exports monthly expense ledger.
2. Accountant sends email to the dedicated mailbox.
3. Backend job reads unread or unprocessed emails.
4. Backend stores an import batch record.
5. Backend parses `.xlsx` or `.csv` attachment rows.
6. Backend marks rows as `auto_match`, `need_review`, or `ignored`.
7. Operator page shows only `need_review` rows.
8. Project owner approves or corrects project allocation.
9. System updates `ledger_snapshots/micro-wisdom-balance`.
10. System regenerates CEO/CFO report data.
11. System sends HTML report on the configured monthly schedule.

## Data Rules

### R&D Expense Detection

- If accounting subject includes `研发费用`, row enters the candidate R&D pool.
- If accounting subject does not include `研发费用` but summary suggests R&D activity, row enters `need_review`.
- If accounting subject and summary are unrelated to R&D, row is marked `ignored`.

### Entity Detection

- Text containing `杭州` or `微新` maps to杭州微新.
- Text containing `深圳` or `微智` maps to深圳微智.
- Missing or conflicting entity text maps to `need_review`.

### Project Matching

- Rows with clear project code or project name are `auto_match`.
- Personnel cost rows are `need_review`, even if a project hint exists, because staff costs may need allocation.
- Missing project hints are `need_review`.

### Amount Handling

- Imported amount is preserved as the original accounting amount.
- Eligible amount defaults to imported amount for `auto_match`.
- Eligible amount for `need_review` is set by reviewer confirmation.
- Ignored rows do not update ledger totals but remain visible in import logs.

## Storage Model

The current app stores the main ledger in:

- CloudBase collection: `ledger_snapshots`
- Document id: `micro-wisdom-balance`

The next version should preserve that document and add fields rather than replacing the data model:

- `data.importBatches[]`
- `data.expenses[]` for approved or auto-matched eligible rows
- `data.reportRuns[]` for generated monthly report records

Raw mailbox credentials must never be stored in this document.

## Backend Components

### `fetchAccountingMail`

Reads the dedicated mailbox, finds unprocessed emails, downloads attachments, and creates import batch records.

### `parseLedgerAttachment`

Parses `.xlsx` and `.csv`, normalizes columns, and classifies rows into `auto_match`, `need_review`, or `ignored`.

### `reviewImportRows`

Exposes pending rows to the existing operator app and accepts reviewer decisions.

### `generateExecutiveReport`

Builds report metrics from the updated ledger snapshot and produces HTML with the same simple management-report structure currently used by the frontend.

### `sendExecutiveReport`

Sends monthly HTML report through company SMTP settings.

## Security Requirements

- Mailbox authorization password must be stored only in Tencent Cloud environment variables.
- Mailbox authorization password must not appear in frontend config, GitHub, or browser storage.
- Report recipients must be configurable without code changes where possible.
- Import logs must not display mailbox passwords, SMTP credentials, or full authentication errors.
- The GitHub repository should be private before real company financial data is added.

## CEO/CFO Report Requirements

The report must remain concise and include:

- Warning level: red, orange, or green.
- R&D investment completion rate.
- R&D investment gap.
- Subsidy receipt rate.
- Top three actions.
- Footer explaining that detailed ledger processing is handled in the backend.

The report must not include:

- Full accounting row list.
- Invoice or voucher detail.
- Parsing logs.
- Technical error traces.
- Password or mailbox settings.

## Acceptance Criteria

The first automated version is accepted only when all of the following pass:

1. A test email with `.xlsx` or `.csv` attachment can be imported.
2. The import creates a batch record.
3. Clear R&D rows are classified as `auto_match`.
4. Personnel or unclear rows are classified as `need_review`.
5. Non-R&D rows are classified as `ignored`.
6. The review page shows only records needing human decision.
7. Reviewer approval updates ledger totals.
8. The CEO/CFO HTML report uses updated ledger numbers.
9. The report can be sent to the configured recipient list.
10. No mailbox password appears in frontend files, GitHub, or exported static assets.
11. The end-to-end test flow in `邮件闭环测试验收流程.md` has been executed and evidence is retained.

## Open Business Confirmations

Before implementation starts, the business owner should confirm:

- Dedicated mailbox address.
- Mailbox authorization password availability.
- Monthly report recipients.
- Monthly send time.
- Whether the accountant export can include required columns.
- One real sample ledger export for field mapping.
- Confirmation that `附件字段映射确认表.csv` matches the accountant's real export.
- Confirmation that `管理层月报样张.html` is concise enough for CEO/CFO.
- Confirmation that mailbox authorization is configured only through Tencent Cloud environment variables.
- Confirmation that the go-live checklist has no open items before production use.
- Sign-off in `邮件闭环三方确认回执表.csv`.
- Agreement on the test evidence required by `邮件闭环测试验收流程.md`.

These confirmations are tracked in `outputs/research-subsidy-ledger/邮件闭环设计确认单.md`.
