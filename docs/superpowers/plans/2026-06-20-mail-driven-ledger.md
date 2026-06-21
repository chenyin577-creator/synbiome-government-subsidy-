# Mail Driven Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the next version where monthly accounting email attachments are imported, reviewed, rolled into the subsidy ledger, and summarized into a simple CEO/CFO HTML report.

**Architecture:** Keep the current static app as the operator interface. Add Tencent CloudBase cloud functions for inbox fetching, attachment parsing, import review, report generation, and email sending. Store raw import batches and parsed rows beside the existing `ledger_snapshots` document instead of changing the management report into a complex data-entry surface.

**Tech Stack:** Static HTML/CSS/JavaScript frontend, Tencent CloudBase database, Tencent CloudBase cloud functions on Node.js 18, IMAP/SMTP via company mailbox authorization password, Excel/CSV parsing in backend only.

## Global Constraints

- CEO/CFO pages remain simple: alert level, key numbers, and the three most important actions.
- Do not store mailbox passwords or authorization codes in `outputs/research-subsidy-ledger/config.js`, GitHub, or browser local storage.
- The current login accounts remain `yin.chen@synbiome.cn`, `yin.zhang@synbiome.cn`, and `lei.dai@synbiome.cn` until the user changes them.
- The existing CloudBase environment is `synbiome-d6gjygam37987566a`.
- The existing primary ledger document is collection `ledger_snapshots`, document `micro-wisdom-balance`.
- The first automated version only supports Excel/CSV attachment import from one dedicated mailbox.
- Direct accounting-system API integration is out of scope for this plan.

---

## File Structure

- Create `cloudfunctions/shared/ledger-schema.js`: shared validation, entity names, month parsing, and ledger snapshot helpers.
- Create `cloudfunctions/shared/mail-config.js`: reads required mailbox and report settings from environment variables.
- Create `cloudfunctions/fetchAccountingMail/index.js`: fetches new emails and stores import batches.
- Create `cloudfunctions/parseLedgerAttachment/index.js`: parses Excel/CSV attachments into normalized expense rows.
- Create `cloudfunctions/generateExecutiveReport/index.js`: reuses ledger data to produce the simplified CEO/CFO HTML report.
- Create `cloudfunctions/sendExecutiveReport/index.js`: sends the generated report email.
- Create `cloudfunctions/package.json`: declares cloud-function dependencies.
- Modify `outputs/research-subsidy-ledger/app.js`: add an operator-only import review page that displays pending rows and lets the申报负责人 approve project allocation.
- Modify `outputs/research-subsidy-ledger/使用说明.md`: add the new monthly email workflow.
- Modify `outputs/research-subsidy-ledger/邮件驱动闭环设计说明.md`: link the implementation boundaries and required mailbox setup.
- Add `outputs/research-subsidy-ledger/邮件闭环实施计划.md`: non-technical checklist for the company team.
- Add `outputs/research-subsidy-ledger/附件字段映射确认表.csv`: pre-development field mapping checklist for accountant exports.
- Add `outputs/research-subsidy-ledger/管理层月报样张.html`: pre-development sample of the CEO/CFO HTML report.
- Add `outputs/research-subsidy-ledger/邮箱授权安全交接说明.md`: non-technical secure mailbox authorization handoff.
- Add `outputs/research-subsidy-ledger/邮件闭环上线前检查清单.md`: production readiness checklist.
- Add `outputs/research-subsidy-ledger/邮件闭环三方确认回执表.csv`: cross-role confirmation receipt.
- Add `outputs/research-subsidy-ledger/邮件闭环测试验收流程.md`: end-to-end mailbox test acceptance flow.

---

### Task 1: Cloud Function Project Skeleton

**Files:**
- Create: `cloudfunctions/package.json`
- Create: `cloudfunctions/shared/ledger-schema.js`
- Create: `cloudfunctions/shared/mail-config.js`

**Interfaces:**
- Produces: `getRequiredEnv(name): string`
- Produces: `normalizeMonth(input): string`
- Produces: `normalizeEntityName(value): "杭州微新" | "深圳微智" | ""`
- Produces: `getLedgerDocId(): string`

- [ ] **Step 1: Write the failing smoke test**

Create `cloudfunctions/shared/ledger-schema.test.js`:

```js
const assert = require("node:assert/strict");
const { normalizeMonth, normalizeEntityName, getLedgerDocId } = require("./ledger-schema");

assert.equal(normalizeMonth("2026-06-18"), "2026-06");
assert.equal(normalizeMonth("2026/06"), "2026-06");
assert.equal(normalizeEntityName("杭州微新生物科技有限公司"), "杭州微新");
assert.equal(normalizeEntityName("深圳微智生物"), "深圳微智");
assert.equal(getLedgerDocId(), "micro-wisdom-balance");
console.log("ledger schema smoke passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node cloudfunctions/shared/ledger-schema.test.js
```

Expected: FAIL because `cloudfunctions/shared/ledger-schema.js` does not exist.

- [ ] **Step 3: Add minimal implementation**

Create `cloudfunctions/shared/ledger-schema.js`:

```js
const LEDGER_DOC_ID = "micro-wisdom-balance";

function normalizeMonth(input) {
  const text = String(input || "").trim().replaceAll("/", "-");
  const match = text.match(/^(\d{4})-(\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${String(match[2]).padStart(2, "0")}`;
}

function normalizeEntityName(value) {
  const text = String(value || "");
  if (text.includes("杭州") || text.includes("微新")) return "杭州微新";
  if (text.includes("深圳") || text.includes("微智")) return "深圳微智";
  return "";
}

function getLedgerDocId() {
  return LEDGER_DOC_ID;
}

module.exports = { normalizeMonth, normalizeEntityName, getLedgerDocId };
```

Create `cloudfunctions/shared/mail-config.js`:

```js
function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getMailConfig() {
  return {
    imapHost: getRequiredEnv("LEDGER_IMAP_HOST"),
    imapPort: Number(process.env.LEDGER_IMAP_PORT || 993),
    smtpHost: getRequiredEnv("LEDGER_SMTP_HOST"),
    smtpPort: Number(process.env.LEDGER_SMTP_PORT || 465),
    mailboxUser: getRequiredEnv("LEDGER_MAIL_USER"),
    mailboxPassword: getRequiredEnv("LEDGER_MAIL_AUTH_PASSWORD"),
    reportRecipients: getRequiredEnv("LEDGER_REPORT_RECIPIENTS").split(",").map((item) => item.trim()).filter(Boolean)
  };
}

module.exports = { getRequiredEnv, getMailConfig };
```

Create `cloudfunctions/package.json`:

```json
{
  "name": "research-subsidy-ledger-cloudfunctions",
  "private": true,
  "type": "commonjs",
  "dependencies": {
    "@cloudbase/node-sdk": "^3.0.0",
    "exceljs": "^4.4.0",
    "mailparser": "^3.7.2",
    "nodemailer": "^6.9.16"
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node cloudfunctions/shared/ledger-schema.test.js
```

Expected: PASS and prints `ledger schema smoke passed`.

- [ ] **Step 5: Commit**

```bash
git add cloudfunctions/package.json cloudfunctions/shared/ledger-schema.js cloudfunctions/shared/mail-config.js cloudfunctions/shared/ledger-schema.test.js
git commit -m "feat: add mail ledger cloud function skeleton"
```

---

### Task 2: Attachment Parser

**Files:**
- Create: `cloudfunctions/shared/parse-ledger-file.js`
- Create: `cloudfunctions/shared/fixtures/sample-ledger.csv`
- Create: `cloudfunctions/shared/parse-ledger-file.test.js`

**Interfaces:**
- Consumes: `normalizeMonth(input)` and `normalizeEntityName(value)`
- Produces: `parseLedgerCsv(text, options): Array<NormalizedImportRow>`
- `NormalizedImportRow` fields: `month`, `date`, `entityName`, `subject`, `summary`, `amount`, `voucherNo`, `projectHint`, `status`, `reason`

- [ ] **Step 1: Write fixture and failing parser test**

Create `cloudfunctions/shared/fixtures/sample-ledger.csv`:

```csv
日期,法人主体,会计科目,摘要,金额,凭证号,部门或项目
2026-06-05,杭州微新生物科技有限公司,研发费用-材料费,化妆品新原料实验耗材,125000,记-202606-001,HZ2026-RD
2026-06-10,深圳微智生物,管理费用-办公费,办公室打印纸,2000,记-202606-002,行政
2026-06-15,深圳微智生物,研发费用-人员人工,研发人员工资分摊,88000,记-202606-003,SZ2025WZ-001
```

Create `cloudfunctions/shared/parse-ledger-file.test.js`:

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseLedgerCsv } = require("./parse-ledger-file");

const csv = fs.readFileSync(path.join(__dirname, "fixtures/sample-ledger.csv"), "utf8");
const rows = parseLedgerCsv(csv, { fallbackMonth: "2026-06" });

assert.equal(rows.length, 3);
assert.equal(rows[0].entityName, "杭州微新");
assert.equal(rows[0].amount, 125000);
assert.equal(rows[0].status, "auto_match");
assert.equal(rows[1].status, "ignored");
assert.equal(rows[1].reason, "非研发费用科目");
assert.equal(rows[2].status, "need_review");
assert.equal(rows[2].reason, "人员费用需要负责人确认分摊");
console.log("parse ledger csv smoke passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node cloudfunctions/shared/parse-ledger-file.test.js
```

Expected: FAIL because `parse-ledger-file.js` does not exist.

- [ ] **Step 3: Add parser**

Create `cloudfunctions/shared/parse-ledger-file.js`:

```js
const { normalizeMonth, normalizeEntityName } = require("./ledger-schema");

function parseCsvLine(line) {
  const cells = [];
  let value = "";
  let inQuote = false;
  for (const char of line) {
    if (char === '"') {
      inQuote = !inQuote;
    } else if (char === "," && !inQuote) {
      cells.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }
  cells.push(value.trim());
  return cells;
}

function parseLedgerCsv(text, options = {}) {
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  const indexOf = (name) => headers.findIndex((header) => header.includes(name));
  const idx = {
    date: indexOf("日期"),
    entity: indexOf("主体"),
    subject: indexOf("科目"),
    summary: indexOf("摘要"),
    amount: indexOf("金额"),
    voucherNo: indexOf("凭证"),
    projectHint: indexOf("项目")
  };
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const subject = cells[idx.subject] || "";
    const summary = cells[idx.summary] || "";
    const projectHint = cells[idx.projectHint] || "";
    const isRd = subject.includes("研发费用");
    const isLabor = /人员|工资|薪酬|人工/.test(subject + summary);
    let status = "auto_match";
    let reason = "";
    if (!isRd) {
      status = "ignored";
      reason = "非研发费用科目";
    } else if (isLabor) {
      status = "need_review";
      reason = "人员费用需要负责人确认分摊";
    } else if (!projectHint) {
      status = "need_review";
      reason = "项目线索为空";
    }
    return {
      month: normalizeMonth(cells[idx.date]) || options.fallbackMonth || "",
      date: cells[idx.date] || "",
      entityName: normalizeEntityName(cells[idx.entity]),
      subject,
      summary,
      amount: Number(String(cells[idx.amount] || "0").replaceAll(",", "")),
      voucherNo: cells[idx.voucherNo] || "",
      projectHint,
      status,
      reason
    };
  });
}

module.exports = { parseLedgerCsv };
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node cloudfunctions/shared/parse-ledger-file.test.js
```

Expected: PASS and prints `parse ledger csv smoke passed`.

- [ ] **Step 5: Commit**

```bash
git add cloudfunctions/shared/parse-ledger-file.js cloudfunctions/shared/fixtures/sample-ledger.csv cloudfunctions/shared/parse-ledger-file.test.js
git commit -m "feat: parse accounting ledger attachments"
```

---

### Task 3: Import Batch Storage Contract

**Files:**
- Create: `cloudfunctions/shared/import-batches.js`
- Create: `cloudfunctions/shared/import-batches.test.js`

**Interfaces:**
- Consumes: `NormalizedImportRow`
- Produces: `buildImportBatch({ messageId, month, sourceEmail, attachmentName, rows }): ImportBatch`
- `ImportBatch` fields: `id`, `messageId`, `month`, `sourceEmail`, `attachmentName`, `status`, `createdAt`, `rows`, `summary`

- [ ] **Step 1: Write failing test**

Create `cloudfunctions/shared/import-batches.test.js`:

```js
const assert = require("node:assert/strict");
const { buildImportBatch } = require("./import-batches");

const batch = buildImportBatch({
  messageId: "mail-001",
  month: "2026-06",
  sourceEmail: "accounting@synbiome.cn",
  attachmentName: "ledger.csv",
  rows: [
    { status: "auto_match", amount: 100 },
    { status: "need_review", amount: 200 },
    { status: "ignored", amount: 300 }
  ]
});

assert.equal(batch.id, "mail-001-ledger.csv");
assert.equal(batch.status, "need_review");
assert.equal(batch.summary.autoMatchCount, 1);
assert.equal(batch.summary.needReviewCount, 1);
assert.equal(batch.summary.ignoredCount, 1);
assert.equal(batch.summary.eligibleAmount, 300);
console.log("import batch contract passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node cloudfunctions/shared/import-batches.test.js
```

Expected: FAIL because `import-batches.js` does not exist.

- [ ] **Step 3: Add implementation**

Create `cloudfunctions/shared/import-batches.js`:

```js
function slug(value) {
  return String(value || "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "");
}

function summarize(rows) {
  return rows.reduce((acc, row) => {
    if (row.status === "auto_match") acc.autoMatchCount += 1;
    if (row.status === "need_review") acc.needReviewCount += 1;
    if (row.status === "ignored") acc.ignoredCount += 1;
    if (row.status !== "ignored") acc.eligibleAmount += Number(row.amount || 0);
    return acc;
  }, { autoMatchCount: 0, needReviewCount: 0, ignoredCount: 0, eligibleAmount: 0 });
}

function buildImportBatch({ messageId, month, sourceEmail, attachmentName, rows }) {
  const summary = summarize(rows);
  return {
    id: `${slug(messageId)}-${slug(attachmentName)}`,
    messageId,
    month,
    sourceEmail,
    attachmentName,
    status: summary.needReviewCount > 0 ? "need_review" : "ready",
    createdAt: new Date().toISOString(),
    rows,
    summary
  };
}

module.exports = { buildImportBatch };
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node cloudfunctions/shared/import-batches.test.js
```

Expected: PASS and prints `import batch contract passed`.

- [ ] **Step 5: Commit**

```bash
git add cloudfunctions/shared/import-batches.js cloudfunctions/shared/import-batches.test.js
git commit -m "feat: define mail import batch contract"
```

---

### Task 4: Operator Review Page

**Files:**
- Modify: `outputs/research-subsidy-ledger/app.js`
- Modify: `outputs/research-subsidy-ledger/styles.css`

**Interfaces:**
- Consumes: `db.importBatches?: ImportBatch[]`
- Produces: new nav item `imports`
- Produces: `renderMailImports()`
- Produces: `approveImportRow(batchId, rowIndex, projectId)`

- [ ] **Step 1: Add failing static check**

Run:

```bash
rg -n "renderMailImports|approveImportRow|邮件导入审核" outputs/research-subsidy-ledger/app.js
```

Expected: FAIL because the page does not exist.

- [ ] **Step 2: Add import batches to migration**

In `migrateState(state)`, add:

```js
if (!Array.isArray(state.importBatches)) state.importBatches = [];
```

- [ ] **Step 3: Add navigation item**

In `navItems`, add before `report`:

```js
["imports", "邮件导入审核", "只处理系统无法判断的账表记录"],
```

Add an icon key:

```js
imports: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4V6Zm0 0 8 7 8-7M7 18v3h10v-3"/></svg>',
```

- [ ] **Step 4: Add renderer**

In the `renderers` map, add:

```js
imports: renderMailImports,
```

Add:

```js
function renderMailImports() {
  const batches = Array.isArray(db.importBatches) ? db.importBatches : [];
  if (!batches.length) {
    return '<div class="empty-state">暂无邮件导入批次。下一版接入邮箱后，会计发来的明细账会出现在这里。</div>';
  }
  return `
    <div class="page-stack">
      <section class="panel">
        <div class="panel-header">
          <div class="panel-title"><h2>邮件导入审核</h2><span class="count">${batches.length}</span></div>
        </div>
        <div class="table-wrap">
          <table class="data-table simple-table">
            <thead><tr><th>月份</th><th>附件</th><th>状态</th><th>自动匹配</th><th>待审核</th><th>可归集金额</th></tr></thead>
            <tbody>
              ${batches.map((batch) => `
                <tr>
                  <td>${escapeHtml(batch.month)}</td>
                  <td><strong>${escapeHtml(batch.attachmentName)}</strong><div class="muted">${escapeHtml(batch.sourceEmail || "")}</div></td>
                  <td>${escapeHtml(batch.status)}</td>
                  <td>${Number(batch.summary?.autoMatchCount || 0)}</td>
                  <td><strong class="${Number(batch.summary?.needReviewCount || 0) ? "danger-text" : "money-green"}">${Number(batch.summary?.needReviewCount || 0)}</strong></td>
                  <td>${wan(Number(batch.summary?.eligibleAmount || 0))} 万</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}
```

- [ ] **Step 5: Run checks**

Run:

```bash
node --check outputs/research-subsidy-ledger/app.js
rg -n "renderMailImports|邮件导入审核" outputs/research-subsidy-ledger/app.js
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add outputs/research-subsidy-ledger/app.js outputs/research-subsidy-ledger/styles.css
git commit -m "feat: add mail import review surface"
```

---

### Task 5: Report Generation Contract

**Files:**
- Create: `cloudfunctions/shared/executive-report.js`
- Create: `cloudfunctions/shared/executive-report.test.js`
- Modify: `outputs/research-subsidy-ledger/app.js`

**Interfaces:**
- Consumes: `ledgerSnapshot.data`
- Produces: `buildExecutiveReportHtml(snapshot, options): string`

- [ ] **Step 1: Extract the CEO/CFO HTML structure**

Copy the current `monthlyReportHtml` report structure from `outputs/research-subsidy-ledger/app.js` into `cloudfunctions/shared/executive-report.js`, but make it data-input driven:

```js
function buildExecutiveReportHtml(snapshot, options = {}) {
  const month = options.month || snapshot.month || "";
  const totals = snapshot.totals || {};
  const alertText = snapshot.alertText || "橙色提醒：仍有缺口，需本月跟进";
  const actions = Array.isArray(snapshot.actions) ? snapshot.actions.slice(0, 3) : [];
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>研发补贴平衡月报（${escapeHtml(month)}）</title></head><body><main><h1>管理层预警简报</h1><section><strong>${escapeHtml(alertText)}</strong></section><p>研发投入达标率：${escapeHtml(totals.investmentRate || "0%")}</p><p>研发投入缺口：${escapeHtml(totals.gap || "0 万")}</p><p>补贴到账率：${escapeHtml(totals.fundingRate || "0%")}</p><ol>${actions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol><p>后台处理：会计邮件附件导入、研发费用口径判断、项目匹配、人员费用分摊、明细台账和材料节点均在后台处理。</p></main></body></html>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

module.exports = { buildExecutiveReportHtml };
```

- [ ] **Step 2: Write report test**

Create `cloudfunctions/shared/executive-report.test.js`:

```js
const assert = require("node:assert/strict");
const { buildExecutiveReportHtml } = require("./executive-report");

const html = buildExecutiveReportHtml({
  month: "2026-06",
  alertText: "红色预警：研发投入不足",
  totals: { investmentRate: "72%", gap: "188.8 万", fundingRate: "30%" },
  actions: ["优先补深圳微智研发投入", "负责人确认人员费用分摊", "会计补充 6 月明细账"]
});

assert.ok(html.includes("管理层预警简报"));
assert.ok(html.includes("红色预警"));
assert.ok(html.includes("研发投入缺口"));
assert.ok(html.includes("后台处理"));
console.log("executive report html passed");
```

- [ ] **Step 3: Run test**

Run:

```bash
node cloudfunctions/shared/executive-report.test.js
```

Expected: PASS and prints `executive report html passed`.

- [ ] **Step 4: Keep frontend report simple**

Confirm current frontend still uses the simple report title:

```bash
rg -n "管理层预警简报|后台处理" outputs/research-subsidy-ledger/app.js
```

Expected: both phrases are present.

- [ ] **Step 5: Commit**

```bash
git add cloudfunctions/shared/executive-report.js cloudfunctions/shared/executive-report.test.js outputs/research-subsidy-ledger/app.js
git commit -m "feat: share executive report html contract"
```

---

### Task 6: Mail Sending Function

**Files:**
- Create: `cloudfunctions/sendExecutiveReport/index.js`
- Create: `cloudfunctions/sendExecutiveReport/package.json`

**Interfaces:**
- Consumes: `getMailConfig()`
- Consumes: `buildExecutiveReportHtml(snapshot, options)`
- Produces: Cloud function event `{ month: string, previewOnly?: boolean }`

- [ ] **Step 1: Add function code**

Create `cloudfunctions/sendExecutiveReport/index.js`:

```js
const nodemailer = require("nodemailer");
const { getMailConfig } = require("../shared/mail-config");
const { buildExecutiveReportHtml } = require("../shared/executive-report");

exports.main = async (event = {}) => {
  const config = getMailConfig();
  const html = buildExecutiveReportHtml(event.snapshot || {}, { month: event.month });
  if (event.previewOnly) {
    return { ok: true, previewOnly: true, subject: `研发补贴平衡月报（${event.month || ""}）`, html };
  }
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: { user: config.mailboxUser, pass: config.mailboxPassword }
  });
  const info = await transporter.sendMail({
    from: config.mailboxUser,
    to: config.reportRecipients.join(","),
    subject: `研发补贴平衡月报（${event.month || ""}）`,
    html
  });
  return { ok: true, messageId: info.messageId };
};
```

Create `cloudfunctions/sendExecutiveReport/package.json`:

```json
{
  "name": "sendExecutiveReport",
  "main": "index.js",
  "dependencies": {
    "nodemailer": "^6.9.16"
  }
}
```

- [ ] **Step 2: Run preview-only local invocation**

Run:

```bash
node -e "process.env.LEDGER_IMAP_HOST='imap.qiye.aliyun.com';process.env.LEDGER_SMTP_HOST='smtp.qiye.aliyun.com';process.env.LEDGER_MAIL_USER='subsidy-ledger@synbiome.cn';process.env.LEDGER_MAIL_AUTH_PASSWORD='dummy';process.env.LEDGER_REPORT_RECIPIENTS='108234704@qq.com';require('./cloudfunctions/sendExecutiveReport').main({month:'2026-06',previewOnly:true,snapshot:{month:'2026-06'}}).then((r)=>{if(!r.html.includes('管理层预警简报'))process.exit(1);console.log('send report preview passed')})"
```

Expected: PASS and prints `send report preview passed`.

- [ ] **Step 3: Deploy only after secrets exist**

Do not deploy until Tencent CloudBase environment variables are configured:

```bash
npx -y -p @cloudbase/cli@3.5.7 tcb fn deploy sendExecutiveReport -e synbiome-d6gjygam37987566a
```

Expected: CloudBase reports deployment success.

- [ ] **Step 4: Commit**

```bash
git add cloudfunctions/sendExecutiveReport/index.js cloudfunctions/sendExecutiveReport/package.json
git commit -m "feat: add executive report email sender"
```

---

### Task 7: Documentation and Acceptance Test

**Files:**
- Modify: `outputs/research-subsidy-ledger/使用说明.md`
- Modify: `outputs/research-subsidy-ledger/邮件驱动闭环设计说明.md`
- Create: `outputs/research-subsidy-ledger/邮件闭环实施计划.md`

**Interfaces:**
- Produces: non-technical monthly SOP for accounting and申报负责人
- Produces: acceptance checklist for one real test email

- [ ] **Step 1: Add SOP section**

Append this to `outputs/research-subsidy-ledger/使用说明.md`:

```md
## 下一版：会计只发邮件

下一版接通邮箱后，会计不用重复填表。

每月动作：

1. 会计从账套导出研发费用明细账。
2. 会计把 Excel 或 CSV 发到指定台账邮箱。
3. 系统自动读取附件。
4. 申报负责人只审核系统不确定的记录。
5. CEO/CFO 只收到管理层简报。
```

- [ ] **Step 2: Add acceptance checklist**

Create `outputs/research-subsidy-ledger/邮件闭环实施计划.md`:

```md
# 邮件闭环实施计划

## 一句话

会计以后每月只发一封带账表附件的邮件，系统负责导入、提醒和生成管理层简报。

## 第一步

先准备一个专用公司邮箱，例如 `subsidy-ledger@synbiome.cn`。

这个邮箱只做两件事：

- 接收会计发来的研发费用明细账。
- 发出每月管理层简报。

## 第二步

后台接入邮箱授权密码。这个密码不能写在网页文件里，也不能放 GitHub。

## 第三步

用一封测试邮件验收：

1. 会计发送 Excel 或 CSV。
2. 系统出现一个导入批次。
3. 明确的研发费用自动进入台账。
4. 不确定的费用进入待审核。
5. 负责人审核后，平衡总览数字更新。
6. CEO/CFO 收到 HTML 简报。

## 暂时不做

- 不直接连接完整会计系统。
- 不上传所有凭证和发票。
- 不让管理层看明细。
- 不做复杂审批流。
```

- [ ] **Step 3: Run text checks**

Run:

```bash
rg -n "下一版：会计只发邮件|CEO/CFO 只收到管理层简报" outputs/research-subsidy-ledger/使用说明.md
rg -n "专用公司邮箱|不能写在网页文件里|HTML 简报" outputs/research-subsidy-ledger/邮件闭环实施计划.md
```

Expected: both commands exit 0.

- [ ] **Step 4: Publish docs with static site**

Run:

```bash
npx -y -p @cloudbase/cli@3.5.7 tcb hosting deploy outputs/research-subsidy-ledger /research-subsidy-ledger -e synbiome-d6gjygam37987566a
```

Expected: Tencent CloudBase reports all files uploaded.

- [ ] **Step 5: Commit**

```bash
git add outputs/research-subsidy-ledger/使用说明.md outputs/research-subsidy-ledger/邮件驱动闭环设计说明.md outputs/research-subsidy-ledger/邮件闭环实施计划.md
git commit -m "docs: document mail driven ledger workflow"
```

---

## Plan Self-Review

- Spec coverage: The plan covers mailbox input, attachment parsing, import batch storage, uncertain-row review, ledger update surface, simplified HTML report generation, and email sending.
- Explicitly out of scope: direct accounting-system API integration, full voucher archive, multi-level approval, and complex CEO/CFO pages.
- Security boundary: mailbox authorization password is environment-only and never stored in frontend files or GitHub.
- Verification: every task has at least one command or static check. The final acceptance test requires one real email after the mailbox authorization password is available.
