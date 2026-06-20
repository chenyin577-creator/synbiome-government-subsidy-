const STORAGE_KEY = "research-subsidy-ledger-v1";
const SESSION_KEY = "research-subsidy-ledger-session-v1";
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const APP_CONFIG = window.SUBSIDY_APP_CONFIG || {};
const CLOUD_ORG_ID = APP_CONFIG.organizationId || "micro-wisdom-balance";
const CLOUD_TABLE = APP_CONFIG.cloudbaseCollection || "ledger_snapshots";
const CLOUD_POLL_MS = 20000;
const ALLOWED_ACCOUNTS = Array.isArray(APP_CONFIG.accounts)
  ? APP_CONFIG.accounts.map((account) => ({
      ...account,
      email: String(account.email || "").trim().toLowerCase()
    }))
  : [];
const REPORT_EMAILS = Array.isArray(APP_CONFIG.monthlyReportRecipients)
  ? APP_CONFIG.monthlyReportRecipients.map((email) => String(email || "").trim()).filter(Boolean)
  : [];

const cloud = {
  app: null,
  db: null,
  user: null,
  role: "未登录",
  enabled: false,
  loading: false,
  saveTimer: null,
  applyingRemote: false,
  pollTimer: null,
  lastSavedAt: null
};

const icons = {
  dashboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-12h6V4h-6v4Z"/></svg>',
  monthly: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v4M17 3v4M4 8h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Zm4 8h3m-3 4h6"/></svg>',
  analysis: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3Zm6 10 1 2.4 2.4 1-2.4 1L18 20l-1-2.6-2.4-1 2.4-1L18 13ZM5 14l.8 2 2 .8-2 .8L5 20l-.8-2.4-2-.8 2-.8L5 14Z"/></svg>',
  intake: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4V4Zm4 4h8M8 12h8M8 16h5M18 3v4M6 3v4"/></svg>',
  projects: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 12h16M4 19h16M7 5v14"/></svg>',
  report: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18H6V3Zm3 5h6M9 12h6M9 16h4M16 18l2 2 4-5"/></svg>',
  ledger: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10l3 3v15H4V3h3Zm10 0v4h4M8 11h8M8 15h8M8 19h5"/></svg>',
  allocate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h7m-7 5h11m-11 5h7M17 6v12m0 0-3-3m3 3 3-3"/></svg>',
  policy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18H6V3Zm4 5h4M9 12h6M9 16h6"/></svg>',
  reminders: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></svg>',
  permissions: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Zm7.4-2.2a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V20a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.04 1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.08 3.15l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V2a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V8a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51.3Z"/></svg>'
};

const navItems = [
  ["dashboard", "平衡总览", "杭州与深圳研发投入是否够用"],
  ["analysis", "智能分析", "自动给出费用归集和风险处理建议"],
  ["monthly", "每月录入", "每月录入固定研发投入数字"],
  ["report", "月报简报", "每月给管理层看的简版汇报"],
  ["projects", "项目设置", "先设置项目目标，后续只录数字"]
];

const seed = {
  entities: [
    {
      id: "hz",
      short: "杭",
      name: "杭州微新",
      location: "杭州市钱塘区",
      scope: "中后台与半亩森林业务"
    },
    {
      id: "sz",
      short: "深",
      name: "深圳微智",
      location: "深圳市",
      scope: "研发、生产与后续销售"
    }
  ],
  projects: [
    {
      id: "HZ-RD-2025",
      code: "HZ2025-RD",
      entityId: "hz",
      name: "钱塘区年度研发费用补贴",
      area: "杭州市钱塘区",
      year: "2025",
      cycle: "2025-01 至 2025-12",
      type: "研发费用补贴",
      threshold: 8000000,
      subsidyRate: 0.12,
      cap: 1000000,
      received: 0,
      deadline: "2026-07-20",
      materialDeadline: "2026-07-08",
      owner: "张英",
      accountingScope: "年度研发费用总额",
      note: "按年度核算，建议与研发费用辅助账和年度审计数据核对。"
    },
    {
      id: "HZ-SITE-2025",
      code: "HZ2025-SITE",
      entityId: "hz",
      name: "钱塘区场地补贴",
      area: "杭州市钱塘区",
      year: "2025",
      cycle: "2025-01 至 2025-12",
      type: "场地补贴",
      threshold: 600000,
      subsidyRate: 0.25,
      cap: 500000,
      received: 180000,
      deadline: "2026-07-15",
      materialDeadline: "2026-07-01",
      owner: "张英",
      accountingScope: "年度租金及场地成本",
      note: "不等同研发费用补贴，单独留存租赁、付款与场地使用资料。"
    },
    {
      id: "HZ-HNTE-2026",
      code: "HZ2026-GG",
      entityId: "hz",
      name: "高新技术企业认定",
      area: "浙江省/杭州市",
      year: "2026",
      cycle: "2026-01 至 2026-12",
      type: "资质认定",
      applicationKind: "qualification",
      threshold: 0,
      subsidyRate: 0,
      cap: 0,
      received: 0,
      deadline: "2026-09-30",
      materialDeadline: "2026-08-20",
      owner: "张英",
      accountingScope: "非资金类政策申请",
      requirementProgress: 58,
      requirementSummary: "研发费用占比、知识产权、科技人员、成果转化、高新收入等条件待补齐",
      note: "国高不是单纯拿补贴，重点跟踪条件达标、审计材料、知识产权和申报批次。"
    },
    {
      id: "SZ-RAW-001",
      code: "SZ2025WZ-001",
      entityId: "sz",
      name: "化妆品新原料研发课题",
      area: "深圳市",
      year: "2025",
      cycle: "2025-03 至 2026-02",
      type: "研发课题",
      threshold: 3000000,
      subsidyRate: 0.3,
      cap: 1200000,
      received: 260000,
      deadline: "2026-08-15",
      materialDeadline: "2026-07-25",
      owner: "张英",
      accountingScope: "课题单独核算",
      opportunityName: "化妆品新原料备案",
      opportunityStage: "研发与备案准备中",
      expectedHzSubsidy: 0,
      expectedSzSubsidy: 0,
      opportunityNextStep: "完成新原料备案后，分别评估杭州微新和深圳微智可申请的补贴政策。",
      note: "费用应直接归集到课题，研发人员成本允许按工时或比例手工分摊。"
    },
    {
      id: "SZ-FERMENT-002",
      code: "SZ2025WZ-002",
      entityId: "sz",
      name: "发酵工艺放大研发课题",
      area: "深圳市",
      year: "2025",
      cycle: "2025-04 至 2026-03",
      type: "研发课题",
      threshold: 2600000,
      subsidyRate: 0.28,
      cap: 1000000,
      received: 0,
      deadline: "2026-08-30",
      materialDeadline: "2026-08-05",
      owner: "张英",
      accountingScope: "课题单独核算",
      note: "材料、试剂、委外测试应优先按课题编号入账。"
    },
    {
      id: "SZ-EVAL-003",
      code: "SZ2025WZ-003",
      entityId: "sz",
      name: "功效评价与备案支持课题",
      area: "深圳市",
      year: "2025",
      cycle: "2025-05 至 2026-03",
      type: "研发课题",
      threshold: 1800000,
      subsidyRate: 0.25,
      cap: 700000,
      received: 0,
      deadline: "2026-09-10",
      materialDeadline: "2026-08-20",
      owner: "张英",
      accountingScope: "课题单独核算",
      note: "备案支持费用需区分研发验证、注册申报和销售准备。"
    }
  ],
  expenses: [
    {
      id: "FY20250128001",
      date: "2025-01-28",
      entityId: "hz",
      projectId: "HZ-RD-2025",
      category: "人员人工",
      summary: "研发人员工资 - 杭州研发支持",
      vendor: "内部员工",
      amount: 460000,
      eligibleAmount: 460000,
      recognitionStatus: "可归集",
      allocationStatus: "无需分摊",
      source: "财务报表",
      voucherNo: "记-202501-071"
    },
    {
      id: "FY20250211001",
      date: "2025-02-11",
      entityId: "hz",
      projectId: "HZ-RD-2025",
      category: "直接投入",
      summary: "ELISA 试剂盒与实验耗材",
      vendor: "杭州赛默生物",
      amount: 286000,
      eligibleAmount: 286000,
      recognitionStatus: "可归集",
      allocationStatus: "无需分摊",
      source: "财务报表",
      voucherNo: "记-202502-022"
    },
    {
      id: "FY20250303001",
      date: "2025-03-03",
      entityId: "hz",
      projectId: "HZ-RD-2025",
      category: "检测检验",
      summary: "动物实验检测服务",
      vendor: "杭州医科所",
      amount: 588000,
      eligibleAmount: 588000,
      recognitionStatus: "可归集",
      allocationStatus: "无需分摊",
      source: "行政补录",
      voucherNo: "记-202503-031"
    },
    {
      id: "FY20250420001",
      date: "2025-04-20",
      entityId: "hz",
      projectId: "HZ-SITE-2025",
      category: "场地租赁",
      summary: "杭州办公及实验场地租金",
      vendor: "钱塘园区",
      amount: 312000,
      eligibleAmount: 312000,
      recognitionStatus: "待确认口径",
      allocationStatus: "无需分摊",
      source: "财务报表",
      voucherNo: "记-202504-088"
    },
    {
      id: "FY20250514001",
      date: "2025-05-14",
      entityId: "hz",
      projectId: "HZ-RD-2025",
      category: "设备折旧",
      summary: "研发设备折旧摊销",
      vendor: "内部折旧",
      amount: 820000,
      eligibleAmount: 820000,
      recognitionStatus: "可归集",
      allocationStatus: "无需分摊",
      source: "财务报表",
      voucherNo: "记-202505-063"
    },
    {
      id: "FY20250605001",
      date: "2025-06-05",
      entityId: "hz",
      projectId: "HZ-RD-2025",
      category: "委外研发",
      summary: "活性成分筛选委外研发",
      vendor: "上海合研生物",
      amount: 1250000,
      eligibleAmount: 1250000,
      recognitionStatus: "可归集",
      allocationStatus: "无需分摊",
      source: "财务报表",
      voucherNo: "记-202506-019"
    },
    {
      id: "FY20250331001",
      date: "2025-03-31",
      entityId: "sz",
      projectId: null,
      category: "人员人工",
      summary: "深圳研发人员工资 - 3 月",
      vendor: "内部员工",
      amount: 960000,
      eligibleAmount: 960000,
      recognitionStatus: "可归集",
      allocationStatus: "部分分摊",
      source: "财务报表",
      voucherNo: "记-202503-102",
      allocations: [
        { projectId: "SZ-RAW-001", percent: 45 },
        { projectId: "SZ-FERMENT-002", percent: 35 },
        { projectId: "SZ-EVAL-003", percent: 20 }
      ]
    },
    {
      id: "FY20250430001",
      date: "2025-04-30",
      entityId: "sz",
      projectId: null,
      category: "人员人工",
      summary: "深圳研发人员工资 - 4 月",
      vendor: "内部员工",
      amount: 1120000,
      eligibleAmount: 1120000,
      recognitionStatus: "可归集",
      allocationStatus: "待分摊",
      source: "财务报表",
      voucherNo: "记-202504-115",
      allocations: []
    },
    {
      id: "FY20250512001",
      date: "2025-05-12",
      entityId: "sz",
      projectId: "SZ-FERMENT-002",
      category: "直接投入",
      summary: "高效液相色谱仪配件",
      vendor: "安捷伦科技",
      amount: 215000,
      eligibleAmount: 172000,
      recognitionStatus: "待确认口径",
      allocationStatus: "无需分摊",
      source: "行政补录",
      voucherNo: "记-202505-044"
    },
    {
      id: "FY20250519001",
      date: "2025-05-19",
      entityId: "sz",
      projectId: "SZ-RAW-001",
      category: "检测检验",
      summary: "新原料安全性评价",
      vendor: "广东省检测院",
      amount: 680000,
      eligibleAmount: 680000,
      recognitionStatus: "可归集",
      allocationStatus: "无需分摊",
      source: "财务报表",
      voucherNo: "记-202505-073"
    },
    {
      id: "FY20250616001",
      date: "2025-06-16",
      entityId: "sz",
      projectId: "SZ-EVAL-003",
      category: "注册法规",
      summary: "备案路径咨询服务",
      vendor: "深圳启证咨询",
      amount: 160000,
      eligibleAmount: 80000,
      recognitionStatus: "待确认口径",
      allocationStatus: "无需分摊",
      source: "行政补录",
      voucherNo: "记-202506-046"
    },
    {
      id: "FY20250718001",
      date: "2025-07-18",
      entityId: "sz",
      projectId: "SZ-FERMENT-002",
      category: "委外研发",
      summary: "发酵参数优化委外实验",
      vendor: "广州益研生物",
      amount: 740000,
      eligibleAmount: 740000,
      recognitionStatus: "可归集",
      allocationStatus: "无需分摊",
      source: "财务报表",
      voucherNo: "记-202507-058"
    }
  ],
  reminders: [
    {
      id: "R-001",
      title: "2025 年审计年报归档",
      projectId: "HZ-RD-2025",
      dueDate: "2026-06-30",
      level: "high",
      status: "未完成",
      detail: "钱塘区研发费用补贴通常需要年审口径数据，需提前锁定审计报告。"
    },
    {
      id: "R-002",
      title: "深圳研发人员工时分摊确认",
      projectId: "SZ-RAW-001",
      dueDate: "2026-06-25",
      level: "high",
      status: "未完成",
      detail: "4 月人员费用仍未按课题分摊，影响三个深圳课题研发投入达标率。"
    },
    {
      id: "R-003",
      title: "钱塘区场地补贴材料窗口",
      projectId: "HZ-SITE-2025",
      dueDate: "2026-07-01",
      level: "mid",
      status: "未完成",
      detail: "需核对租赁合同、付款流水及场地使用说明。"
    },
    {
      id: "R-004",
      title: "待确认研发口径费用复核",
      projectId: "SZ-FERMENT-002",
      dueDate: "2026-06-28",
      level: "mid",
      status: "处理中",
      detail: "设备配件、备案咨询、场地费用需要财务复核是否进入研发费用口径。"
    },
    {
      id: "R-005",
      title: "深圳课题中期材料提交",
      projectId: "SZ-FERMENT-002",
      dueDate: "2026-08-05",
      level: "low",
      status: "未完成",
      detail: "发酵工艺放大研发课题需准备费用台账和阶段总结。"
    }
  ],
  roles: [
    {
      name: "CEO",
      people: "管理层",
      view: "全部主体与项目",
      input: "不可录入",
      approve: "最终查看"
    },
    {
      name: "CFO",
      people: "财务负责人",
      view: "全部主体与项目",
      input: "可录入、可导入",
      approve: "可审核费用、可修改政策门槛"
    },
    {
      name: "项目负责人",
      people: "张英",
      view: "全部项目",
      input: "可补充项目说明",
      approve: "可确认项目归属"
    },
    {
      name: "两地行政",
      people: "深圳行政、杭州行政",
      view: "所属主体",
      input: "可新增费用、提醒事项",
      approve: "不可修改政策门槛"
    }
  ]
};

const ui = {
  page: "dashboard",
  entity: "all",
  year: "all",
  month: "2025-05",
  analysisBudget: 1000000,
  search: "",
  allocationExpenseId: null
};

let db = loadState();

const dom = {
  navList: document.getElementById("navList"),
  sidebarEntity: document.getElementById("sidebarEntity"),
  entityTabs: document.getElementById("entityTabs"),
  yearFilter: document.getElementById("yearFilter"),
  globalSearch: document.getElementById("globalSearch"),
  pageTitle: document.getElementById("pageTitle"),
  pageSub: document.getElementById("pageSub"),
  main: document.getElementById("mainContent"),
  modalLayer: document.getElementById("modalLayer"),
  authLayer: document.getElementById("authLayer"),
  syncStatus: document.getElementById("syncStatus"),
  logoutButton: document.getElementById("logoutButton"),
  accountAvatar: document.getElementById("accountAvatar"),
  accountName: document.getElementById("accountName"),
  accountRole: document.getElementById("accountRole"),
  toast: document.getElementById("toast")
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return migrateState(raw ? JSON.parse(raw) : clone(seed));
  } catch {
    return migrateState(clone(seed));
  }
}

function migrateState(state) {
  state.entities?.forEach((entity) => {
    if (entity.name === "杭州微星") entity.name = "杭州微新";
  });
  if (!state.projects.some((project) => project.id === "HZ-HNTE-2026")) {
    state.projects.splice(2, 0, clone(seed.projects.find((project) => project.id === "HZ-HNTE-2026")));
  }
  if (!state.reminders.some((reminder) => reminder.id === "R-006")) {
    state.reminders.push({
      id: "R-006",
      title: "国高认定条件预审",
      projectId: "HZ-HNTE-2026",
      dueDate: "2026-08-20",
      level: "mid",
      status: "未完成",
      detail: "核对研发费用专项审计、知识产权、科技人员、成果转化和高新收入材料。"
    });
  }
  state.expenses?.forEach((expense) => {
    if (!expense.reviewMonth) expense.reviewMonth = (expense.date || "").slice(0, 7);
    if (!expense.reviewStatus) {
      expense.reviewStatus = expense.recognitionStatus === "可归集" && expense.allocationStatus !== "待分摊"
        ? "已审核"
        : "待负责人审核";
    }
    if (!expense.submitter) expense.submitter = expense.source?.includes("导入") ? "财务" : "行政/财务";
    if (!expense.reviewer) expense.reviewer = state.projects.find((project) => project.id === expense.projectId)?.owner || "张英";
  });
  state.projects?.forEach((project) => {
    if (project.id === "SZ-RAW-001" && !project.opportunityName) {
      project.opportunityName = "化妆品新原料备案";
      project.opportunityStage = "研发与备案准备中";
      project.expectedHzSubsidy = Number(project.expectedHzSubsidy || 0);
      project.expectedSzSubsidy = Number(project.expectedSzSubsidy || 0);
      project.opportunityNextStep = "完成新原料备案后，分别评估杭州微新和深圳微智可申请的补贴政策。";
    }
    if (project.opportunityName) {
      project.expectedHzSubsidy = Number(project.expectedHzSubsidy || 0);
      project.expectedSzSubsidy = Number(project.expectedSzSubsidy || 0);
      if (!project.opportunityStage) project.opportunityStage = "推进中";
      if (!project.opportunityNextStep) project.opportunityNextStep = "确认项目成果后，评估杭州和深圳两边可申请的补贴。";
    }
    if (!project.executionStatus) {
      project.executionStatus = project.policyResult === "已认定" ? "已完成" : (dateDiffDays(project.materialDeadline) < 0 ? "逾期待补" : "执行中");
    }
    if (!project.approvalDate) project.approvalDate = project.year ? `${project.year}-06-30` : "待确认";
    if (!project.researchDirection) project.researchDirection = inferResearchDirection(project);
    if (project.declaredAmount == null || (Number(project.declaredAmount || 0) === 0 && Number(project.received || 0) > 0)) {
      project.declaredAmount = Number(project.received || 0)
        ? Math.round(Number(project.received || 0) / Math.max(Number(project.subsidyRate || 0.2), 0.01))
        : 0;
    }
    if (!project.nextProcess) project.nextProcess = defaultNextProcess(project);
    if (!project.materialNeeds) project.materialNeeds = defaultMaterialNeeds(project);
    if (project.executionProgress == null) {
      project.executionProgress = isFundingProjectShape(project)
        ? 0
        : Number(project.requirementProgress || 0);
    }
    if (!project.formStatus) project.formStatus = "已导入基础信息";
    if (!project.lastUpdate) project.lastUpdate = "2026-06-18";
    if (!project.completedInfo) {
      project.completedInfo = isFundingProjectShape(project)
        ? "已建立政策档案，部分费用已归集，材料节点待持续更新。"
        : "已建立政策档案，条件清单和材料进度待项目负责人补充。";
    }
    if (!project.nextStep) {
      project.nextStep = isFundingProjectShape(project)
        ? "按月确认费用归集，补齐申报材料。"
        : "补充条件达标说明、证明材料和申报批次。";
    }
  });
  return state;
}

function isFundingProjectShape(project) {
  return project.applicationKind !== "qualification" && Number(project.threshold || 0) > 0;
}

function inferResearchDirection(project) {
  const text = `${project.name || ""} ${project.type || ""} ${project.note || ""}`;
  if (/新原料|化妆品/.test(text)) return "化妆品新原料";
  if (/发酵|工艺|放大|生产/.test(text)) return "发酵工艺与生产放大";
  if (/功效|评价|备案/.test(text)) return "功效评价与备案支持";
  if (/场地|平台|园区/.test(text)) return "研发平台与场地";
  if (/国高|高新|资质|认定/.test(text)) return "企业资质与创新能力";
  if (/钱塘|杭州|半亩森林/.test(text)) return "杭州研发与中后台支持";
  return "待负责人确认";
}

function defaultNextProcess(project) {
  return isFundingProjectShape(project)
    ? "费用归集确认 -> 项目负责人审核 -> 财务复核 -> 审计/材料提交 -> 政府拨付"
    : "条件预审 -> 证明材料整理 -> 申报提交 -> 受理/公示 -> 认定归档";
}

function defaultMaterialNeeds(project) {
  return isFundingProjectShape(project)
    ? "研发费用辅助账、凭证清单、项目阶段总结、审计或专项报告、合同/付款证明"
    : "研发费用专项审计、知识产权、科技人员、成果转化、高新收入及申报书";
}

function isCloudConfigured() {
  return Boolean(APP_CONFIG.cloudbaseEnvId);
}

function getCloudbaseSdk() {
  return window.cloudbase || window.tcb || null;
}

function findAllowedAccount(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  return ALLOWED_ACCOUNTS.find((account) => account.email === normalizedEmail) || null;
}

function readStoredSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    const account = findAllowedAccount(session?.email);
    if (!account) return null;
    return { email: account.email, role: account.role || "已登录用户" };
  } catch {
    return null;
  }
}

function storeSession(email) {
  const account = findAllowedAccount(email);
  if (!account) return null;
  const session = { email: account.email, role: account.role || "已登录用户", loginAt: new Date().toISOString() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

function setSyncStatus(text, tone = "local") {
  if (!dom.syncStatus) return;
  dom.syncStatus.textContent = text;
  dom.syncStatus.dataset.tone = tone;
}

function updateAccountUi() {
  const email = cloud.user?.email || "";
  const configured = isCloudConfigured();
  if (dom.logoutButton) dom.logoutButton.hidden = !cloud.user;
  if (dom.accountAvatar) dom.accountAvatar.textContent = email ? email.slice(0, 1).toUpperCase() : "登";
  if (dom.accountName) dom.accountName.textContent = email || (configured ? "未登录" : "本机模式");
  if (dom.accountRole) dom.accountRole.textContent = cloud.user ? cloud.role : "请用公司邮箱登录";
}

function renderAuthGate(message = "") {
  if (!dom.authLayer) return;
  const accountHint = ALLOWED_ACCOUNTS.map((account) => account.email).join(" / ");
  dom.authLayer.hidden = false;
  dom.authLayer.innerHTML = `
    <div class="auth-card" role="dialog" aria-modal="true">
      <div>
        <h1>研发补贴平衡台账</h1>
        <p>登录后，杭州、深圳和管理层打开同一个网址，会看到同一份最新数据。</p>
      </div>
      ${message ? `<div class="auth-message">${escapeHtml(message)}</div>` : ""}
      <form id="loginForm" class="auth-form">
        <label>
          <span>邮箱账号</span>
          <input name="email" type="email" autocomplete="email" placeholder="yin.chen@synbiome.cn" required>
        </label>
        <label>
          <span>密码</span>
          <input name="password" type="password" autocomplete="current-password" placeholder="统一密码" required>
        </label>
      </form>
      <div class="auth-actions">
        <button class="button primary" type="button" data-action="login">登录</button>
      </div>
      <div class="auth-footnote">
        允许登录账号：${escapeHtml(accountHint)}。
      </div>
    </div>
  `;
}

function hideAuthGate() {
  if (!dom.authLayer) return;
  dom.authLayer.hidden = true;
  dom.authLayer.innerHTML = "";
}

async function initCloud() {
  const session = readStoredSession();
  if (!session) {
    cloud.user = null;
    cloud.role = "未登录";
    setSyncStatus("未登录", "local");
    updateAccountUi();
    renderAuthGate();
    return;
  }
  cloud.user = { email: session.email };
  cloud.role = session.role;
  updateAccountUi();
  hideAuthGate();
  await prepareCloudbase();
  await loadCloudState();
  startCloudPolling();
  render();
}

async function loginWithPassword() {
  const form = document.getElementById("loginForm");
  if (!form?.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form));
  const email = String(data.email || "").trim().toLowerCase();
  const account = findAllowedAccount(email);
  if (!account) {
    renderAuthGate("这个邮箱还没有加入允许名单，请使用公司指定账号。");
    setSyncStatus("登录失败", "error");
    return;
  }
  if (String(data.password || "") !== String(APP_CONFIG.loginPassword || "")) {
    setSyncStatus("登录失败", "error");
    renderAuthGate("密码不对，请重新输入。");
    return;
  }
  const session = storeSession(email);
  cloud.user = { email: session.email };
  cloud.role = session.role;
  hideAuthGate();
  updateAccountUi();
  setSyncStatus("登录腾讯云", "syncing");
  let cloudLoginOk = false;
  try {
    cloudLoginOk = await signInCloudbaseAccount(account);
  } catch (error) {
    cloudLoginOk = false;
  }
  setSyncStatus(cloudLoginOk ? "已连接腾讯云" : "本机保存", cloudLoginOk ? "ok" : "local");
  showToast(cloudLoginOk ? "登录成功，已连接腾讯云" : "已进入台账，腾讯云同步暂未连上");
  if (cloudLoginOk) await loadCloudState();
  startCloudPolling();
  render();
}

async function sendLoginLink() {
  renderAuthGate("现在已经改成统一密码登录，不需要邮件。");
}

async function logout() {
  stopCloudPolling();
  try {
    const auth = getCloudbaseAuth();
    if (auth?.signOut) await auth.signOut();
  } catch {
    // 退出本地会话即可。
  }
  localStorage.removeItem(SESSION_KEY);
  cloud.user = null;
  cloud.role = "未登录";
  updateAccountUi();
  setSyncStatus("未登录", "local");
  renderAuthGate();
  showToast("已退出登录");
}

async function prepareCloudbase() {
  if (!isCloudConfigured()) {
    cloud.enabled = false;
    setSyncStatus("本机保存", "local");
    return false;
  }
  if (window.location.protocol === "file:") {
    cloud.enabled = false;
    setSyncStatus("本机预览", "local");
    return false;
  }
  const sdk = getCloudbaseSdk();
  if (!sdk?.init) {
    cloud.enabled = false;
    setSyncStatus("本机保存", "local");
    return false;
  }
  try {
    if (!cloud.app) {
      cloud.app = sdk.init({ env: APP_CONFIG.cloudbaseEnvId });
    }
    cloud.db = typeof cloud.app.database === "function" ? cloud.app.database() : cloud.app.database;
    cloud.enabled = Boolean(cloud.db);
    setSyncStatus(cloud.enabled ? "已连接腾讯云" : "本机保存", cloud.enabled ? "ok" : "local");
    return cloud.enabled;
  } catch (error) {
    cloud.enabled = false;
    setSyncStatus("本机保存", "local");
    return false;
  }
}

function getCloudbaseAuth() {
  if (!cloud.app) return;
  return typeof cloud.app.auth === "function"
    ? cloud.app.auth({ persistence: "local" })
    : cloud.app.auth;
}

async function signInCloudbaseAccount(account) {
  if (window.location.protocol === "file:") return false;
  const ready = await prepareCloudbase();
  if (!ready) return false;
  const auth = getCloudbaseAuth();
  if (!auth) return;
  try {
    if (auth.signOut) await auth.signOut();
  } catch {
    // 后续登录会覆盖旧状态。
  }
  if (typeof auth.signInWithPassword !== "function") return false;
  await auth.signInWithPassword({
    username: account.cloudUsername || account.email,
    password: APP_CONFIG.cloudbaseLoginPassword || APP_CONFIG.loginPassword
  });
  if (typeof auth.getLoginState === "function") {
    const state = await auth.getLoginState();
    return Boolean(state);
  }
  return true;
}

function cloudCollection() {
  return cloud.db?.collection?.(CLOUD_TABLE) || null;
}

function normalizeCloudRecord(response) {
  let record = response?.data ?? response;
  if (Array.isArray(record)) record = record[0] || null;
  return record || null;
}

function cloudPayload() {
  return {
    orgId: CLOUD_ORG_ID,
    data: db,
    updatedBy: cloud.user?.email || "unknown",
    updatedAt: new Date().toISOString()
  };
}

async function setCloudDoc(doc, payload) {
  try {
    return await doc.set(payload);
  } catch (firstError) {
    try {
      return await doc.set({ data: payload });
    } catch {
      try {
        return await doc.update(payload);
      } catch {
        try {
          return await doc.update({ data: payload });
        } catch {
          throw firstError;
        }
      }
    }
  }
}

async function loadCloudState() {
  if (!cloud.user) return;
  if (!cloud.db) {
    const ready = await prepareCloudbase();
    if (!ready) return;
  }
  const collection = cloudCollection();
  if (!collection) return;
  cloud.loading = true;
  setSyncStatus("读取腾讯云", "syncing");
  try {
    const record = normalizeCloudRecord(await collection.doc(CLOUD_ORG_ID).get());
    if (record?.data && Array.isArray(record.data.projects) && Array.isArray(record.data.expenses)) {
      const remoteStamp = record.updatedAt || record.updated_at || null;
      cloud.applyingRemote = true;
      db = migrateState(record.data);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      cloud.applyingRemote = false;
      cloud.lastSavedAt = remoteStamp || cloud.lastSavedAt;
      setSyncStatus("已同步", "ok");
    } else {
      await saveCloudState(true);
    }
  } catch (error) {
    setSyncStatus("本机保存", "local");
    showToast("腾讯云数据库暂时没连上，数据先保存在本机");
  } finally {
    cloud.loading = false;
    updateAccountUi();
  }
}

function queueCloudSave() {
  if (!cloud.user || cloud.applyingRemote) return;
  window.clearTimeout(cloud.saveTimer);
  cloud.saveTimer = window.setTimeout(() => saveCloudState(), 650);
}

async function saveCloudState(force = false) {
  if (!cloud.user) return;
  if (cloud.loading && !force) return;
  if (!cloud.db) {
    const ready = await prepareCloudbase();
    if (!ready) return;
  }
  const collection = cloudCollection();
  if (!collection) return;
  const payload = cloudPayload();
  try {
    setSyncStatus("保存腾讯云", "syncing");
    await setCloudDoc(collection.doc(CLOUD_ORG_ID), payload);
    cloud.lastSavedAt = payload.updatedAt;
    setSyncStatus("已同步", "ok");
  } catch (error) {
    setSyncStatus("本机保存", "local");
    showToast("腾讯云保存失败，数据已先保存在本机");
    return;
  }
}

function startCloudPolling() {
  stopCloudPolling();
  if (!cloud.user) return;
  cloud.pollTimer = window.setInterval(async () => {
    await loadCloudState();
    render();
  }, CLOUD_POLL_MS);
}

function stopCloudPolling() {
  window.clearInterval(cloud.pollTimer);
  cloud.pollTimer = null;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  queueCloudSave();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(amount) {
  return Number(amount || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

function wan(amount, digits = 1) {
  return (Number(amount || 0) / 10000).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function pct(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function dateDiffDays(dateText) {
  const target = new Date(`${dateText}T00:00:00`);
  return Math.ceil((target - TODAY) / 86400000);
}

function entityById(id) {
  return db.entities.find((item) => item.id === id);
}

function projectById(id) {
  return db.projects.find((item) => item.id === id);
}

function projectByCode(code) {
  return db.projects.find((item) => item.code === code || item.id === code);
}

function entityColor(id) {
  return id === "hz" ? "hz" : "sz";
}

function isFundingProject(project) {
  return project.applicationKind !== "qualification" && Number(project.threshold || 0) > 0;
}

function isBalanceProject(project) {
  const text = `${project.name || ""} ${project.type || ""} ${project.accountingScope || ""}`;
  return isFundingProject(project) && !/场地|租赁|房租|物业|资质|认定/.test(text);
}

function isOpportunityProject(project) {
  return Boolean(project.opportunityName || Number(project.expectedHzSubsidy || 0) > 0 || Number(project.expectedSzSubsidy || 0) > 0);
}

function filteredOpportunityProjects() {
  return filteredProjects().filter(isOpportunityProject);
}

function expectedSubsidyTotal(project) {
  return Number(project.expectedHzSubsidy || 0) + Number(project.expectedSzSubsidy || 0);
}

function expectedSubsidyLabel(amount) {
  return Number(amount || 0) > 0 ? `${wan(amount)} 万` : "待估算";
}

function projectKindLabel(project) {
  return isFundingProject(project) ? "资金类" : "政策/资质类";
}

function riskTag(level) {
  if (level === "high") return '<span class="tag red">高风险</span>';
  if (level === "mid") return '<span class="tag amber">中风险</span>';
  return '<span class="tag green">低风险</span>';
}

function statusTag(status) {
  const map = {
    "可归集": "green",
    "待确认口径": "amber",
    "不建议归集": "red",
    "待负责人审核": "amber",
    "已审核": "green",
    "退回调整": "red",
    "待导入": "gray",
    "已导入基础信息": "blue",
    "待负责人更新": "amber",
    "已更新": "green",
    "未启动": "gray",
    "执行中": "blue",
    "推进中": "blue",
    "研发与备案准备中": "blue",
    "已取得": "green",
    "材料准备中": "amber",
    "已提交": "teal",
    "已完成": "green",
    "暂停": "gray",
    "逾期待补": "red",
    "已分摊": "teal",
    "部分分摊": "amber",
    "待分摊": "blue",
    "待匹配项目": "blue",
    "无需分摊": "gray",
    "未完成": "red",
    "处理中": "amber",
    "已完成": "green",
    "正常": "green"
  };
  return `<span class="tag ${map[status] || "gray"}">${escapeHtml(status)}</span>`;
}

function filteredProjects() {
  const term = ui.search.trim().toLowerCase();
  return db.projects.filter((project) => {
    if (ui.entity !== "all" && project.entityId !== ui.entity) return false;
    if (ui.year !== "all" && project.year !== ui.year) return false;
    if (!term) return true;
    const haystack = [
      project.name,
      project.code,
      project.type,
      project.area,
      entityById(project.entityId)?.name
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  });
}

function filteredExpenses() {
  const term = ui.search.trim().toLowerCase();
  const visibleProjectIds = new Set(filteredProjects().map((item) => item.id));
  return db.expenses.filter((expense) => {
    if (ui.entity !== "all" && expense.entityId !== ui.entity) return false;
    if (ui.year !== "all" && !expense.date.startsWith(ui.year)) return false;
    if (expense.projectId && !visibleProjectIds.has(expense.projectId) && ui.search) return false;
    if (!term) return true;
    const project = projectById(expense.projectId);
    const haystack = [
      expense.id,
      expense.summary,
      expense.category,
      expense.vendor,
      expense.voucherNo,
      expense.source,
      expense.recognitionStatus,
      project?.name,
      project?.code,
      entityById(expense.entityId)?.name
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  });
}

function contributionForProject(expense, projectId) {
  if (expense.recognitionStatus === "不建议归集") return 0;
  if (Array.isArray(expense.allocations) && expense.allocations.length) {
    const allocation = expense.allocations.find((item) => item.projectId === projectId);
    return allocation ? Number(expense.eligibleAmount || expense.amount) * allocation.percent / 100 : 0;
  }
  return expense.projectId === projectId ? Number(expense.eligibleAmount || expense.amount) : 0;
}

function fundingRequested(project) {
  return Number(project.declaredAmount || 0);
}

function fundingReceiptProgress(project) {
  const requested = fundingRequested(project);
  return requested > 0 ? Number(project.received || 0) / requested : 0;
}

function clampPercent(value) {
  return Math.max(0, Math.min(Number(value || 0), 1));
}

function aggregateProject(project) {
  const days = dateDiffDays(project.materialDeadline);
  if (!isFundingProject(project)) {
    const progress = Math.max(0, Math.min(Number(project.requirementProgress || 0) / 100, 1));
    let risk = "low";
    if (days < 0 || progress < 0.45) risk = "high";
    else if (days <= 45 || progress < 0.75) risk = "mid";
    return {
      confirmed: 0,
      pending: 0,
      total: 0,
      gap: 0,
      progress,
      investmentProgress: 0,
      fundingProgress: 0,
      fundingRequested: 0,
      risk,
      expectedSubsidy: 0
    };
  }
  let confirmed = Number(project.baselineCollected || 0);
  let pending = 0;
  let total = Number(project.baselineCollected || 0);
  db.expenses.forEach((expense) => {
    const value = contributionForProject(expense, project.id);
    if (!value) return;
    total += value;
    if (expense.recognitionStatus === "待确认口径") pending += value;
    if (expense.recognitionStatus === "可归集") confirmed += value;
  });
  const progress = project.threshold > 0 ? total / project.threshold : 1;
  const fundingProgress = fundingReceiptProgress(project);
  const requested = fundingRequested(project);
  const gap = Math.max(project.threshold - total, 0);
  let risk = "low";
  if (days < 0 || progress < 0.55 || pending > project.threshold * 0.18) risk = "high";
  else if (days <= 30 || progress < 0.85 || pending > 0) risk = "mid";
  return {
    confirmed,
    pending,
    total,
    gap,
    progress,
    investmentProgress: progress,
    fundingProgress,
    fundingRequested: requested,
    risk,
    expectedSubsidy: Math.min(total * project.subsidyRate, project.cap)
  };
}

function aggregateEntity(entityId) {
  const projects = db.projects.filter((item) => item.entityId === entityId && isBalanceProject(item) && (ui.year === "all" || item.year === ui.year));
  return projects.reduce(
    (acc, project) => {
      const aggregate = aggregateProject(project);
      acc.target += project.threshold;
      acc.collected += aggregate.total;
      acc.pending += aggregate.pending;
      acc.received += project.received;
      acc.declared += fundingRequested(project);
      acc.gap += aggregate.gap;
      acc.fundingCount += 1;
      acc.projectCount += 1;
      if (aggregate.risk === "high") acc.highRisk += 1;
      if (aggregate.risk === "mid") acc.midRisk += 1;
      return acc;
    },
    { target: 0, collected: 0, pending: 0, received: 0, declared: 0, gap: 0, projectCount: 0, fundingCount: 0, policyCount: 0, highRisk: 0, midRisk: 0 }
  );
}

function progressClass(progress) {
  if (progress < 0.6) return "red";
  if (progress < 0.9) return "amber";
  return "";
}

function render() {
  renderNav();
  renderFilters();
  const current = navItems.find((item) => item[0] === ui.page);
  dom.pageTitle.textContent = current?.[1] || "仪表盘";
  dom.pageSub.textContent = current?.[2] || "";
  const renderers = {
    dashboard: renderDashboard,
    analysis: renderSmartAnalysis,
    monthly: renderMonthly,
    report: renderMonthlyReport,
    intake: renderProjectIntake,
    projects: renderProjects,
    ledger: renderLedger,
    allocate: renderAllocate,
    policy: renderPolicy,
    reminders: renderReminders,
    permissions: renderPermissions
  };
  dom.main.innerHTML = (renderers[ui.page] || renderDashboard)();
  if (ui.page === "allocate") bindAllocationInputs();
}

function renderNav() {
  dom.navList.innerHTML = navItems
    .map(([id, label]) => `
      <button type="button" class="nav-item ${ui.page === id ? "active" : ""}" data-nav="${id}">
        ${icons[id] || icons.dashboard}
        <span>${label}</span>
      </button>
    `)
    .join("");
}

function renderFilters() {
  [...dom.entityTabs.querySelectorAll("button")].forEach((button) => {
    button.classList.toggle("active", button.dataset.entity === ui.entity);
  });
  dom.sidebarEntity.value = ui.entity;
  dom.yearFilter.value = ui.year;
  dom.globalSearch.value = ui.search;
}

function renderDashboard() {
  const projects = filteredProjects().filter(isBalanceProject);
  const opportunities = filteredOpportunityProjects();
  const summary = buildExecutiveSummary(projects);
  return `
    <section class="leader-strip span-full" aria-label="领导摘要">
      ${summary.map((item) => `
        <article class="leader-card ${item.tone}">
          <label>${escapeHtml(item.label)}</label>
          <strong>${escapeHtml(item.value)}</strong>
          <span>${escapeHtml(item.help)}</span>
        </article>
      `).join("")}
    </section>
    <div class="entity-summary span-full">
      ${db.entities
        .filter((entity) => ui.entity === "all" || entity.id === ui.entity)
        .map(renderEntityCard)
        .join("")}
    </div>
    <div class="page-stack">
      <section class="panel span-full">
        <div class="panel-header">
          <div class="panel-title">
            <h2>两地研发投入平衡表</h2>
            <span class="count">核心</span>
          </div>
          <button class="button primary small" type="button" data-nav-target="monthly">录入本月数字</button>
        </div>
        ${renderEntityBalanceTable()}
      </section>

      <section class="panel span-full">
        <div class="panel-header">
          <div class="panel-title">
            <h2>项目缺口清单</h2>
            <span class="count">${projects.length}</span>
          </div>
          <button class="button small" type="button" data-nav-target="projects">设置项目</button>
        </div>
        ${renderSimpleProjectGapTable(projects)}
      </section>

      <section class="panel span-full">
        <div class="panel-header">
          <div class="panel-title">
            <h2>关键项目机会</h2>
            <span class="count">${opportunities.length}</span>
          </div>
          <button class="button small" type="button" data-nav-target="projects">维护项目</button>
        </div>
        ${renderOpportunityTable(opportunities)}
      </section>

      <section class="panel span-full executive-actions">
        <div class="panel-header">
          <div class="panel-title">
            <h2>日常只做五件事</h2>
            <span class="count">简单版</span>
          </div>
        </div>
        <div class="action-grid">
          <button type="button" class="action-tile" data-nav-target="projects">
            <strong>1. 先设项目</strong>
            <span>录入两地项目的政府要求研发投入、补贴申请金额和已到账金额。</span>
          </button>
          <button type="button" class="action-tile" data-nav-target="monthly">
            <strong>2. 每月录数字</strong>
            <span>每个项目只填一个本月新增研发投入数字，保存后自动更新缺口。</span>
          </button>
          <button type="button" class="action-tile" data-nav-target="dashboard">
            <strong>3. 看缺口分配</strong>
            <span>优先把后续研发支出安排到达标率低、缺口大的主体和项目。</span>
          </button>
          <button type="button" class="action-tile" data-nav-target="analysis">
            <strong>4. 看智能分析</strong>
            <span>自动列出最该处理的缺口、待确认费用、分摊和材料风险。</span>
          </button>
          <button type="button" class="action-tile" data-nav-target="report">
            <strong>5. 发月报提醒</strong>
            <span>每月生成一份简版汇报，复制到邮件或微信群，提醒两地费用是否够。</span>
          </button>
        </div>
      </section>
    </div>
  `;
}

function renderEntityBalanceTable() {
  const rows = db.entities
    .filter((entity) => ui.entity === "all" || entity.id === ui.entity)
    .map((entity) => {
      const aggregate = aggregateEntity(entity.id);
      const investmentProgress = aggregate.target ? aggregate.collected / aggregate.target : 0;
      const fundingProgress = aggregate.declared ? aggregate.received / aggregate.declared : 0;
      return `
        <tr>
          <td><span class="entity-badge ${entityColor(entity.id)}">${entity.short}</span> <strong>${escapeHtml(entity.name)}</strong></td>
          <td>${wan(aggregate.target)} 万</td>
          <td>${wan(aggregate.collected)} 万</td>
          <td>
            ${renderRatioCell("达标率", aggregate.collected, aggregate.target, `缺口 ${wan(aggregate.gap)} 万`)}
          </td>
          <td>${wan(aggregate.declared)} 万</td>
          <td>${wan(aggregate.received)} 万</td>
          <td>
            ${renderRatioCell("到账率", aggregate.received, aggregate.declared, `未到账 ${wan(Math.max(aggregate.declared - aggregate.received, 0))} 万`)}
          </td>
          <td>${balanceAdvice(aggregate, entity)}</td>
        </tr>
      `;
    });
  return `
    <div class="table-wrap">
      <table class="data-table simple-table">
        <thead>
          <tr>
            <th>主体</th>
            <th>政府要求研发投入</th>
            <th>当前已归集</th>
            <th>研发投入达标率</th>
            <th>补贴申请金额</th>
            <th>补贴已到账</th>
            <th>补贴资金到账率</th>
            <th>建议</th>
          </tr>
        </thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    </div>
  `;
}

function balanceAdvice(aggregate, entity) {
  if (!aggregate.target) return '<span class="tag gray">先设置项目目标</span>';
  const progress = aggregate.collected / aggregate.target;
  if (aggregate.gap <= 0) return '<span class="tag green">研发投入已满足</span>';
  if (progress < 0.7) return `<span class="tag red">优先补 ${escapeHtml(entity.short)} 端投入</span>`;
  return `<span class="tag amber">继续补 ${escapeHtml(entity.short)} 端缺口</span>`;
}

function renderSimpleProjectGapTable(projects) {
  if (!projects.length) return '<div class="empty-state">暂无资金类补贴项目，请先到“项目设置”新增项目</div>';
  return `
    <div class="table-wrap">
      <table class="data-table simple-table">
        <thead>
          <tr>
            <th>项目</th>
            <th>主体</th>
            <th>政府要求研发投入</th>
            <th>当前研发投入</th>
            <th>研发投入缺口</th>
            <th>研发投入达标率</th>
            <th>补贴到账率</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${projects.map((project) => {
            const aggregate = aggregateProject(project);
            const entity = entityById(project.entityId);
            return `
              <tr>
                <td><strong>${escapeHtml(project.name)}</strong><div class="muted">${escapeHtml(project.code)} · ${escapeHtml(project.researchDirection || "待确认")}</div></td>
                <td><span class="entity-badge ${entityColor(project.entityId)}">${entity.short}</span> ${escapeHtml(entity.name)}</td>
                <td>${wan(project.threshold)} 万</td>
                <td>${wan(aggregate.total)} 万</td>
                <td><strong class="${aggregate.gap > 0 ? "danger-text" : "money-green"}">${wan(aggregate.gap)} 万</strong></td>
                <td>${renderRatioCell("支出 / 要求", aggregate.total, project.threshold, `还差 ${wan(aggregate.gap)} 万`)}</td>
                <td>${renderRatioCell("到账 / 申请", project.received, fundingRequested(project), `到账 ${wan(project.received)} 万 / 申请 ${wan(fundingRequested(project))} 万`)}</td>
                <td><button class="link-button" type="button" data-action="open-project-update" data-project="${project.id}">更新</button></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderOpportunityTable(projects) {
  if (!projects.length) return '<div class="empty-state">暂无关键项目机会。后续有备案、资质或成果类项目时，可在“项目设置”里补充预期补贴。</div>';
  return `
    <div class="table-wrap">
      <table class="data-table simple-table">
        <thead>
          <tr>
            <th>关键项目/成果</th>
            <th>关联项目</th>
            <th>当前阶段</th>
            <th>杭州预期补贴</th>
            <th>深圳预期补贴</th>
            <th>合计预期</th>
            <th>下一步</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${projects.map((project) => `
            <tr>
              <td><strong>${escapeHtml(project.opportunityName || project.name)}</strong><div class="muted">成果拿到后，再分别匹配两地政策</div></td>
              <td>${escapeHtml(project.name)}<div class="muted">${escapeHtml(project.code)}</div></td>
              <td>${statusTag(project.opportunityStage || project.executionStatus || "推进中")}</td>
              <td>${expectedSubsidyLabel(project.expectedHzSubsidy)}</td>
              <td>${expectedSubsidyLabel(project.expectedSzSubsidy)}</td>
              <td><strong>${expectedSubsidyLabel(expectedSubsidyTotal(project))}</strong></td>
              <td>${escapeHtml(project.opportunityNextStep || "确认成果后评估两地补贴。")}</td>
              <td><button class="link-button" type="button" data-action="open-project-update" data-project="${project.id}">更新</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function availableMonths() {
  const months = [...new Set(db.expenses.map((expense) => (expense.reviewMonth || expense.date || "").slice(0, 7)).filter(Boolean))];
  if (!months.includes(ui.month)) months.push(ui.month);
  return months.sort().reverse();
}

function monthlyExpenses() {
  return db.expenses.filter((expense) => {
    const month = expense.reviewMonth || (expense.date || "").slice(0, 7);
    if (month !== ui.month) return false;
    if (ui.entity !== "all" && expense.entityId !== ui.entity) return false;
    return true;
  });
}

function renderMonthly() {
  const projects = filteredProjects().filter(isBalanceProject);
  const monthlyTotal = projects.reduce((sum, project) => sum + monthlyFixedAmount(project.id, ui.month), 0);
  const hzGap = entityGap("hz");
  const szGap = entityGap("sz");
  return `
    <div class="page-stack">
      <section class="monthly-hero">
        <div>
          <h2>${escapeHtml(ui.month)} 每月录入</h2>
          <p>第一阶段不做复杂费用明细。每月会计只按项目录入一个“本月新增研发投入”数字，系统自动更新杭州/深圳缺口。</p>
        </div>
        <div class="month-controls">
          <label class="inline-field">
            <span>填报月份</span>
            <select id="monthSelect" class="control">
              ${availableMonths().map((month) => `<option value="${month}" ${month === ui.month ? "selected" : ""}>${month}</option>`).join("")}
            </select>
          </label>
          <button class="button primary" type="button" data-action="save-monthly-fixed">保存本月数字</button>
        </div>
      </section>

      <div class="metric-row">
        ${renderTopMetric("本月录入", `${wan(monthlyTotal)} 万元`, "按项目固定数字汇总")}
        ${renderTopMetric("杭州缺口", `${wan(hzGap)} 万元`, "杭州微新研发投入缺口")}
        ${renderTopMetric("深圳缺口", `${wan(szGap)} 万元`, "深圳微智研发投入缺口")}
        ${renderTopMetric("录入项目", projects.length, "仅显示资金类补贴项目")}
      </div>

      <section class="workflow-strip">
        ${renderWorkflowStep("1", "先看缺口", "确认杭州和深圳哪个主体更缺研发投入", "done")}
        ${renderWorkflowStep("2", "录入本月数字", "每个项目只填本月新增研发投入金额", "active")}
        ${renderWorkflowStep("3", "保存后看总览", "系统自动更新达标率和缺口", "wait")}
        ${renderWorkflowStep("4", "下月继续", "后续每月只维护固定数字", "wait")}
      </section>

      <section class="panel">
        <div class="panel-header">
          <div class="panel-title"><h2>本月研发投入录入表</h2><span class="count">${projects.length}</span></div>
          <button class="button primary small" type="button" data-action="save-monthly-fixed">保存本月数字</button>
        </div>
        ${renderMonthlyFixedTable(projects)}
      </section>

      <section class="panel">
        <div class="simple-note-grid">
          <div class="note-box"><strong>会计怎么填</strong><br>每月做账后，按项目填“本月新增研发投入”。如果暂时只知道主体金额，可以先填到对应主体最需要补缺口的项目。</div>
          <div class="note-box"><strong>负责人怎么确认</strong><br>重点确认这笔投入应该放在杭州微新还是深圳微智，以及是否归属于对应补贴项目。</div>
          <div class="note-box"><strong>看什么结果</strong><br>保存后回到“平衡总览”，看研发投入达标率和缺口是否改善。</div>
        </div>
      </section>
    </div>
  `;
}

function entityGap(entityId) {
  return db.projects
    .filter((project) => project.entityId === entityId && isBalanceProject(project) && (ui.year === "all" || project.year === ui.year))
    .reduce((sum, project) => sum + aggregateProject(project).gap, 0);
}

function monthlyFixedAmount(projectId, month) {
  const id = monthlyFixedExpenseId(projectId, month);
  const expense = db.expenses.find((item) => item.id === id);
  return Number(expense?.eligibleAmount || 0);
}

function monthlyFixedExpenseId(projectId, month) {
  return `MI-${month}-${projectId}`.replace(/[^\w-]/g, "-");
}

function renderMonthlyFixedTable(projects) {
  if (!projects.length) return '<div class="empty-state">暂无资金类补贴项目，请先到“项目设置”新增项目</div>';
  return `
    <form id="monthlyFixedForm">
      <div class="table-wrap">
        <table class="data-table simple-table">
          <thead>
            <tr>
              <th>项目</th>
              <th>主体</th>
              <th>政府要求研发投入</th>
              <th>当前累计研发投入</th>
              <th>当前缺口</th>
              <th>本月新增研发投入(元)</th>
            </tr>
          </thead>
          <tbody>
            ${projects.map((project) => {
              const entity = entityById(project.entityId);
              const aggregate = aggregateProject(project);
              return `
                <tr>
                  <td><strong>${escapeHtml(project.name)}</strong><div class="muted">${escapeHtml(project.code)}</div></td>
                  <td><span class="entity-badge ${entityColor(project.entityId)}">${entity.short}</span> ${escapeHtml(entity.name)}</td>
                  <td>${wan(project.threshold)} 万</td>
                  <td>${wan(aggregate.total)} 万</td>
                  <td><strong class="${aggregate.gap > 0 ? "danger-text" : "money-green"}">${wan(aggregate.gap)} 万</strong></td>
                  <td>
                    <input class="number-input monthly-fixed-input" type="number" min="0" step="1000" value="${monthlyFixedAmount(project.id, ui.month) || ""}" data-project="${project.id}" aria-label="${escapeHtml(project.name)}本月新增研发投入">
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </form>
  `;
}

function renderSmartAnalysis() {
  const analysis = buildSmartAnalysisData();
  return `
    <div class="page-stack">
      <section class="monthly-hero">
        <div>
          <h2>智能分析</h2>
          <p>系统基于研发投入缺口、材料截止日、待确认费用和分摊状态，自动生成下一步处理建议。</p>
        </div>
        <div class="month-controls">
          <label class="inline-field">
            <span>假设下月新增研发投入(元)</span>
            <input id="analysisBudgetInput" class="control budget-input" type="number" min="0" step="10000" value="${Number(ui.analysisBudget || 0)}">
          </label>
          <button class="button primary" type="button" data-action="apply-analysis-budget">重新分析</button>
        </div>
      </section>

      <div class="metric-row">
        ${renderTopMetric("优先处理事项", analysis.actions.length, "按风险和影响排序")}
        ${renderTopMetric("待确认费用", `${wan(analysis.pendingTotal)} 万元`, `${analysis.pendingExpenses.length} 条需财务复核`)}
        ${renderTopMetric("待分摊费用", `${wan(analysis.unallocatedTotal)} 万元`, `${analysis.unallocatedExpenses.length} 条需负责人确认`)}
        ${renderTopMetric("30天内节点", analysis.dueSoon.length, "材料或审计节点")}
      </div>

      <section class="panel report-panel">
        <div class="panel-header">
          <div class="panel-title"><h2>系统判断</h2><span class="count">AI native</span></div>
        </div>
        <div class="report-conclusion">
          <strong>${escapeHtml(analysis.conclusion)}</strong>
          <span>${escapeHtml(analysis.nextMove)}</span>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div class="panel-title"><h2>下一步行动清单</h2><span class="count">${analysis.actions.length}</span></div>
          <button class="button small" type="button" data-action="copy-analysis-summary">复制建议</button>
        </div>
        ${renderSmartActionList(analysis.actions)}
      </section>

      <section class="panel">
        <div class="panel-header">
          <div class="panel-title"><h2>费用归集模拟</h2><span class="count">${wan(ui.analysisBudget)} 万</span></div>
          <button class="button small" type="button" data-nav-target="monthly">去录入本月数字</button>
        </div>
        ${renderAllocationPlanTable(analysis)}
      </section>

      <section class="panel">
        <div class="panel-header">
          <div class="panel-title"><h2>账表导入后的数据质量检查</h2><span class="count">${analysis.qualityItems.length}</span></div>
        </div>
        ${renderDataQualityList(analysis.qualityItems)}
      </section>
    </div>
  `;
}

function buildSmartAnalysisData() {
  const projects = db.projects.filter((project) => isBalanceProject(project) && (ui.year === "all" || project.year === ui.year));
  const projectRows = projects.map((project) => ({
    project,
    entity: entityById(project.entityId),
    aggregate: aggregateProject(project),
    days: dateDiffDays(project.materialDeadline)
  }));
  const scopedExpenses = db.expenses.filter((expense) => {
    if (ui.entity !== "all" && expense.entityId !== ui.entity) return false;
    if (ui.year !== "all" && !(expense.date || "").startsWith(ui.year)) return false;
    return true;
  });
  const pendingExpenses = scopedExpenses.filter((expense) => expense.recognitionStatus === "待确认口径");
  const unallocatedExpenses = scopedExpenses.filter((expense) => expense.allocationStatus === "待分摊" || (expense.category === "人员人工" && expense.entityId === "sz" && Array.isArray(expense.allocations) && !expense.allocations.length));
  const pendingTotal = pendingExpenses.reduce((sum, expense) => sum + Number(expense.eligibleAmount || expense.amount || 0), 0);
  const unallocatedTotal = unallocatedExpenses.reduce((sum, expense) => sum + Number(expense.eligibleAmount || expense.amount || 0), 0);
  const dueSoon = buildMonthlyReportUpcomingItems(projects).filter((item) => item.days <= 30);
  const allocationPlan = buildAllocationPlan(projectRows, Number(ui.analysisBudget || 0));
  const actions = buildSmartActions({ projectRows, pendingExpenses, unallocatedExpenses, pendingTotal, unallocatedTotal, dueSoon });
  const qualityItems = buildDataQualityItems({ projectRows, pendingExpenses, unallocatedExpenses, scopedExpenses });
  const worstEntity = buildMonthlyReportData().entityRows
    .filter((row) => row.target && row.gap > 0)
    .sort((a, b) => b.gap - a.gap)[0];
  const conclusion = worstEntity
    ? `${worstEntity.entity.name}仍是当前主要缺口，缺口 ${wan(worstEntity.gap)} 万，达标率 ${pct(worstEntity.investmentProgress)}。`
    : "当前已录入的资金类项目没有研发投入缺口，重点转向材料节点和到账跟踪。";
  const nextMove = actions[0]
    ? `优先处理：${actions[0].title}。${actions[0].nextStep}`
    : "维持每月导入明细账、负责人审核、月报发送三件固定动作。";
  return {
    projects,
    projectRows,
    pendingExpenses,
    unallocatedExpenses,
    pendingTotal,
    unallocatedTotal,
    dueSoon,
    allocationPlan,
    actions,
    qualityItems,
    conclusion,
    nextMove
  };
}

function buildSmartActions({ projectRows, pendingExpenses, unallocatedExpenses, pendingTotal, unallocatedTotal, dueSoon }) {
  const actions = [];
  projectRows.forEach(({ project, entity, aggregate, days }) => {
    if (aggregate.gap <= 0) return;
    if (aggregate.progress < 0.6 || days <= 30) {
      actions.push({
        level: "high",
        title: `补足${entity.name}项目投入`,
        owner: "会计 + 申报负责人",
        detail: `${project.name}缺口 ${wan(aggregate.gap)} 万，达标率 ${pct(aggregate.progress)}，材料截止 ${project.materialDeadline || "待确认"}。`,
        nextStep: `下月新增研发费用优先判断能否归集到${project.name}，并补齐项目依据。`,
        score: 100000000 + aggregate.gap
      });
      return;
    }
    if (aggregate.progress < 0.85) {
      actions.push({
        level: "mid",
        title: `继续补${entity.short}端研发投入`,
        owner: "会计",
        detail: `${project.name}仍差 ${wan(aggregate.gap)} 万，尚未达到安全线。`,
        nextStep: "每月明细账导入后，先匹配到该项目，再由负责人复核。",
        score: 50000000 + aggregate.gap
      });
    }
  });
  if (unallocatedExpenses.length) {
    actions.push({
      level: "high",
      title: "分摊深圳研发人员费用",
      owner: "申报负责人",
      detail: `${unallocatedExpenses.length} 条费用待分摊，金额 ${wan(unallocatedTotal)} 万。`,
      nextStep: "按工时或负责人确认比例分摊到深圳各研发课题。",
      score: 120000000 + unallocatedTotal
    });
  }
  if (pendingExpenses.length) {
    actions.push({
      level: "high",
      title: "复核待确认研发口径",
      owner: "财务",
      detail: `${pendingExpenses.length} 条费用待确认，金额 ${wan(pendingTotal)} 万。`,
      nextStep: "判断是否符合研发费用口径，确认后再计入达标率。",
      score: 110000000 + pendingTotal
    });
  }
  dueSoon.slice(0, 4).forEach((item) => {
    actions.push({
      level: item.days < 0 ? "high" : "mid",
      title: item.days < 0 ? "处理逾期材料节点" : "准备近期材料节点",
      owner: "申报负责人",
      detail: `${item.title}，${item.dueDate || "待确认"}，${item.days < 0 ? `已逾期 ${Math.abs(item.days)} 天` : `剩余 ${item.days} 天`}。`,
      nextStep: item.detail,
      score: (item.days < 0 ? 90000000 : 40000000) + Math.max(0, 30 - item.days)
    });
  });
  return actions.sort((a, b) => b.score - a.score).slice(0, 10);
}

function buildAllocationPlan(projectRows, budget) {
  let remaining = Math.max(Number(budget || 0), 0);
  return projectRows
    .filter((row) => row.aggregate.gap > 0)
    .sort((a, b) => {
      const riskScore = { high: 3, mid: 2, low: 1 };
      return (riskScore[b.aggregate.risk] - riskScore[a.aggregate.risk])
        || (a.days - b.days)
        || (b.aggregate.gap - a.aggregate.gap);
    })
    .map((row) => {
      const suggested = Math.min(row.aggregate.gap, remaining);
      remaining -= suggested;
      return { ...row, suggested: Math.max(suggested, 0), afterGap: Math.max(row.aggregate.gap - suggested, 0) };
    });
}

function buildDataQualityItems({ projectRows, pendingExpenses, unallocatedExpenses, scopedExpenses }) {
  const items = [];
  projectRows.forEach(({ project, aggregate }) => {
    const missing = [];
    if (!project.researchDirection) missing.push("研究方向");
    if (!project.approvalDate || project.approvalDate === "待确认") missing.push("获批日期");
    if (!project.materialDeadline) missing.push("材料截止日");
    if (!project.nextProcess) missing.push("后续流程");
    if (!project.materialNeeds) missing.push("材料清单");
    if (missing.length) {
      items.push({
        level: "mid",
        title: `${project.name}基础信息不完整`,
        detail: `缺少：${missing.join("、")}。`,
        action: "负责人补齐后，月报和风险判断会更准确。"
      });
    }
    if (aggregate.pending > 0) {
      items.push({
        level: "high",
        title: `${project.name}存在待确认金额`,
        detail: `待确认金额 ${wan(aggregate.pending)} 万，当前已暂计入投入但需要财务认定。`,
        action: "财务确认后再作为稳定口径进入月报。"
      });
    }
  });
  const unmatched = scopedExpenses.filter((expense) => !expense.projectId && (!Array.isArray(expense.allocations) || !expense.allocations.length));
  if (unallocatedExpenses.length) {
    items.push({
      level: "high",
      title: "存在未分摊人员费用",
      detail: `${unallocatedExpenses.length} 条，合计 ${wan(unallocatedExpenses.reduce((sum, item) => sum + Number(item.eligibleAmount || item.amount || 0), 0))} 万。`,
      action: "深圳研发人员费用应按课题分摊，否则无法准确判断各课题达标率。"
    });
  }
  if (pendingExpenses.length) {
    items.push({
      level: "high",
      title: "存在待确认研发费用口径",
      detail: `${pendingExpenses.length} 条，合计 ${wan(pendingExpenses.reduce((sum, item) => sum + Number(item.eligibleAmount || item.amount || 0), 0))} 万。`,
      action: "建议每月导入后由财务当天完成口径确认。"
    });
  }
  if (unmatched.length) {
    items.push({
      level: "mid",
      title: "存在未匹配项目的费用",
      detail: `${unmatched.length} 条费用没有项目归属。`,
      action: "导入明细账后优先补项目编号或归属项目。"
    });
  }
  if (!items.length) {
    items.push({
      level: "low",
      title: "数据质量暂未发现明显问题",
      detail: "项目关键字段、费用归属和研发口径当前可用于月报判断。",
      action: "继续保持每月导入和负责人审核。"
    });
  }
  return items;
}

function renderSmartActionList(actions) {
  if (!actions.length) return '<div class="empty-state">暂无需要优先处理的事项</div>';
  return `
    <div class="smart-action-list">
      ${actions.map((item, index) => `
        <article class="smart-action-card ${item.level}">
          <div class="smart-rank">${index + 1}</div>
          <div>
            <div class="smart-action-heading">
              <strong>${escapeHtml(item.title)}</strong>
              ${smartLevelTag(item.level)}
            </div>
            <p>${escapeHtml(item.detail)}</p>
            <small>负责人：${escapeHtml(item.owner)}；下一步：${escapeHtml(item.nextStep)}</small>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderAllocationPlanTable(analysis) {
  if (!analysis.allocationPlan.length) return '<div class="empty-state">暂无研发投入缺口，不需要模拟分配</div>';
  return `
    <div class="table-wrap">
      <table class="data-table simple-table">
        <thead>
          <tr>
            <th>建议顺序</th>
            <th>项目</th>
            <th>主体</th>
            <th>当前缺口</th>
            <th>建议分配</th>
            <th>分配后缺口</th>
            <th>原因</th>
          </tr>
        </thead>
        <tbody>
          ${analysis.allocationPlan.map((row, index) => `
            <tr>
              <td>${index + 1}</td>
              <td><strong>${escapeHtml(row.project.name)}</strong><div class="muted">${escapeHtml(row.project.code)}</div></td>
              <td><span class="entity-badge ${entityColor(row.project.entityId)}">${row.entity.short}</span> ${escapeHtml(row.entity.name)}</td>
              <td><strong class="danger-text">${wan(row.aggregate.gap)} 万</strong></td>
              <td><strong>${wan(row.suggested)} 万</strong></td>
              <td>${wan(row.afterGap)} 万</td>
              <td>${escapeHtml(allocationReason(row))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderDataQualityList(items) {
  return `
    <div class="quality-list">
      ${items.map((item) => `
        <article class="quality-item ${item.level}">
          ${smartLevelTag(item.level)}
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.detail)}</span>
            <small>${escapeHtml(item.action)}</small>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function smartLevelTag(level) {
  const labels = { high: "高优先级", mid: "中优先级", low: "低风险" };
  return `<span class="smart-tag ${level}">${labels[level] || "提示"}</span>`;
}

function allocationReason(row) {
  if (row.aggregate.risk === "high") return "风险高，或材料节点已临近。";
  if (row.days <= 30) return `材料节点剩余 ${row.days} 天。`;
  if (row.aggregate.progress < 0.7) return "研发投入达标率偏低。";
  return "仍有研发投入缺口。";
}

function renderMonthlyReport() {
  const report = buildMonthlyReportData();
  return `
    <div class="page-stack">
      <section class="monthly-hero">
        <div>
          <h2>${escapeHtml(report.month)} 月报简报</h2>
          <p>给领导、财务和申报负责人看的简版提醒：两地主体研发投入是否够、补贴到账是否跟上、下个月优先补哪里。</p>
        </div>
        <div class="month-controls">
          <label class="inline-field">
            <span>汇报月份</span>
            <select id="monthSelect" class="control">
              ${availableMonths().map((month) => `<option value="${month}" ${month === ui.month ? "selected" : ""}>${month}</option>`).join("")}
            </select>
          </label>
          <button class="button" type="button" data-action="open-report-email">邮件草稿</button>
          <button class="button" type="button" data-action="open-monthly-report-html">管理层简报</button>
          <button class="button" type="button" data-action="export-monthly-report">导出文本</button>
          <button class="button primary" type="button" data-action="copy-monthly-report">复制月报</button>
        </div>
      </section>

      <div class="metric-row">
        ${renderTopMetric("研发投入缺口", `${wan(report.totalGap)} 万元`, "两地主体合计")}
        ${renderTopMetric("本月新增投入", `${wan(report.monthInput)} 万元`, "本月已录入归集金额")}
        ${renderTopMetric("补贴到账率", report.totalDeclared ? pct(report.totalReceived / report.totalDeclared) : "0%", `到账 ${wan(report.totalReceived)} / 申请 ${wan(report.totalDeclared)} 万元`)}
        ${renderTopMetric("重点风险", report.riskProjects.length, "仍有缺口或材料节点紧张")}
      </div>

      <section class="panel report-panel">
        <div class="panel-header">
          <div class="panel-title"><h2>本月结论</h2><span class="count">一句话</span></div>
        </div>
        <div class="report-conclusion">
          <strong>${escapeHtml(report.conclusion)}</strong>
          <span>${escapeHtml(report.nextAction)}</span>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div class="panel-title"><h2>两地平衡情况</h2><span class="count">${report.entityRows.length}</span></div>
        </div>
        ${renderReportEntityTable(report)}
      </section>

      <section class="panel">
        <div class="panel-header">
          <div class="panel-title"><h2>项目风险清单</h2><span class="count">${report.riskProjects.length}</span></div>
        </div>
        ${renderReportRiskProjectTable(report)}
      </section>

      <section class="panel">
        <div class="panel-header">
          <div class="panel-title"><h2>近期材料节点</h2><span class="count">${report.upcomingItems.length}</span></div>
        </div>
        ${renderReportUpcomingTable(report)}
      </section>

      <section class="panel">
        <div class="panel-header">
          <div class="panel-title"><h2>可直接发送的文字</h2><span class="count">邮件/微信</span></div>
          <div class="panel-tools">
            <button class="button small" type="button" data-action="copy-monthly-report">复制月报</button>
            <button class="button small" type="button" data-action="open-report-email">邮件草稿</button>
            <button class="button small" type="button" data-action="open-monthly-report-html">管理层简报</button>
            <button class="button small" type="button" data-action="export-monthly-report">导出文本</button>
          </div>
        </div>
        <textarea class="report-textarea" readonly>${escapeHtml(monthlyReportText(report))}</textarea>
      </section>

      <section class="panel">
        <div class="simple-note-grid">
          <div class="note-box"><strong>现在怎么用</strong><br>每月会计录完数字后，申报负责人打开本页。明细给后台人员看，点“管理层简报”给 CEO/CFO 看。</div>
          <div class="note-box"><strong>邮件收件人</strong><br>当前默认发给：${escapeHtml(REPORT_EMAILS.join("、") || "待设置")}。点“邮件草稿”会自动填好标题和正文。</div>
          <div class="note-box"><strong>自动发送怎么做</strong><br>后续接腾讯云定时任务，每月固定一天自动生成管理层简报并发送。需要公司的发件邮箱或企业微信群机器人。</div>
          <div class="note-box"><strong>建议时间</strong><br>每月 5 日前录入上月研发投入，每月 6 日上午发简报，提醒杭州和深圳是否需要调整费用归集。</div>
        </div>
      </section>
    </div>
  `;
}

function buildMonthlyReportData() {
  const projects = db.projects.filter((project) => isBalanceProject(project) && (ui.year === "all" || project.year === ui.year));
  const entityRows = db.entities.map((entity) => {
    const entityProjects = projects.filter((project) => project.entityId === entity.id);
    const row = entityProjects.reduce(
      (acc, project) => {
        const aggregate = aggregateProject(project);
        acc.target += Number(project.threshold || 0);
        acc.collected += aggregate.total;
        acc.gap += aggregate.gap;
        acc.declared += fundingRequested(project);
        acc.received += Number(project.received || 0);
        acc.monthInput += monthlyProjectAmount(project, ui.month);
        if (aggregate.risk === "high") acc.highRisk += 1;
        if (aggregate.risk === "mid") acc.midRisk += 1;
        return acc;
      },
      { entity, projects: entityProjects.length, target: 0, collected: 0, gap: 0, declared: 0, received: 0, monthInput: 0, highRisk: 0, midRisk: 0 }
    );
    row.investmentProgress = row.target ? row.collected / row.target : 0;
    row.fundingProgress = row.declared ? row.received / row.declared : 0;
    row.advice = reportEntityAdvice(row);
    return row;
  });
  const riskProjects = projects
    .map((project) => ({ project, aggregate: aggregateProject(project), entity: entityById(project.entityId) }))
    .filter((row) => row.aggregate.gap > 0 || row.aggregate.risk !== "low")
    .sort((a, b) => {
      const riskScore = { high: 3, mid: 2, low: 1 };
      return (riskScore[b.aggregate.risk] - riskScore[a.aggregate.risk]) || (b.aggregate.gap - a.aggregate.gap);
    })
    .slice(0, 6);
  const totalTarget = entityRows.reduce((sum, row) => sum + row.target, 0);
  const totalCollected = entityRows.reduce((sum, row) => sum + row.collected, 0);
  const totalGap = entityRows.reduce((sum, row) => sum + row.gap, 0);
  const totalDeclared = entityRows.reduce((sum, row) => sum + row.declared, 0);
  const totalReceived = entityRows.reduce((sum, row) => sum + row.received, 0);
  const monthInput = entityRows.reduce((sum, row) => sum + row.monthInput, 0);
  const priorityEntity = entityRows
    .filter((row) => row.target && row.gap > 0)
    .sort((a, b) => b.gap - a.gap)[0];
  const conclusion = totalGap <= 0
    ? "目前两地研发投入均已达到已录入项目要求，继续按月跟踪即可。"
    : `${priorityEntity?.entity.name || "两地"}研发投入仍有主要缺口，需优先关注费用归集。`;
  const nextAction = priorityEntity
    ? `下个月做账时，优先确认新增研发支出能否合规归集到${priorityEntity.entity.name}，当前缺口 ${wan(priorityEntity.gap)} 万元。`
    : "保持每月录入，申报负责人复核项目归属和材料节点。";
  return {
    month: ui.month,
    projects,
    entityRows,
    riskProjects,
    upcomingItems: buildMonthlyReportUpcomingItems(projects),
    totalTarget,
    totalCollected,
    totalGap,
    totalDeclared,
    totalReceived,
    monthInput,
    conclusion,
    nextAction
  };
}

function monthlyProjectAmount(project, month) {
  return db.expenses
    .filter((expense) => (expense.reviewMonth || expense.date || "").slice(0, 7) === month)
    .reduce((sum, expense) => sum + contributionForProject(expense, project.id), 0);
}

function reportEntityAdvice(row) {
  if (!row.target) return "先设置项目目标";
  if (row.gap <= 0) return "研发投入已满足，继续保留凭证和辅助账";
  if (row.investmentProgress < 0.7) return `优先补${row.entity.short}端投入`;
  return `继续补${row.entity.short}端缺口`;
}

function buildMonthlyReportUpcomingItems(projects) {
  const manual = db.reminders
    .filter((reminder) => reminder.status !== "已完成")
    .map((reminder) => ({
      title: reminder.title,
      dueDate: reminder.dueDate,
      project: projectById(reminder.projectId),
      detail: reminder.detail || "按提醒事项准备材料",
      days: dateDiffDays(reminder.dueDate)
    }));
  const projectItems = projects
    .map((project) => {
      const aggregate = aggregateProject(project);
      return {
        title: `${project.name}材料节点`,
        dueDate: project.materialDeadline,
        project,
        detail: `研发投入缺口 ${wan(aggregate.gap)} 万，达标率 ${pct(aggregate.progress)}`,
        days: dateDiffDays(project.materialDeadline)
      };
    })
    .filter((item) => Number.isFinite(item.days));
  const items = [...manual, ...projectItems]
    .filter((item) => item.days <= 60)
    .sort((a, b) => a.days - b.days);
  return (items.length ? items : [...manual, ...projectItems].sort((a, b) => a.days - b.days)).slice(0, 6);
}

function renderReportEntityTable(report) {
  return `
    <div class="table-wrap">
      <table class="data-table simple-table">
        <thead>
          <tr>
            <th>主体</th>
            <th>项目数</th>
            <th>政府要求研发投入</th>
            <th>当前研发投入</th>
            <th>研发投入缺口</th>
            <th>本月新增</th>
            <th>补贴到账率</th>
            <th>建议</th>
          </tr>
        </thead>
        <tbody>
          ${report.entityRows.map((row) => `
            <tr>
              <td><span class="entity-badge ${entityColor(row.entity.id)}">${row.entity.short}</span> <strong>${escapeHtml(row.entity.name)}</strong></td>
              <td>${row.projects}</td>
              <td>${wan(row.target)} 万</td>
              <td>${wan(row.collected)} 万</td>
              <td><strong class="${row.gap > 0 ? "danger-text" : "money-green"}">${wan(row.gap)} 万</strong></td>
              <td>${wan(row.monthInput)} 万</td>
              <td>${renderRatioCell("到账 / 申请", row.received, row.declared, `到账 ${wan(row.received)} 万 / 申请 ${wan(row.declared)} 万`)}</td>
              <td>${escapeHtml(row.advice)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderReportRiskProjectTable(report) {
  if (!report.riskProjects.length) return '<div class="empty-state">暂无明显项目风险，继续按月录入即可</div>';
  return `
    <div class="table-wrap">
      <table class="data-table simple-table">
        <thead>
          <tr>
            <th>项目</th>
            <th>主体</th>
            <th>研发投入缺口</th>
            <th>研发达标率</th>
            <th>材料截止</th>
            <th>下一步</th>
          </tr>
        </thead>
        <tbody>
          ${report.riskProjects.map(({ project, aggregate, entity }) => `
            <tr>
              <td><strong>${escapeHtml(project.name)}</strong><div class="muted">${escapeHtml(project.code)} · ${escapeHtml(project.researchDirection || "待确认")}</div></td>
              <td><span class="entity-badge ${entityColor(project.entityId)}">${entity.short}</span> ${escapeHtml(entity.name)}</td>
              <td><strong class="${aggregate.gap > 0 ? "danger-text" : "money-green"}">${wan(aggregate.gap)} 万</strong></td>
              <td>${renderRatioCell("支出 / 要求", aggregate.total, project.threshold, `还差 ${wan(aggregate.gap)} 万`)}</td>
              <td>${escapeHtml(project.materialDeadline || "待确认")}</td>
              <td>${escapeHtml(project.nextStep || project.nextProcess || "申报负责人复核费用归属和材料准备")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderReportUpcomingTable(report) {
  if (!report.upcomingItems.length) return '<div class="empty-state">暂无近期材料节点</div>';
  return `
    <div class="table-wrap">
      <table class="data-table simple-table">
        <thead>
          <tr>
            <th>事项</th>
            <th>关联项目</th>
            <th>截止日</th>
            <th>剩余时间</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          ${report.upcomingItems.map((item) => `
            <tr>
              <td><strong>${escapeHtml(item.title)}</strong></td>
              <td>${escapeHtml(item.project?.name || "公共事项")}</td>
              <td>${escapeHtml(item.dueDate || "待确认")}</td>
              <td>${item.days < 0 ? `<strong class="danger-text">逾期 ${Math.abs(item.days)} 天</strong>` : `${item.days} 天`}</td>
              <td>${escapeHtml(item.detail)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function monthlyReportText(report = buildMonthlyReportData()) {
  const entityLines = report.entityRows.map((row) =>
    `- ${row.entity.name}：政府要求 ${wan(row.target)} 万，当前研发投入 ${wan(row.collected)} 万，缺口 ${wan(row.gap)} 万，本月新增 ${wan(row.monthInput)} 万，补贴到账率 ${row.declared ? pct(row.received / row.declared) : "0%"}。建议：${row.advice}。`
  );
  const riskLines = report.riskProjects.length
    ? report.riskProjects.map(({ project, aggregate, entity }) =>
      `- ${project.name}（${entity.name}）：研发投入缺口 ${wan(aggregate.gap)} 万，达标率 ${pct(aggregate.progress)}，材料截止 ${project.materialDeadline || "待确认"}。`
    )
    : ["- 暂无明显项目风险。"];
  const upcomingLines = report.upcomingItems.length
    ? report.upcomingItems.map((item) => {
      const dayText = item.days < 0 ? `已逾期 ${Math.abs(item.days)} 天` : `剩余 ${item.days} 天`;
      return `- ${item.title}：${item.dueDate || "待确认"}，${dayText}，${item.detail}`;
    })
    : ["- 暂无近期材料节点。"];
  return [
    `研发补贴平衡月报（${report.month}）`,
    "",
    "一、本月结论",
    report.conclusion,
    report.nextAction,
    "",
    "二、两地主体情况",
    ...entityLines,
    "",
    "三、重点项目风险",
    ...riskLines,
    "",
    "四、近期材料节点",
    ...upcomingLines,
    "",
    "五、固定动作",
    "- 会计：每月做账后录入本月新增研发投入。",
    "- 申报负责人：审核费用应归到杭州微新还是深圳微智，以及对应项目是否正确。",
    "- 管理层：重点看研发投入缺口，避免因投入不足导致补贴无法到位。"
  ].join("\n");
}

function monthlyReportHtml(report = buildMonthlyReportData()) {
  const analysis = buildSmartAnalysisData();
  const investmentRate = report.totalTarget ? report.totalCollected / report.totalTarget : 0;
  const fundingRate = report.totalDeclared ? report.totalReceived / report.totalDeclared : 0;
  const alert = executiveAlertLevel(report, analysis);
  const alertText = {
    high: "红色预警：研发投入或材料节点需要立即处理",
    mid: "橙色提醒：仍有缺口，需本月跟进",
    low: "绿色：当前无重大缺口，保持月度跟踪"
  }[alert];
  const keyActions = analysis.actions.slice(0, 3);
  const actionItems = keyActions.length
    ? keyActions.map((item) => `<li><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)} ${escapeHtml(item.nextStep)}</span></li>`).join("")
    : "<li><strong>维持月度更新</strong><span>当前没有需要管理层立即决策的事项，后台继续做明细账导入和负责人审核。</span></li>";
  const entityCards = report.entityRows.map((row) => `
    <article class="entity-card">
      <div>
        <strong>${escapeHtml(row.entity.name)}</strong>
        <span>${row.projects} 个补贴项目</span>
      </div>
      <dl>
        <div><dt>达标率</dt><dd>${row.target ? pct(row.collected / row.target) : "0%"}</dd></div>
        <div><dt>缺口</dt><dd class="${row.gap > 0 ? "danger" : "ok"}">${wan(row.gap)} 万</dd></div>
        <div><dt>到账率</dt><dd>${row.declared ? pct(row.received / row.declared) : "0%"}</dd></div>
      </dl>
      <p>${escapeHtml(row.advice)}</p>
    </article>
  `).join("");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>研发补贴平衡月报（${escapeHtml(report.month)}）</title>
  <style>
    body{margin:0;background:#eef4fb;color:#1f2933;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",Arial,sans-serif;}
    .page{max-width:920px;margin:0 auto;padding:34px 28px 42px;}
    .hero{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;padding:26px;border-radius:18px;background:linear-gradient(135deg,#f8fbff,#eaf3ff);border:1px solid #dbe8f5;}
    .brand{display:flex;align-items:center;gap:14px;margin-bottom:20px;color:#1556a8;}
    .mark{width:50px;height:50px;display:grid;place-items:center;border-radius:14px;background:#fff;box-shadow:0 12px 28px rgba(31,112,214,.16)}
    .mark svg{width:40px;height:40px}.mark path{fill:none;stroke:#1f70d6;stroke-linecap:round;stroke-linejoin:round}.ring{stroke-width:5.8}.curve{stroke-width:3.3;opacity:.9}.dna{stroke-width:2.4}
    h1{margin:0;font-size:32px;color:#16324f;letter-spacing:0}.sub{margin:10px 0 0;color:#5d6f82;line-height:1.6}
    .badge{display:inline-block;padding:8px 12px;border-radius:999px;background:#dcecff;color:#175cad;font-weight:700;font-size:14px;white-space:nowrap}
    .alert{margin:16px 0 0;padding:17px 18px;border-radius:14px;color:#fff}.alert.high{background:#c83f3f}.alert.mid{background:#b66d11}.alert.low{background:#14795b}.alert strong{display:block;font-size:20px}.alert span{display:block;margin-top:6px;opacity:.9;line-height:1.55}
    .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}
    .card{background:#fff;border:1px solid #e1e9f2;border-radius:14px;padding:15px}.card label{display:block;color:#66788c;font-size:13px}.card strong{display:block;margin-top:8px;font-size:24px;color:#15263a}.card span{display:block;margin-top:6px;color:#758597;font-size:12px;line-height:1.45}
    .entity-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:16px}.entity-card{background:#fff;border:1px solid #e1e9f2;border-radius:14px;padding:16px}.entity-card strong{font-size:17px}.entity-card span{display:block;margin-top:4px;color:#73849a;font-size:12px}.entity-card dl{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0 0}.entity-card dt{color:#758597;font-size:12px}.entity-card dd{margin:5px 0 0;font-size:18px;font-weight:800;color:#15263a}.entity-card p{margin:12px 0 0;color:#596b80;font-size:13px;line-height:1.5}
    .actions{background:#fff;border:1px solid #e1e9f2;border-radius:16px;margin-top:16px;padding:18px}.actions h2{margin:0 0 12px;font-size:18px}.actions ol{margin:0;padding-left:22px}.actions li{padding:8px 0}.actions strong{display:block;color:#172b41}.actions span{display:block;margin-top:4px;color:#66788c;font-size:13px;line-height:1.55}
    .danger{color:#df3f3f!important}.ok{color:#118264!important}.footer{margin-top:16px;color:#6b7c90;font-size:12px;line-height:1.7}.footer strong{color:#1f2933}
    @media(max-width:760px){.page{padding:18px}.hero{display:block}.cards,.entity-grid{grid-template-columns:1fr 1fr}h1{font-size:26px}}@media(max-width:520px){.cards,.entity-grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <div>
        <div class="brand">
          <div class="mark"><svg viewBox="0 0 64 64"><path class="ring" d="M48 13c-8-7-23-7-31 2-8 10-3 23 14 23 14 0 19 9 11 17-8 7-23 5-29-5"/><path class="curve" d="M51 18c4 8 2 19-7 25M13 46c-5-9-2-22 8-27"/><path class="dna" d="M20 32c7-6 17-6 24 0M22 29l4 6m4-9 4 12m4-12 4 9"/></svg></div>
          <div><strong>微新生物 SynBiome</strong><br><span>研发补贴平衡台账</span></div>
        </div>
        <h1>管理层预警简报</h1>
        <p class="sub">只呈现结论和关键数字。项目明细、费用口径、导入解析在后台处理。</p>
      </div>
      <div class="badge">${escapeHtml(report.month)}</div>
    </section>
    <section class="alert ${alert}"><strong>${alertText}</strong><span>${escapeHtml(report.nextAction)}</span></section>
    <section class="cards">
      <article class="card"><label>研发投入达标率</label><strong>${pct(investmentRate)}</strong><span>已投入 ${wan(report.totalCollected)} / 要求 ${wan(report.totalTarget)} 万</span></article>
      <article class="card"><label>研发投入缺口</label><strong>${wan(report.totalGap)} 万</strong><span>两地主体合计</span></article>
      <article class="card"><label>补贴到账率</label><strong>${pct(fundingRate)}</strong><span>到账 ${wan(report.totalReceived)} / 申请 ${wan(report.totalDeclared)} 万</span></article>
      <article class="card"><label>需关注事项</label><strong>${analysis.actions.length}</strong><span>后台已排序处理</span></article>
    </section>
    <section class="entity-grid">${entityCards}</section>
    <section class="actions"><h2>需要管理层知道的三件事</h2><ol>${actionItems}</ol></section>
    <p class="footer"><strong>后台处理：</strong>会计邮件附件导入、研发费用口径判断、项目匹配、人员费用分摊、明细台账和材料节点均在后台处理；管理层只需看预警等级和关键数字。</p>
  </main>
</body>
</html>`;
}

function executiveAlertLevel(report, analysis) {
  if (report.totalGap > 0 && report.totalTarget && report.totalCollected / report.totalTarget < 0.75) return "high";
  if (analysis.actions.some((item) => item.level === "high")) return "high";
  if (report.totalGap > 0 || analysis.actions.some((item) => item.level === "mid")) return "mid";
  return "low";
}

function openMonthlyReportHtml() {
  const blob = new Blob([monthlyReportHtml()], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  showToast("管理层简报已打开，可截图或另存");
}

function renderWorkflowStep(number, title, copy, state) {
  return `
    <article class="workflow-step ${state}">
      <span>${number}</span>
      <strong>${escapeHtml(title)}</strong>
      <small>${escapeHtml(copy)}</small>
    </article>
  `;
}

function renderReviewTable(expenses, readonly = false) {
  if (!expenses.length) return '<div class="empty-state">这个月份暂无需要处理的记录</div>';
  return `
    <div class="table-wrap">
      <table class="data-table review-table">
        <thead>
          <tr>
            <th>日期</th>
            <th>项目</th>
            <th>摘要</th>
            <th>金额</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${expenses.map((expense) => {
            const project = projectById(expense.projectId);
            return `
              <tr>
                <td>${escapeHtml(expense.date)}</td>
                <td>${escapeHtml(project?.name || "待匹配项目")}</td>
                <td><strong>${escapeHtml(expense.summary)}</strong><div class="muted">${escapeHtml(expense.category)} · ${escapeHtml(expense.voucherNo)}</div></td>
                <td>${money(expense.eligibleAmount)}</td>
                <td>${statusTag(expense.reviewStatus || "待负责人审核")}</td>
                <td>
                  ${readonly ? `<button class="link-button" type="button" data-action="inspect-expense" data-expense="${expense.id}">查看</button>` : `
                    <div style="display:flex; gap:10px; align-items:center;">
                      <button class="link-button" type="button" data-action="approve-review" data-expense="${expense.id}">通过</button>
                      <button class="link-button" type="button" data-action="return-review" data-expense="${expense.id}">退回</button>
                      <button class="link-button" type="button" data-action="edit-expense" data-expense="${expense.id}">调整</button>
                    </div>
                  `}
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderProjectIntake() {
  const projects = filteredProjects();
  const fundingProjects = projects.filter(isFundingProject);
  const fundingGap = fundingProjects.reduce((sum, project) => sum + aggregateProject(project).gap, 0);
  const szGap = fundingProjects
    .filter((project) => project.entityId === "sz")
    .reduce((sum, project) => sum + aggregateProject(project).gap, 0);
  const pendingUpdate = projects.filter((project) => ["待导入", "已导入基础信息", "待负责人更新"].includes(project.formStatus)).length;
  const running = projects.filter((project) => ["执行中", "材料准备中", "逾期待补"].includes(project.executionStatus)).length;
  return `
    <div class="page-stack">
      <section class="monthly-hero">
        <div>
          <h2>基础项目导入与进度更新</h2>
          <p>把已经申报、执行到一半或已经完成的项目先导入，再由项目负责人补齐阶段、费用、流程和材料信息。</p>
        </div>
        <div class="month-controls">
          <button class="button primary" type="button" data-action="open-legacy-import">导入历史项目</button>
          <button class="button" type="button" data-action="open-project-modal">新增项目</button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div class="panel-title"><h2>给项目负责人与会计的使用入口</h2><span class="count">SOP</span></div>
        </div>
        <div class="role-guide-grid">
          <article class="role-guide-card">
            <strong>新项目刚开始申报</strong>
            <span>申报负责人点“新增项目”，先建项目编号、法人主体、申报地区和政府要求研发投入，再点表格里的“更新”补充获批日期、研究方向、后续流程和材料。</span>
          </article>
          <article class="role-guide-card">
            <strong>历史项目或执行中项目</strong>
            <span>申报负责人点“导入历史项目”，把已有清单粘贴进来。重点填政府要求研发投入、历史已归集金额、补贴申请金额、资金到位金额和材料截止日。</span>
          </article>
          <article class="role-guide-card">
            <strong>每月会计做账后</strong>
            <span>会计进“月度填报”点“会计导入”，导入研发费用科目明细；导入后由申报负责人审核项目归属，确认费用放在杭州微新还是深圳微智。</span>
          </article>
          <article class="role-guide-card">
            <strong>日常跟踪重点</strong>
            <span>先看“研发投入达标率”和“研发投入缺口”，再看“补贴资金到账率”。研发投入不足的项目，要优先安排费用归集和主体分配。</span>
          </article>
        </div>
      </section>

      <div class="metric-row">
        ${renderTopMetric("在管项目", projects.length, "含资金补贴与政策/资质类")}
        ${renderTopMetric("执行中/待补", running, "需要持续更新进展")}
        ${renderTopMetric("研发投入缺口", `${wan(fundingGap)} 万元`, "低于政府要求的资金类项目合计")}
        ${renderTopMetric("深圳投入缺口", `${wan(szGap)} 万元`, "重点防止费用分配不足")}
      </div>

      <section class="workflow-strip">
        ${renderWorkflowStep("1", "导入基础项目", "历史项目、在办项目、已完成项目先进入台账", "done")}
        ${renderWorkflowStep("2", "负责人补齐", "获批时间、研究方向、阶段、流程和材料", pendingUpdate ? "active" : "done")}
        ${renderWorkflowStep("3", "财务精准归集", "确认费用放在杭州还是深圳、归到哪个课题", fundingGap ? "active" : "done")}
        ${renderWorkflowStep("4", "持续监督", "缺口、到账、材料节点进入领导仪表盘", "wait")}
      </section>

      <section class="panel">
        <div class="panel-header">
          <div class="panel-title"><h2>项目监督统计表</h2><span class="count">${projects.length}</span></div>
          <div class="panel-tools">
            <button class="button small" type="button" data-action="export-summary">导出汇总</button>
            <button class="button primary small" type="button" data-action="open-legacy-import">批量导入</button>
          </div>
        </div>
        ${renderProjectSupervisionTable(projects)}
      </section>

      <section class="panel">
        <div class="panel-header">
          <div class="panel-title"><h2>费用分配提醒</h2><span class="count">重点监督</span></div>
          <button class="button small" type="button" data-nav-target="allocate">去分摊人员费用</button>
        </div>
        <div class="allocation-guidance">
          <div class="note-box"><strong>杭州/深圳要分开看</strong><br>政府补贴按法人主体发放，杭州微新和深圳微智的研发费用不能简单合并抵扣项目门槛。</div>
          <div class="note-box"><strong>深圳课题要单独归集</strong><br>深圳研发课题按课题核算，人员成本可以手工分摊，但要留下负责人确认口径。</div>
          <div class="note-box"><strong>先盯缺口最大的项目</strong><br>研发投入缺口接近材料截止日时，优先决定新增研发支出应放在哪个主体、哪个项目。</div>
        </div>
      </section>
    </div>
  `;
}

function renderProjectSupervisionTable(projects) {
  if (!projects.length) return '<div class="empty-state">暂无项目，请先导入历史项目或新增项目</div>';
  return `
    <div class="table-wrap">
      <table class="data-table supervision-table">
        <thead>
          <tr>
            <th>项目与研究方向</th>
            <th>法人主体</th>
            <th>获批/申请下来</th>
            <th>当前阶段</th>
            <th>补贴资金到账率</th>
            <th>研发投入达标率</th>
            <th>后续流程</th>
            <th>后续材料</th>
            <th>费用风险</th>
            <th>更新</th>
          </tr>
        </thead>
        <tbody>
          ${projects.map((project) => {
            const entity = entityById(project.entityId);
            const aggregate = aggregateProject(project);
            const funding = isFundingProject(project);
            const stageProgress = projectStageProgress(project, aggregate);
            return `
              <tr>
                <td>
                  <strong>${escapeHtml(project.name)}</strong>
                  <div class="muted">${escapeHtml(project.code)} · ${escapeHtml(project.researchDirection || "待确认")} · ${escapeHtml(project.type)}</div>
                </td>
                <td><span class="entity-badge ${entityColor(project.entityId)}">${entity.short}</span> ${escapeHtml(entity.name)}</td>
                <td>${escapeHtml(project.approvalDate || "待确认")}<div class="muted">${escapeHtml(project.year)} · ${escapeHtml(project.area)}</div></td>
                <td>
                  ${statusTag(project.executionStatus || "执行中")}
                  <div class="meter-row compact-meter">
                    <div class="progress-track"><div class="progress-fill ${progressClass(stageProgress / 100)}" style="--value:${Math.min(stageProgress, 100)}%"></div></div>
                    <strong>${stageProgress}%</strong>
                  </div>
                </td>
                <td>
                  ${funding ? `
                    ${renderRatioCell("到账 / 申请", project.received, fundingRequested(project), `到账 ${wan(project.received)} 万 / 申请 ${wan(fundingRequested(project))} 万`)}
                  ` : `
                    <strong>非资金类</strong>
                    <div class="muted">${escapeHtml(project.policyResult || "待申报")}</div>
                  `}
                </td>
                <td>
                  ${funding ? `
                    ${renderRatioCell("支出 / 要求", aggregate.total, project.threshold, `已支出 ${wan(aggregate.total)} 万 / 要求 ${wan(project.threshold)} 万；差额 ${wan(aggregate.gap)} 万`)}
                  ` : `
                    ${renderRatioCell("条件进度", project.requirementProgress || 0, 100, project.requirementSummary || "条件清单待补")}
                  `}
                </td>
                <td>
                  <strong>${escapeHtml(project.nextProcess || defaultNextProcess(project))}</strong>
                  <div class="muted">已完成：${escapeHtml(project.completedInfo || "待负责人补充")}</div>
                </td>
                <td>${escapeHtml(project.materialNeeds || defaultMaterialNeeds(project))}<div class="muted">材料截止 ${escapeHtml(project.materialDeadline)}</div></td>
                <td>${projectFundingRisk(project, aggregate)}</td>
                <td><button class="link-button" type="button" data-action="open-project-update" data-project="${project.id}">更新</button></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
    <div class="table-footer">
      <span>资金类项目重点看“已归集/门槛/差额”，政策类项目重点看条件和材料。</span>
      <span>费用分配应先按法人主体，再按具体课题确认。</span>
    </div>
  `;
}

function projectStageProgress(project, aggregate) {
  const manual = Number(project.executionProgress || 0);
  if (manual > 0) return Math.max(0, Math.min(Math.round(manual), 100));
  return Math.max(0, Math.min(Math.round((aggregate.progress || 0) * 100), 100));
}

function projectFundingRisk(project, aggregate) {
  if (!isFundingProject(project)) {
    return aggregate.risk === "high"
      ? '<span class="danger-text">条件或材料进度偏慢</span>'
      : '<span class="money-green">按条件进度跟踪</span>';
  }
  if (aggregate.gap > 0) {
    const entity = entityById(project.entityId);
    return `<span class="danger-text">还差 ${wan(aggregate.gap)} 万，优先确认费用是否放在${escapeHtml(entity.name)}</span>`;
  }
  if (aggregate.pending > 0) {
    return `<span class="money-amber">${wan(aggregate.pending)} 万待确认口径</span>`;
  }
  return '<span class="money-green">研发投入要求暂已覆盖</span>';
}

function renderRatioCell(title, current, target, detail) {
  const ratio = target > 0 ? Number(current || 0) / Number(target || 0) : 0;
  const label = target > 0 ? pct(ratio) : "待录入";
  return `
    <div class="progress-cell">
      <strong>${escapeHtml(title)} ${label}</strong>
      <div class="progress-track"><div class="progress-fill ${progressClass(ratio)}" style="--value:${Math.min(ratio * 100, 100)}%"></div></div>
      <span>${escapeHtml(detail)}</span>
    </div>
  `;
}

function buildExecutiveSummary(projects) {
  const aggregates = projects.map((project) => ({ project, aggregate: aggregateProject(project) }));
  const fundingProjects = projects.filter(isFundingProject);
  const target = fundingProjects.reduce((sum, item) => sum + item.threshold, 0);
  const collected = aggregates.filter((item) => isFundingProject(item.project)).reduce((sum, item) => sum + item.aggregate.total, 0);
  const requested = fundingProjects.reduce((sum, item) => sum + fundingRequested(item), 0);
  const received = fundingProjects.reduce((sum, item) => sum + Number(item.received || 0), 0);
  const gap = aggregates.filter((item) => isFundingProject(item.project)).reduce((sum, item) => sum + item.aggregate.gap, 0);
  const highRisk = aggregates.filter((item) => item.aggregate.risk === "high").length;
  const dueSoon = projects.filter((project) => dateDiffDays(project.materialDeadline) <= 30).length;
  const pending = aggregates.filter((item) => isFundingProject(item.project)).reduce((sum, item) => sum + item.aggregate.pending, 0);
  const investmentRate = target ? collected / target : 0;
  const fundingRate = requested ? received / requested : 0;
  return [
    {
      label: "补贴资金到账率",
      value: requested ? pct(fundingRate) : "0%",
      help: `到账 ${wan(received)} 万 / 申请 ${wan(requested)} 万`,
      tone: fundingRate >= 0.9 ? "good" : fundingRate >= 0.45 ? "watch" : "risk"
    },
    {
      label: "研发投入达标率",
      value: target ? pct(investmentRate) : "0%",
      help: `已支出 ${wan(collected)} 万 / 政府要求 ${wan(target)} 万`,
      tone: investmentRate >= 1 ? "good" : investmentRate >= 0.75 ? "watch" : "risk"
    },
    {
      label: "研发投入缺口",
      value: `${wan(gap)} 万元`,
      help: `含待确认口径 ${wan(pending)} 万，重点防止投入不足`,
      tone: gap > target * 0.25 ? "risk" : gap > 0 ? "watch" : "good"
    },
    {
      label: "高风险项目",
      value: `${highRisk} 个`,
      help: dueSoon ? `${dueSoon} 个材料节点 30 天内到期` : "暂无临近材料截止",
      tone: highRisk ? "risk" : "good"
    },
  ];
}

function renderEntityCard(entity) {
  const aggregate = aggregateEntity(entity.id);
  const investmentProgress = aggregate.target ? aggregate.collected / aggregate.target : 0;
  const fundingProgress = aggregate.declared ? aggregate.received / aggregate.declared : 0;
  const riskLabel = aggregate.highRisk ? "高风险" : aggregate.midRisk ? "中风险" : "低风险";
  const riskClass = aggregate.highRisk ? "red" : aggregate.midRisk ? "amber" : "green";
  return `
    <article class="entity-card">
      <div class="entity-heading">
        <span class="entity-badge ${entityColor(entity.id)}">${entity.short}</span>
        <div>
          <strong>${escapeHtml(entity.name)}</strong>
          <small>${escapeHtml(entity.location)}</small>
        </div>
      </div>
      <div class="metric">
        <label>补贴项目</label>
        <strong>${aggregate.fundingCount}</strong>
        <small>用于平衡研发投入</small>
      </div>
      <div class="metric">
        <label>目标金额</label>
        <strong>${wan(aggregate.target)}</strong>
        <small>万元</small>
      </div>
      <div class="metric">
        <label>已归集金额</label>
        <strong>${wan(aggregate.collected)}</strong>
        <small>含待确认 ${wan(aggregate.pending)} 万元</small>
      </div>
      <div class="metric">
        <label>补贴到账率</label>
        <strong>${pct(fundingProgress)}</strong>
        <small>到账 ${wan(aggregate.received)} / 申请 ${wan(aggregate.declared)} 万元</small>
      </div>
      <div class="metric">
        <label>研发投入率</label>
        <strong>${pct(investmentProgress)}</strong>
        <small><div class="progress-track"><div class="progress-fill ${progressClass(investmentProgress)}" style="--value:${Math.min(investmentProgress * 100, 100)}%"></div></div></small>
      </div>
      <div class="metric">
        <label>风险状态</label>
        <strong>${riskTag(riskLabel === "高风险" ? "high" : riskLabel === "中风险" ? "mid" : "low")}</strong>
        <small>差额 ${wan(aggregate.gap)} 万元</small>
      </div>
    </article>
  `;
}

function renderProjectTable(projects) {
  if (!projects.length) return '<div class="empty-state">没有匹配的政策项目</div>';
  const rows = projects.map((project) => {
    const aggregate = aggregateProject(project);
    const entity = entityById(project.entityId);
    return `
      <tr>
        <td>
          <strong>${escapeHtml(project.name)}</strong>
          <div class="muted">${escapeHtml(project.code)} · ${escapeHtml(project.researchDirection || "待确认")} · ${escapeHtml(project.type)} · ${projectKindLabel(project)}</div>
        </td>
        <td><span class="entity-badge ${entityColor(project.entityId)}">${entity.short}</span> ${escapeHtml(entity.name)}</td>
        <td>${escapeHtml(project.area)}</td>
        <td>${escapeHtml(project.year)}</td>
        <td>${escapeHtml(project.approvalDate || "待确认")}</td>
        <td>${statusTag(project.executionStatus || "执行中")}</td>
        <td>${projectGoalLabel(project)}</td>
        <td>${projectCurrentLabel(project, aggregate)}</td>
        <td>${projectResultLabel(project)}</td>
        <td>
          <div class="meter-row">
            <div class="progress-track"><div class="progress-fill ${progressClass(aggregate.progress)}" style="--value:${Math.min(aggregate.progress * 100, 100)}%"></div></div>
            <strong>${pct(aggregate.progress)}</strong>
          </div>
        </td>
        <td>${riskTag(aggregate.risk)}</td>
        <td>${escapeHtml(project.materialDeadline)}</td>
        <td><button type="button" class="link-button" data-action="open-policy" data-project="${project.id}">编辑</button></td>
      </tr>
    `;
  });
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>项目名称</th>
            <th>所属主体</th>
            <th>申报地区</th>
            <th>年度</th>
            <th>获批日</th>
            <th>阶段</th>
            <th>目标/条件</th>
            <th>研发投入</th>
            <th>补贴资金</th>
            <th>研发投入率</th>
            <th>风险状态</th>
            <th>材料截止</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    </div>
    <div class="table-footer">
      <span>共 ${projects.length} 个项目</span>
      <span>资金类看研发投入要求和缺口，政策/资质类看条件进度和材料节点。</span>
    </div>
  `;
}

function projectGoalLabel(project) {
  return isFundingProject(project)
    ? `要求 ${wan(project.threshold)} 万元`
    : escapeHtml(project.requirementSummary || "条件清单");
}

function projectCurrentLabel(project, aggregate) {
  return isFundingProject(project)
    ? `已支出 ${wan(aggregate.total)} 万元`
    : `${pct(aggregate.progress)} 条件进度`;
}

function projectResultLabel(project) {
  return isFundingProject(project)
    ? `到账 ${wan(project.received)} / 申请 ${wan(fundingRequested(project))} 万元`
    : escapeHtml(project.policyResult || "待申报/待认定");
}

function renderExpenseTable(expenses, compact = false) {
  if (!expenses.length) return '<div class="empty-state">没有匹配的费用记录</div>';
  const rows = expenses.map((expense) => {
    const entity = entityById(expense.entityId);
    const project = projectById(expense.projectId);
    const projectLabel = project
      ? `${project.name}`
      : allocationLabel(expense);
    const action = `
      <div style="display:flex; gap:10px; align-items:center;">
        ${expense.recognitionStatus === "待确认口径" ? `<button type="button" class="link-button" data-action="approve-expense" data-expense="${expense.id}">确认</button>` : ""}
        <button type="button" class="link-button" data-action="edit-expense" data-expense="${expense.id}">编辑</button>
        <button type="button" class="link-button" data-action="inspect-expense" data-expense="${expense.id}">查看</button>
      </div>
    `;
    return `
      <tr>
        <td>${escapeHtml(expense.date)}</td>
        <td>${escapeHtml(expense.id)}</td>
        <td><span class="entity-badge ${entityColor(expense.entityId)}">${entity.short}</span> ${escapeHtml(entity.name)}</td>
        <td>${escapeHtml(projectLabel)}</td>
        <td>${escapeHtml(expense.category)}</td>
        <td>${escapeHtml(expense.summary)}</td>
        <td>${escapeHtml(expense.vendor)}</td>
        <td>${money(expense.amount)}</td>
        <td>${money(expense.eligibleAmount)}</td>
        <td>${statusTag(expense.recognitionStatus)}</td>
        <td>${statusTag(expense.reviewStatus || "待负责人审核")}</td>
        <td>${statusTag(expense.allocationStatus)}</td>
        <td>${escapeHtml(expense.voucherNo)}</td>
        <td>${action}</td>
      </tr>
    `;
  });
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>费用日期</th>
            <th>费用编号</th>
            <th>所属主体</th>
            <th>项目名称</th>
            <th>费用类型</th>
            <th>摘要</th>
            <th>供应商/员工</th>
            <th>发生金额(元)</th>
            <th>可归集金额(元)</th>
            <th>认定状态</th>
            <th>审核状态</th>
            <th>分摊状态</th>
            <th>凭证号</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    </div>
    <div class="table-footer">
      <span>${compact ? "显示前 8 条，" : ""}共 ${filteredExpenses().length} 条费用</span>
      <span>附件不是第一阶段重点，凭证号用于回查财务系统。</span>
    </div>
  `;
}

function allocationLabel(expense) {
  if (Array.isArray(expense.allocations) && expense.allocations.length) {
    return expense.allocations
      .map((item) => {
        const project = projectById(item.projectId);
        return `${project?.name || item.projectId} ${item.percent}%`;
      })
      .join(" / ");
  }
  return "待分摊";
}

function renderProjects() {
  const projects = filteredProjects().filter(isBalanceProject);
  const opportunities = filteredOpportunityProjects();
  const fundingProjects = projects.filter(isBalanceProject);
  const requested = fundingProjects.reduce((sum, item) => sum + fundingRequested(item), 0);
  const received = fundingProjects.reduce((sum, item) => sum + Number(item.received || 0), 0);
  const target = fundingProjects.reduce((sum, item) => sum + Number(item.threshold || 0), 0);
  const collected = fundingProjects.reduce((sum, item) => sum + aggregateProject(item).total, 0);
  return `
    <div class="page-stack">
      <section class="monthly-hero">
        <div>
          <h2>项目设置</h2>
          <p>前期把补贴项目和目标数字填好：政府要求研发投入、补贴申请金额、已到账金额。后续每月只录新增研发投入。</p>
        </div>
        <div class="month-controls">
          <button class="button primary" type="button" data-action="open-project-modal">新增项目</button>
          <button class="button" type="button" data-action="open-legacy-import">导入历史项目</button>
        </div>
      </section>

      <div class="metric-row">
        ${renderTopMetric("补贴项目", fundingProjects.length, "只保留与研发投入平衡相关的项目")}
        ${renderTopMetric("研发投入要求", `${wan(target)} 万元`, "两地主体合计")}
        ${renderTopMetric("当前已归集", `${wan(collected)} 万元`, "含月度固定录入")}
        ${renderTopMetric("补贴到账率", requested ? pct(received / requested) : "0%", `到账 ${wan(received)} / 申请 ${wan(requested)} 万元`)}
      </div>

      <section class="panel">
        <div class="simple-note-grid">
          <div class="note-box"><strong>新增项目时只填关键字段</strong><br>主体、项目名称、项目编号、政府要求研发投入。其他字段可以后面点“更新”补齐。</div>
          <div class="note-box"><strong>历史项目建议批量导入</strong><br>一次性粘贴已有项目清单，尤其要带上历史已归集金额，避免从零开始算。</div>
          <div class="note-box"><strong>不相关事项先不管</strong><br>附件、权限、材料台账、细分凭证后续需要再加；第一阶段先盯研发投入达标。</div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div class="panel-title"><h2>补贴项目设置表</h2><span class="count">${projects.length}</span></div>
          <button class="button primary small" type="button" data-action="open-project-modal">新增项目</button>
        </div>
        ${renderSimpleProjectGapTable(projects)}
      </section>

      <section class="panel">
        <div class="panel-header">
          <div class="panel-title"><h2>关键项目机会</h2><span class="count">${opportunities.length}</span></div>
        </div>
        ${renderOpportunityTable(opportunities)}
      </section>
    </div>
  `;
}

function renderTopMetric(label, value, help) {
  return `
    <article class="metric-card">
      <label>${escapeHtml(label)}</label>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(help)}</small>
    </article>
  `;
}

function renderProjectCard(project) {
  const aggregate = aggregateProject(project);
  const entity = entityById(project.entityId);
  const funding = isFundingProject(project);
  return `
    <article class="project-card">
      <header>
        <div>
          <h3>${escapeHtml(project.name)}</h3>
          <p>${escapeHtml(project.code)} · ${escapeHtml(entity.name)} · ${escapeHtml(projectKindLabel(project))} · ${escapeHtml(project.cycle)}</p>
        </div>
        ${riskTag(aggregate.risk)}
      </header>
      <div class="project-stats">
        ${funding ? `
          <div class="mini-stat"><label>补贴申请金额</label><strong>${wan(fundingRequested(project))} 万元</strong></div>
          <div class="mini-stat"><label>补贴已到账</label><strong>${wan(project.received)} 万元</strong></div>
          <div class="mini-stat"><label>政府要求投入</label><strong>${wan(project.threshold)} 万元</strong></div>
          <div class="mini-stat"><label>已研发投入</label><strong>${wan(aggregate.total)} 万元</strong></div>
        ` : `
          <div class="mini-stat"><label>条件进度</label><strong>${pct(aggregate.progress)}</strong></div>
          <div class="mini-stat"><label>项目状态</label><strong>${escapeHtml(project.policyResult || "待申报")}</strong></div>
          <div class="mini-stat"><label>材料截止</label><strong>${escapeHtml(project.materialDeadline)}</strong></div>
          <div class="mini-stat"><label>负责人</label><strong>${escapeHtml(project.owner || "待定")}</strong></div>
        `}
      </div>
      ${funding ? `
        <div class="dual-progress">
          ${renderRatioCell("补贴资金到账率", project.received, fundingRequested(project), `到账 ${wan(project.received)} 万 / 申请 ${wan(fundingRequested(project))} 万`)}
          ${renderRatioCell("研发投入达标率", aggregate.total, project.threshold, `已支出 ${wan(aggregate.total)} 万 / 要求 ${wan(project.threshold)} 万；差额 ${wan(aggregate.gap)} 万`)}
        </div>
      ` : `
        <div class="meter-row">
          <div class="progress-track"><div class="progress-fill ${progressClass(aggregate.progress)}" style="--value:${Math.min(aggregate.progress * 100, 100)}%"></div></div>
          <strong>${pct(aggregate.progress)}</strong>
        </div>
      `}
      <div class="note-box">
        ${escapeHtml(project.accountingScope)}。${escapeHtml(project.note)}
      </div>
      <button class="button small" type="button" data-action="open-policy" data-project="${project.id}">${funding ? "修改政策门槛" : "更新条件进度"}</button>
    </article>
  `;
}

function renderLedger() {
  const expenses = filteredExpenses();
  const total = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const eligible = expenses.reduce((sum, item) => sum + Number(item.eligibleAmount || 0), 0);
  const pending = expenses
    .filter((item) => item.recognitionStatus === "待确认口径")
    .reduce((sum, item) => sum + Number(item.eligibleAmount || 0), 0);
  return `
    <div class="page-stack">
      <div class="metric-row">
        ${renderTopMetric("费用记录", expenses.length, "当前筛选")}
        ${renderTopMetric("发生金额", `${wan(total)} 万元`, "财务报表口径")}
        ${renderTopMetric("可归集金额", `${wan(eligible)} 万元`, "台账归集口径")}
        ${renderTopMetric("待确认口径", `${wan(pending)} 万元`, "需财务复核")}
      </div>
      <section class="panel">
        <div class="panel-header">
          <div class="panel-title"><h2>研发费用台账</h2><span class="count">${expenses.length}</span></div>
          <div class="panel-tools">
            <button class="button small" type="button" data-action="export-expenses">导出台账</button>
            <button class="button small" type="button" data-action="open-import">会计导入</button>
            <button class="button primary small" type="button" data-action="add-expense">新增费用</button>
          </div>
        </div>
        ${renderExpenseTable(expenses)}
      </section>
    </div>
  `;
}

function renderAllocate() {
  const candidates = db.expenses.filter((expense) => {
    if (expense.entityId !== "sz") return false;
    if (expense.category !== "人员人工") return false;
    return expense.allocationStatus !== "无需分摊";
  });
  if (!ui.allocationExpenseId && candidates[0]) ui.allocationExpenseId = candidates[0].id;
  const selected = candidates.find((expense) => expense.id === ui.allocationExpenseId) || candidates[0];
  return `
    <div class="allocation-board">
      <section class="panel">
        <div class="panel-header">
          <div class="panel-title"><h2>待分摊人员费用</h2><span class="count">${candidates.length}</span></div>
        </div>
        <div class="allocation-list">
          ${candidates.map((expense) => `
            <button type="button" class="allocation-item ${selected?.id === expense.id ? "active" : ""}" data-action="select-allocation" data-expense="${expense.id}">
              <strong>${escapeHtml(expense.summary)}</strong>
              <span>${escapeHtml(expense.date)} · ${money(expense.eligibleAmount)} 元 · ${escapeHtml(expense.allocationStatus)}</span>
            </button>
          `).join("") || '<div class="empty-state">暂无待分摊人员费用</div>'}
        </div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <div class="panel-title"><h2>手工分摊</h2><span class="count">深圳课题</span></div>
          <button class="button primary small" type="button" data-action="save-allocation">保存分摊</button>
        </div>
        ${selected ? renderAllocationDetail(selected) : '<div class="empty-state">请选择一条人员费用</div>'}
      </section>
    </div>
  `;
}

function renderAllocationDetail(expense) {
  const projects = db.projects.filter((project) => project.entityId === "sz" && project.type === "研发课题");
  const allocationMap = Object.fromEntries((expense.allocations || []).map((item) => [item.projectId, item.percent]));
  const defaultPercent = expense.allocations?.length ? 0 : Math.floor(100 / projects.length);
  return `
    <div class="allocation-detail" data-expense="${expense.id}">
      <strong>${escapeHtml(expense.id)} · ${escapeHtml(expense.summary)}</strong>
      <span>可分摊金额 ${money(expense.eligibleAmount)} 元。原则上一笔费用不跨项目，人员成本例外，需要人工确认比例。</span>
      <div class="note-box" style="margin-top:14px;">
        建议依据工时、研发记录或负责人确认比例分摊。保存后会把金额计入对应深圳课题的已归集金额。
      </div>
      <div style="margin-top:14px;">
        ${projects.map((project, index) => {
          const fallback = index === projects.length - 1 ? 100 - defaultPercent * (projects.length - 1) : defaultPercent;
          const value = allocationMap[project.id] ?? fallback;
          return `
            <div class="allocation-row">
              <div>
                <strong>${escapeHtml(project.name)}</strong>
                <span>${escapeHtml(project.code)} · 当前研发投入率 ${pct(aggregateProject(project).progress)}</span>
              </div>
              <input class="range-input allocation-percent" type="range" min="0" max="100" step="5" value="${value}" data-project="${project.id}">
              <input class="number-input allocation-number" type="number" min="0" max="100" step="5" value="${value}" data-project="${project.id}" aria-label="${escapeHtml(project.name)}分摊比例">
            </div>
          `;
        }).join("")}
      </div>
      <div class="note-box" id="allocationTotal" style="margin-top:14px;"></div>
    </div>
  `;
}

function renderPolicy() {
  return `
    <div class="two-col">
      <section class="panel">
        <div class="panel-header">
          <div class="panel-title"><h2>政策档案</h2><span class="count">${filteredProjects().length}</span></div>
          <button class="button primary small" type="button" data-action="open-project-modal">新增政策</button>
        </div>
        ${renderPolicyTable(filteredProjects())}
      </section>
      <aside class="panel">
        <div class="panel-header">
          <div class="panel-title"><h2>政策项目口径速记</h2></div>
        </div>
        <div style="padding:16px; display:grid; gap:12px;">
          <div class="note-box"><strong>资金类申请</strong><br>研发补贴、场地补贴、课题资助等，重点看研发投入要求、已支出金额、到账金额和差额。</div>
          <div class="note-box"><strong>政策/资质类申请</strong><br>国高、专精特新、创新型中小企业等，重点看条件达标、材料节点、认定状态和复审周期。</div>
          <div class="note-box"><strong>优先归集</strong><br>研发人员薪酬、直接材料、试剂耗材、设备折旧、无形资产摊销、设计试验、检测检验、委外研发等。</div>
        </div>
      </aside>
    </div>
  `;
}

function renderPolicyTable(projects) {
  if (!projects.length) return '<div class="empty-state">暂无政策档案</div>';
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>项目名称</th>
            <th>法人主体</th>
            <th>申报地区</th>
            <th>项目周期</th>
            <th>项目类型</th>
            <th>目标/条件</th>
            <th>状态/结果</th>
            <th>申报截止</th>
            <th>审批权限</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${projects.map((project) => `
            <tr>
              <td><strong>${escapeHtml(project.name)}</strong><div class="muted">${escapeHtml(project.code)}</div></td>
              <td>${escapeHtml(entityById(project.entityId).name)}</td>
              <td>${escapeHtml(project.area)}</td>
              <td>${escapeHtml(project.cycle)}</td>
              <td>${escapeHtml(projectKindLabel(project))}</td>
              <td>${projectGoalLabel(project)}</td>
              <td>${projectResultLabel(project)}</td>
              <td>${escapeHtml(project.deadline)}</td>
              <td>CFO</td>
              <td><button class="link-button" type="button" data-action="open-policy" data-project="${project.id}">修改</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderReminders() {
  const items = buildRiskItems();
  return `
    <div class="two-col">
      <section class="panel">
        <div class="panel-header">
          <div class="panel-title"><h2>材料和风险提醒</h2><span class="count">${items.length}</span></div>
          <button class="button small" type="button" data-action="mark-all-reminders">批量标记</button>
        </div>
        <div class="risk-list">
          ${items.map(renderRiskItem).join("") || '<div class="empty-state">暂无提醒</div>'}
        </div>
      </section>
      <aside class="panel">
        <div class="panel-header"><div class="panel-title"><h2>提醒规则</h2></div></div>
        <div style="padding:16px; display:grid; gap:12px;">
          <div class="note-box">材料截止日前 30 天仍未完成，自动标记为中风险。</div>
          <div class="note-box">截止日前 10 天、研发投入达标率低于 70%、或存在大额待确认口径，自动标记为高风险。</div>
          <div class="note-box">审计年报、研发辅助账、项目阶段总结建议作为固定提醒事项。</div>
        </div>
      </aside>
    </div>
  `;
}

function buildRiskItems() {
  const manual = db.reminders
    .filter((reminder) => {
      const project = projectById(reminder.projectId);
      if (!project) return true;
      if (ui.entity !== "all" && project.entityId !== ui.entity) return false;
      if (ui.year !== "all" && project.year !== ui.year) return false;
      return reminder.status !== "已完成";
    })
    .map((reminder) => ({ ...reminder, kind: "manual" }));
  const projectRisks = filteredProjects()
    .map((project) => {
      const aggregate = aggregateProject(project);
      if (aggregate.risk === "low") return null;
      const days = dateDiffDays(project.materialDeadline);
      return {
        id: `P-${project.id}`,
        title: `${project.name}${isFundingProject(project) ? "研发投入进度" : "条件进度"}`,
        projectId: project.id,
        dueDate: project.materialDeadline,
        level: aggregate.risk === "high" ? "high" : "mid",
        status: "自动提醒",
        detail: days < 0
          ? `材料截止已逾期，研发投入缺口 ${wan(aggregate.gap)} 万元。`
          : isFundingProject(project)
            ? `距离材料截止 ${days} 天，研发投入达标率 ${pct(aggregate.progress)}，缺口 ${wan(aggregate.gap)} 万元。`
            : `距离材料截止 ${days} 天，条件进度 ${pct(aggregate.progress)}。`
      };
    })
    .filter(Boolean);
  return [...manual, ...projectRisks].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function renderRiskItem(item) {
  const project = projectById(item.projectId);
  const days = dateDiffDays(item.dueDate);
  const dayText = days < 0 ? `逾期 ${Math.abs(days)} 天` : `剩余 ${days} 天`;
  const levelText = item.level === "high" ? "!" : item.level === "mid" ? "i" : "✓";
  return `
    <article class="risk-item">
      <div class="risk-dot ${item.level}">${levelText}</div>
      <div class="risk-copy">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(project?.code || "公共事项")} · ${escapeHtml(item.detail)} ${statusTag(item.status)}</span>
      </div>
      <div class="risk-date">${escapeHtml(item.dueDate)}<br>${dayText}</div>
    </article>
  `;
}

function renderPermissions() {
  return `
    <div class="two-col">
      <section class="panel">
        <div class="panel-header">
          <div class="panel-title"><h2>角色权限</h2><span class="count">${db.roles.length}</span></div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>角色</th>
                <th>人员范围</th>
                <th>查看权限</th>
                <th>输入权限</th>
                <th>审批权限</th>
              </tr>
            </thead>
            <tbody>
              ${db.roles.map((role) => `
                <tr>
                  <td><strong>${escapeHtml(role.name)}</strong></td>
                  <td>${escapeHtml(role.people)}</td>
                  <td>${escapeHtml(role.view)}</td>
                  <td>${escapeHtml(role.input)}</td>
                  <td>${escapeHtml(role.approve)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
      <aside class="panel">
        <div class="panel-header"><div class="panel-title"><h2>第一阶段建议</h2></div></div>
        <div style="padding:16px; display:grid; gap:12px;">
          <div class="note-box">输入权限开放给财务和两地行政，所有新增费用默认保留来源和录入人字段。</div>
          <div class="note-box">政策门槛、补贴比例、最高补贴金额建议仅 CFO 或授权人员可改。</div>
          <div class="note-box">CEO、CFO、张英默认有全部查看权限；项目负责人可确认项目归属。</div>
        </div>
      </aside>
    </div>
  `;
}

function showToast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => dom.toast.classList.remove("show"), 2400);
}

function openModal(content, wide = false) {
  dom.modalLayer.hidden = false;
  dom.modalLayer.innerHTML = `
    <div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true">
      ${content}
    </div>
  `;
}

function closeModal() {
  dom.modalLayer.hidden = true;
  dom.modalLayer.innerHTML = "";
}

function openExpenseModal() {
  const editingId = arguments[0];
  const editing = editingId ? db.expenses.find((item) => item.id === editingId) : null;
  const defaultExpenseDate = editing?.date || `${ui.month || "2025-08"}-01`;
  const projectOptions = db.projects
    .filter((project) => ui.entity === "all" || project.entityId === ui.entity)
    .map((project) => `<option value="${project.id}" ${editing?.projectId === project.id ? "selected" : ""}>${project.code} - ${project.name}</option>`)
    .join("");
  openModal(`
    <div class="modal-header">
      <h2>${editing ? "编辑费用" : "新增费用"}</h2>
      <button class="close-button" type="button" data-close-modal>×</button>
    </div>
    <form class="modal-body" id="expenseForm" data-expense="${editing?.id || ""}">
      <div class="form-grid">
        <div class="form-field">
          <label>费用日期</label>
          <input name="date" type="date" value="${defaultExpenseDate}" required>
        </div>
        <div class="form-field">
          <label>法人主体</label>
          <select name="entityId" required>
            ${db.entities.map((entity) => `<option value="${entity.id}" ${(editing?.entityId || ui.entity) === entity.id ? "selected" : ""}>${entity.name}</option>`).join("")}
          </select>
        </div>
        <div class="form-field full">
          <label>归属项目</label>
          <select name="projectId">
            <option value="">待匹配项目</option>
            ${projectOptions}
          </select>
        </div>
        <div class="form-field">
          <label>费用类型</label>
          <select name="category">
            ${["人员人工", "直接投入", "设备折旧", "检测检验", "委外研发", "场地租赁", "注册法规", "其他费用"].map((item) => `<option ${editing?.category === item ? "selected" : ""}>${item}</option>`).join("")}
          </select>
        </div>
        <div class="form-field">
          <label>认定状态</label>
          <select name="recognitionStatus">
            ${["可归集", "待确认口径", "不建议归集"].map((item) => `<option ${editing?.recognitionStatus === item ? "selected" : ""}>${item}</option>`).join("")}
          </select>
        </div>
        <div class="form-field">
          <label>发生金额(元)</label>
          <input name="amount" type="number" min="0" step="100" value="${editing?.amount || 100000}" required>
        </div>
        <div class="form-field">
          <label>可归集金额(元)</label>
          <input name="eligibleAmount" type="number" min="0" step="100" value="${editing?.eligibleAmount || 100000}" required>
        </div>
        <div class="form-field">
          <label>供应商/员工</label>
          <input name="vendor" type="text" value="${escapeHtml(editing?.vendor || "内部员工")}" required>
        </div>
        <div class="form-field">
          <label>凭证号</label>
          <input name="voucherNo" type="text" value="${escapeHtml(editing?.voucherNo || "待回填")}">
        </div>
        <div class="form-field full">
          <label>摘要</label>
          <textarea name="summary" required>${escapeHtml(editing?.summary || "研发费用补充记录")}</textarea>
        </div>
      </div>
    </form>
    <div class="modal-footer">
      <button class="button" type="button" data-close-modal>取消</button>
      <button class="button primary" type="button" data-action="save-expense">${editing ? "保存调整" : "保存费用"}</button>
    </div>
  `);
}

function saveExpenseFromModal() {
  const form = document.getElementById("expenseForm");
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form));
  const editing = form.dataset.expense ? db.expenses.find((item) => item.id === form.dataset.expense) : null;
  const nextExpense = {
    id: editing?.id || `FY${data.date.replaceAll("-", "")}${String(db.expenses.length + 1).padStart(3, "0")}`,
    date: data.date,
    entityId: data.entityId,
    projectId: data.projectId || null,
    category: data.category,
    summary: data.summary,
    vendor: data.vendor,
    amount: Number(data.amount),
    eligibleAmount: Number(data.eligibleAmount),
    recognitionStatus: data.recognitionStatus,
    allocationStatus: data.projectId ? (data.category === "人员人工" && data.entityId === "sz" ? "待分摊" : "无需分摊") : "待匹配项目",
    source: editing?.source || "手动录入",
    voucherNo: data.voucherNo || "待回填",
    allocations: editing?.allocations || [],
    accountCode: editing?.accountCode || "",
    accountSubject: editing?.accountSubject || "",
    reviewMonth: editing?.reviewMonth || data.date.slice(0, 7),
    reviewStatus: editing?.reviewStatus === "退回调整" ? "待负责人审核" : (editing?.reviewStatus || "待负责人审核"),
    submitter: editing?.submitter || "财务/行政",
    reviewer: editing?.reviewer || projectById(data.projectId)?.owner || "张英"
  };
  if (editing) Object.assign(editing, nextExpense);
  else db.expenses.unshift(nextExpense);
  saveState();
  closeModal();
  render();
  showToast(editing ? "费用调整已保存" : "费用已新增到台账");
}

function openImportModal() {
  openModal(`
    <div class="modal-header">
      <h2>会计系统研发费用导入</h2>
      <button class="close-button" type="button" data-close-modal>×</button>
    </div>
    <div class="modal-body">
      <div class="note-box" style="margin-bottom:12px;">
        从会计系统导出科目明细后粘贴到这里。系统会优先识别“会计科目/科目名称”中包含“研发费用”或“研发支出”的记录，非研发科目默认不导入；导入后仍可在费用台账里人工调整项目、金额和认定状态。
      </div>
      <div class="import-layout">
        <div>
          <label class="field-label light" for="importText">会计系统导出内容</label>
          <textarea id="importText" class="paste-area">日期,主体,科目编码,会计科目,凭证号,摘要,供应商,借方金额,贷方金额,项目编号,费用类型
2025-08-12,深圳微智,530101,研发费用-直接投入,记-202508-018,新原料小试耗材,深圳试剂供应商,186000,0,SZ2025WZ-001,直接投入
2025-08-15,杭州微新,530103,研发费用-检测检验,记-202508-026,功效验证检测服务,杭州检测中心,240000,0,HZ2025-RD,检测检验
2025-08-18,杭州微新,660201,管理费用-办公费,记-202508-039,行政办公用品,办公供应商,23000,0,HZ2025-RD,其他费用</textarea>
        </div>
        <div>
          <label class="field-label light">识别预览</label>
          <div id="importPreview" class="import-preview"></div>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="button" type="button" data-close-modal>取消</button>
      <button class="button" type="button" data-action="preview-import">识别预览</button>
      <button class="button primary" type="button" data-action="run-import">导入研发费用</button>
    </div>
  `, true);
  renderImportPreviewFromText();
}

function runImport() {
  const text = document.getElementById("importText")?.value.trim();
  if (!text) return;
  const parsed = parseAccountingImport(text);
  const rows = parsed.rows.filter((row) => row.importable);
  let imported = 0;
  rows.forEach((row, index) => {
    db.expenses.unshift({
      id: `IMP${Date.now()}${index}`,
      date: row.date,
      entityId: row.entityId,
      projectId: row.projectId,
      category: row.category,
      summary: row.summary,
      vendor: row.vendor,
      amount: row.amount,
      eligibleAmount: row.eligibleAmount,
      recognitionStatus: row.recognitionStatus,
      allocationStatus: row.allocationStatus,
      source: "会计系统导入",
      voucherNo: row.voucherNo,
      accountCode: row.accountCode,
      accountSubject: row.accountSubject,
      reviewMonth: row.date.slice(0, 7),
      reviewStatus: "待负责人审核",
      submitter: "财务",
      reviewer: projectById(row.projectId)?.owner || "张英",
      allocations: []
    });
    imported += 1;
  });
  if (!imported) {
    renderImportPreviewFromText();
    showToast("没有识别到可导入的研发费用科目");
    return;
  }
  saveState();
  ui.month = rows[0]?.date.slice(0, 7) || ui.month;
  ui.page = "monthly";
  closeModal();
  render();
  showToast(`已导入 ${imported} 条研发费用，跳过 ${parsed.skipped} 条非研发科目`);
}

function renderImportPreviewFromText() {
  const preview = document.getElementById("importPreview");
  const text = document.getElementById("importText")?.value.trim();
  if (!preview || !text) return;
  const parsed = parseAccountingImport(text);
  preview.innerHTML = `
    <div class="import-summary">
      <strong>${parsed.importable} 条可导入</strong>
      <span>${parsed.skipped} 条跳过，${parsed.pending} 条需人工调整</span>
    </div>
    <div class="table-wrap compact-preview">
      <table class="data-table">
        <thead>
          <tr>
            <th>状态</th>
            <th>日期</th>
            <th>主体</th>
            <th>会计科目</th>
            <th>项目</th>
            <th>金额</th>
          </tr>
        </thead>
        <tbody>
          ${parsed.rows.slice(0, 8).map((row) => `
            <tr>
              <td>${row.importable ? statusTag(row.recognitionStatus) : '<span class="tag gray">跳过</span>'}</td>
              <td>${escapeHtml(row.date)}</td>
              <td>${escapeHtml(entityById(row.entityId)?.name || "待识别")}</td>
              <td>${escapeHtml(row.accountSubject || "未提供")}</td>
              <td>${escapeHtml(projectById(row.projectId)?.code || row.reason || "待匹配")}</td>
              <td>${money(row.amount)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function parseAccountingImport(text) {
  const rows = parseDelimitedText(text);
  const parsedRows = rows.map((row) => normalizeAccountingRow(row));
  const importableRows = parsedRows.filter((row) => row.importable);
  return {
    rows: parsedRows,
    importable: importableRows.length,
    skipped: parsedRows.length - importableRows.length,
    pending: importableRows.filter((row) => row.recognitionStatus === "待确认口径" || !row.projectId).length
  };
}

function parseDelimitedText(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headers = parseDelimitedLine(lines.shift(), delimiter).map((item) => item.trim());
  return lines.map((line) => {
    const cells = parseDelimitedLine(line, delimiter).map((item) => item.trim());
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  });
}

function parseDelimitedLine(line, delimiter) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

function normalizeAccountingRow(row) {
  const accountSubject = readCell(row, ["会计科目", "科目名称", "会计科目名称", "科目", "一级科目", "明细科目"]);
  const accountCode = readCell(row, ["科目编码", "科目代码", "会计科目编码"]);
  const summary = readCell(row, ["摘要", "凭证摘要", "业务摘要", "说明"]) || "会计系统导入研发费用";
  const projectCode = readCell(row, ["项目编号", "项目代码", "项目", "辅助核算项目", "研发项目编号"]);
  const project = projectByCode(projectCode);
  const entityId = inferEntityId(row, project);
  const category = inferExpenseCategory(row, accountSubject, summary);
  const amount = inferAccountingAmount(row);
  const eligibleAmount = toNumber(readCell(row, ["可归集金额", "研发可归集金额"])) || amount;
  const researchAccount = /(研发费用|研发支出)/.test(accountSubject);
  const recognitionStatus = readCell(row, ["认定状态", "口径状态"]) || (project ? "可归集" : "待确认口径");
  const allocationStatus = project
    ? (category === "人员人工" && entityId === "sz" ? "待分摊" : "无需分摊")
    : "待匹配项目";
  return {
    raw: row,
    date: readCell(row, ["日期", "凭证日期", "记账日期", "业务日期"]) || "2025-08-01",
    entityId,
    projectId: project?.id || null,
    category,
    summary,
    vendor: readCell(row, ["供应商", "往来单位", "供应商/员工", "员工", "对方单位"]) || "会计系统",
    amount,
    eligibleAmount,
    recognitionStatus: researchAccount ? recognitionStatus : "不建议归集",
    allocationStatus,
    voucherNo: readCell(row, ["凭证号", "凭证编号", "凭证字号", "凭证"]) || "会计导入待匹配",
    accountCode,
    accountSubject,
    importable: researchAccount && amount > 0,
    reason: researchAccount ? (!project ? "待匹配项目" : "") : "非研发费用科目"
  };
}

function readCell(row, aliases) {
  for (const alias of aliases) {
    if (row[alias] != null && row[alias] !== "") return row[alias];
  }
  const normalizedEntries = Object.entries(row).map(([key, value]) => [key.replace(/\s/g, ""), value]);
  for (const alias of aliases) {
    const normalizedAlias = alias.replace(/\s/g, "");
    const match = normalizedEntries.find(([key, value]) => key === normalizedAlias && value !== "");
    if (match) return match[1];
  }
  return "";
}

function inferEntityId(row, project) {
  if (project) return project.entityId;
  const entityText = readCell(row, ["主体", "公司", "法人主体", "账套", "核算组织"]);
  const exact = db.entities.find((entity) => entity.name === entityText);
  if (exact) return exact.id;
  const haystack = Object.values(row).join(" ");
  if (/深圳|微智/.test(haystack)) return "sz";
  if (/杭州|微新|钱塘/.test(haystack)) return "hz";
  return ui.entity !== "all" ? ui.entity : "hz";
}

function inferExpenseCategory(row, accountSubject, summary) {
  const explicit = readCell(row, ["费用类型", "费用类别", "明细类型"]);
  if (explicit) return explicit;
  const text = `${accountSubject} ${summary}`;
  if (/工资|薪酬|社保|公积金|人员|人工|劳务/.test(text)) return "人员人工";
  if (/材料|试剂|耗材|样品|原料/.test(text)) return "直接投入";
  if (/折旧|摊销|设备/.test(text)) return "设备折旧";
  if (/检测|检验|测试|评价/.test(text)) return "检测检验";
  if (/委外|外包|合作研发|技术服务/.test(text)) return "委外研发";
  if (/租金|场地|水电|物业/.test(text)) return "场地租赁";
  if (/注册|备案|法规|专利|知识产权/.test(text)) return "注册法规";
  return "其他费用";
}

function inferAccountingAmount(row) {
  const debit = toNumber(readCell(row, ["借方金额", "借方", "本币借方"]));
  const direct = toNumber(readCell(row, ["金额", "发生金额", "本币金额", "原币金额"]));
  const credit = toNumber(readCell(row, ["贷方金额", "贷方", "本币贷方"]));
  if (debit > 0) return debit;
  if (direct > 0) return direct;
  if (credit > 0) return -credit;
  return 0;
}

function toNumber(value) {
  return Number(String(value || "").replace(/[,\s￥¥元]/g, "")) || 0;
}

function openPolicyModal(projectId) {
  const project = projectById(projectId);
  if (!project) return;
  const funding = isFundingProject(project);
  openModal(`
    <div class="modal-header">
      <h2>${funding ? "修改政策门槛" : "更新政策条件"}</h2>
      <button class="close-button" type="button" data-close-modal>×</button>
    </div>
    <form class="modal-body" id="policyForm" data-project="${project.id}">
      <div class="form-grid">
        <div class="form-field full">
          <label>项目名称</label>
          <input name="name" value="${escapeHtml(project.name)}" required>
        </div>
        ${funding ? `
          <div class="form-field">
            <label>研发投入要求(元)</label>
            <input name="threshold" type="number" min="0" step="10000" value="${project.threshold}" required>
          </div>
          <div class="form-field">
            <label>补贴比例</label>
            <input name="subsidyRate" type="number" min="0" max="1" step="0.01" value="${project.subsidyRate}" required>
          </div>
          <div class="form-field">
            <label>最高补贴金额(元)</label>
            <input name="cap" type="number" min="0" step="10000" value="${project.cap}" required>
          </div>
          <div class="form-field">
            <label>补贴已到账(元)</label>
            <input name="received" type="number" min="0" step="10000" value="${project.received}" required>
          </div>
        ` : `
          <div class="form-field">
            <label>条件进度(%)</label>
            <input name="requirementProgress" type="number" min="0" max="100" step="1" value="${project.requirementProgress || 0}" required>
          </div>
          <div class="form-field">
            <label>认定状态</label>
            <select name="policyResult">
              ${["待申报", "材料准备中", "已提交", "已受理", "已认定", "未通过"].map((item) => `<option ${project.policyResult === item ? "selected" : ""}>${item}</option>`).join("")}
            </select>
          </div>
          <div class="form-field full">
            <label>条件摘要</label>
            <textarea name="requirementSummary">${escapeHtml(project.requirementSummary || "")}</textarea>
          </div>
        `}
        <div class="form-field">
          <label>申报截止日</label>
          <input name="deadline" type="date" value="${project.deadline}" required>
        </div>
        <div class="form-field">
          <label>材料截止日</label>
          <input name="materialDeadline" type="date" value="${project.materialDeadline}" required>
        </div>
        <div class="form-field full">
          <label>备注</label>
          <textarea name="note">${escapeHtml(project.note)}</textarea>
        </div>
      </div>
    </form>
    <div class="modal-footer">
      <button class="button" type="button" data-close-modal>取消</button>
      <button class="button primary" type="button" data-action="save-policy">保存政策</button>
    </div>
  `);
}

function savePolicyFromModal() {
  const form = document.getElementById("policyForm");
  if (!form.reportValidity()) return;
  const project = projectById(form.dataset.project);
  const data = Object.fromEntries(new FormData(form));
  const funding = isFundingProject(project);
  Object.assign(project, {
    name: data.name,
    threshold: funding ? Number(data.threshold) : 0,
    subsidyRate: funding ? Number(data.subsidyRate) : 0,
    cap: funding ? Number(data.cap) : 0,
    received: funding ? Number(data.received) : 0,
    requirementProgress: funding ? project.requirementProgress : Number(data.requirementProgress || 0),
    policyResult: funding ? project.policyResult : data.policyResult,
    requirementSummary: funding ? project.requirementSummary : data.requirementSummary,
    deadline: data.deadline,
    materialDeadline: data.materialDeadline,
    note: data.note
  });
  saveState();
  closeModal();
  render();
  showToast(funding ? "政策门槛已更新" : "政策条件已更新");
}

function openProjectModal() {
  openModal(`
    <div class="modal-header">
      <h2>新增政策项目</h2>
      <button class="close-button" type="button" data-close-modal>×</button>
    </div>
    <form class="modal-body" id="projectForm">
      <div class="form-grid">
        <div class="form-field">
          <label>项目类型</label>
          <select name="applicationKind">
            <option value="funding">资金类申请</option>
            <option value="qualification">政策/资质类申请</option>
          </select>
        </div>
        <div class="form-field">
          <label>法人主体</label>
          <select name="entityId">${db.entities.map((entity) => `<option value="${entity.id}">${entity.name}</option>`).join("")}</select>
        </div>
        <div class="form-field">
          <label>申报年度</label>
          <input name="year" value="2026" required>
        </div>
        <div class="form-field full">
          <label>项目名称</label>
          <input name="name" value="高新技术企业认定" required>
        </div>
        <div class="form-field">
          <label>项目编号</label>
          <input name="code" value="NEW-2026" required>
        </div>
        <div class="form-field">
          <label>申报地区</label>
          <input name="area" value="深圳市" required>
        </div>
        <div class="form-field">
          <label>研发投入要求(元)</label>
          <input name="threshold" type="number" value="0" required>
        </div>
        <div class="form-field">
          <label>条件进度(%)</label>
          <input name="requirementProgress" type="number" min="0" max="100" value="30" required>
        </div>
      </div>
    </form>
    <div class="modal-footer">
      <button class="button" type="button" data-close-modal>取消</button>
      <button class="button primary" type="button" data-action="save-project">保存项目</button>
    </div>
  `);
}

function saveProjectFromModal() {
  const form = document.getElementById("projectForm");
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form));
  const funding = data.applicationKind !== "qualification";
  db.projects.push({
    id: `P-${Date.now()}`,
    code: data.code,
    entityId: data.entityId,
    name: data.name,
    area: data.area,
    year: data.year,
    cycle: `${data.year}-01 至 ${data.year}-12`,
    type: funding ? "研发补贴" : "资质认定",
    applicationKind: data.applicationKind,
    threshold: funding ? Number(data.threshold) : 0,
    subsidyRate: 0,
    cap: 0,
    received: 0,
    declaredAmount: 0,
    deadline: `${Number(data.year) + 1}-08-31`,
    materialDeadline: `${Number(data.year) + 1}-08-10`,
    owner: "张英",
    accountingScope: funding ? "待确认" : "非资金类政策申请",
    requirementProgress: funding ? undefined : Number(data.requirementProgress || 0),
    policyResult: funding ? undefined : "待申报",
    requirementSummary: funding ? undefined : "条件清单待梳理",
    approvalDate: `${data.year}-06-30`,
    researchDirection: inferResearchDirection({ name: data.name, type: funding ? "研发补贴" : "资质认定" }),
    executionStatus: "未启动",
    executionProgress: funding ? 0 : Number(data.requirementProgress || 0),
    nextProcess: funding ? defaultNextProcess({ threshold: Number(data.threshold) }) : defaultNextProcess({ applicationKind: "qualification" }),
    materialNeeds: funding ? defaultMaterialNeeds({ threshold: Number(data.threshold) }) : defaultMaterialNeeds({ applicationKind: "qualification" }),
    completedInfo: "项目已建立，基础信息待负责人补齐。",
    nextStep: "补充获批时间、研究方向、材料要求和费用归集计划。",
    formStatus: "待负责人更新",
    lastUpdate: new Date().toISOString().slice(0, 10),
    note: "新增项目，请补充具体政策口径。"
  });
  saveState();
  closeModal();
  render();
  showToast("政策项目已新增");
}

function saveMonthlyFixedNumbers() {
  const inputs = [...document.querySelectorAll(".monthly-fixed-input")];
  if (!inputs.length) return;
  let saved = 0;
  inputs.forEach((input) => {
    const project = projectById(input.dataset.project);
    if (!project) return;
    const amount = Number(input.value || 0);
    const id = monthlyFixedExpenseId(project.id, ui.month);
    const existing = db.expenses.find((expense) => expense.id === id);
    if (amount <= 0) {
      if (existing) db.expenses = db.expenses.filter((expense) => expense.id !== id);
      return;
    }
    const payload = {
      id,
      date: `${ui.month}-28`,
      entityId: project.entityId,
      projectId: project.id,
      category: "月度研发投入",
      summary: `${ui.month} ${project.name}研发投入固定录入`,
      vendor: "会计月度录入",
      amount,
      eligibleAmount: amount,
      recognitionStatus: "可归集",
      allocationStatus: "无需分摊",
      source: "月度固定录入",
      voucherNo: `${ui.month}-固定录入`,
      allocations: [],
      reviewMonth: ui.month,
      reviewStatus: "已审核",
      submitter: "会计",
      reviewer: project.owner || "张英"
    };
    if (existing) Object.assign(existing, payload);
    else db.expenses.unshift(payload);
    saved += 1;
  });
  saveState();
  render();
  showToast(`已保存 ${saved} 个项目的本月研发投入`);
}

function openLegacyImportModal() {
  openModal(`
    <div class="modal-header">
      <h2>导入历史项目</h2>
      <button class="close-button" type="button" data-close-modal>×</button>
    </div>
    <div class="modal-body">
      <div class="note-box" style="margin-bottom:12px;">
        适合把已经申请下来、执行到一半或已经完成的项目一次性导入。重点字段是获批日期、研究方向、当前阶段、历史已归集金额、补贴申请金额、资金到位金额、后续流程和待备材料。
      </div>
      <div class="import-layout">
        <div>
          <label class="field-label light" for="legacyImportText">历史项目清单</label>
          <textarea id="legacyImportText" class="paste-area">主体,项目编号,项目名称,项目类型,研究方向,获批日期,当前阶段,进度,申报年度,申报地区,项目周期,政府要求研发投入,历史已归集金额,补贴申请金额,资金到位金额,后续流程,待备材料,材料截止,负责人,已完成事项,下一步,备注
深圳微智,SZ2024WZ-OLD,深圳已立项研发补贴项目,研发课题,化妆品新原料,2024-11-18,材料准备中,65%,2024,深圳市,2024-09 至 2025-08,2500000,1680000,1600000,0,补齐费用归集 -> 出具专项审计 -> 提交验收材料,研发辅助账/专项审计/阶段总结/付款凭证,2026-07-20,张英,项目已立项并完成部分实验,重点核对费用是否足额放在深圳微智,曾因费用分配不足影响补贴
杭州微新,HZ2025-HNTE,杭州高新技术企业认定,资质认定,企业资质与创新能力,2025-12-10,执行中,55%,2025,浙江省/杭州市,2025-01 至 2026-12,0,0,0,0,条件预审 -> 审计报告 -> 申报提交,知识产权/科技人员/研发费用专项审计/成果转化,2026-08-20,张英,已启动条件梳理,补齐知识产权和研发费用占比说明,政策类项目无直接资金门槛</textarea>
        </div>
        <div>
          <label class="field-label light">导入预览</label>
          <div id="legacyImportPreview" class="import-preview"></div>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="button" type="button" data-close-modal>取消</button>
      <button class="button" type="button" data-action="preview-legacy-import">识别预览</button>
      <button class="button primary" type="button" data-action="run-legacy-import">导入项目</button>
    </div>
  `, true);
  renderLegacyProjectImportPreview();
}

function renderLegacyProjectImportPreview() {
  const preview = document.getElementById("legacyImportPreview");
  const text = document.getElementById("legacyImportText")?.value.trim();
  if (!preview || !text) return;
  const rows = parseLegacyProjectImport(text);
  const creates = rows.filter((row) => !row.existing).length;
  const updates = rows.length - creates;
  preview.innerHTML = `
    <div class="import-summary">
      <strong>${rows.length} 个项目</strong>
      <span>新增 ${creates} 个，更新 ${updates} 个</span>
    </div>
    <div class="table-wrap compact-preview">
      <table class="data-table">
        <thead>
          <tr>
            <th>动作</th>
            <th>主体</th>
            <th>项目编号</th>
            <th>阶段</th>
            <th>缺口</th>
          </tr>
        </thead>
        <tbody>
          ${rows.slice(0, 8).map((row) => {
            const gap = row.funding ? Math.max(row.threshold - row.baselineCollected, 0) : 0;
            return `
              <tr>
                <td>${row.existing ? statusTag("已更新") : statusTag("待导入")}</td>
                <td>${escapeHtml(entityById(row.entityId)?.name || "待识别")}</td>
                <td>${escapeHtml(row.code)}</td>
                <td>${escapeHtml(row.executionStatus)}</td>
                <td>${row.funding ? `${wan(gap)} 万` : "非资金类"}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function runLegacyProjectImport() {
  const text = document.getElementById("legacyImportText")?.value.trim();
  if (!text) return;
  const rows = parseLegacyProjectImport(text);
  if (!rows.length) {
    showToast("没有识别到可导入的项目");
    return;
  }
  let created = 0;
  let updated = 0;
  rows.forEach((row) => {
    const payload = {
      code: row.code,
      entityId: row.entityId,
      name: row.name,
      area: row.area,
      year: row.year,
      cycle: row.cycle,
      type: row.type,
      applicationKind: row.funding ? "funding" : "qualification",
      threshold: row.funding ? row.threshold : 0,
      baselineCollected: row.funding ? row.baselineCollected : 0,
      subsidyRate: row.subsidyRate,
      cap: row.cap,
      declaredAmount: row.funding ? row.declaredAmount : 0,
      received: row.funding ? row.received : 0,
      deadline: row.deadline,
      materialDeadline: row.materialDeadline,
      owner: row.owner,
      accountingScope: row.funding ? "按项目或年度归集研发费用" : "非资金类政策申请",
      requirementProgress: row.funding ? undefined : row.executionProgress,
      policyResult: row.funding ? undefined : row.executionStatus,
      requirementSummary: row.funding ? undefined : "按政策条件清单跟踪",
      approvalDate: row.approvalDate,
      researchDirection: row.researchDirection,
      executionStatus: row.executionStatus,
      executionProgress: row.executionProgress,
      nextProcess: row.nextProcess,
      materialNeeds: row.materialNeeds,
      completedInfo: row.completedInfo,
      nextStep: row.nextStep,
      formStatus: "已导入基础信息",
      lastUpdate: new Date().toISOString().slice(0, 10),
      note: row.note
    };
    if (row.existing) {
      Object.assign(row.existing, payload);
      updated += 1;
    } else {
      db.projects.push({
        id: `P-${row.code}-${Date.now()}`.replace(/[^\w-]/g, "-"),
        ...payload
      });
      created += 1;
    }
  });
  saveState();
  ui.page = "intake";
  closeModal();
  render();
  showToast(`已导入 ${created} 个、更新 ${updated} 个项目`);
}

function parseLegacyProjectImport(text) {
  return parseDelimitedText(text)
    .map((row, index) => normalizeLegacyProjectRow(row, index))
    .filter((row) => row.code && row.name);
}

function normalizeLegacyProjectRow(row, index) {
  const code = readCell(row, ["项目编号", "项目代码", "项目号", "编号"]) || `LEGACY-${index + 1}`;
  const existing = projectByCode(code);
  const name = readCell(row, ["项目名称", "项目", "政策名称"]) || existing?.name || "历史项目";
  const type = readCell(row, ["项目类型", "政策类型", "类型"]) || existing?.type || "研发补贴";
  const combined = `${name} ${type}`;
  const funding = !/资质|认定|国高|高新|专精特新|创新型/.test(combined);
  const entityId = inferEntityId(row, existing);
  const threshold = toNumber(readCell(row, ["政府要求研发投入", "研发投入要求", "费用门槛", "研发费用门槛", "目标金额"])) || Number(existing?.threshold || 0);
  const baselineCollected = toNumber(readCell(row, ["历史已归集金额", "已归集金额", "已发生金额", "已投入金额", "已发生研发费用"])) || Number(existing?.baselineCollected || 0);
  const progress = toPercentNumber(readCell(row, ["进度", "当前进度", "条件进度"])) || (threshold ? Math.round(Math.min(baselineCollected / threshold, 1) * 100) : Number(existing?.requirementProgress || 0));
  return {
    existing,
    code,
    entityId,
    name,
    type,
    funding,
    researchDirection: readCell(row, ["研究方向", "方向", "板块"]) || existing?.researchDirection || inferResearchDirection({ name, type }),
    approvalDate: readCell(row, ["获批日期", "申请下来日期", "立项日期", "批复日期"]) || existing?.approvalDate || "待确认",
    executionStatus: readCell(row, ["当前阶段", "项目阶段", "执行状态", "状态"]) || existing?.executionStatus || "执行中",
    executionProgress: Math.max(0, Math.min(Math.round(progress), 100)),
    year: readCell(row, ["申报年度", "年度", "年份"]) || existing?.year || "2026",
    area: readCell(row, ["申报地区", "地区", "区域"]) || existing?.area || entityById(entityId)?.location || "待确认",
    cycle: readCell(row, ["项目周期", "周期"]) || existing?.cycle || "待确认",
    threshold,
    baselineCollected,
    subsidyRate: toRate(readCell(row, ["补贴比例", "资助比例"])) || Number(existing?.subsidyRate || 0),
    cap: toNumber(readCell(row, ["最高补贴金额", "补贴上限", "上限"])) || Number(existing?.cap || 0),
    declaredAmount: toNumber(readCell(row, ["补贴申请金额", "已申请补贴", "申请补贴金额", "已申报金额", "申报金额", "已申报"])) || Number(existing?.declaredAmount || 0),
    received: toNumber(readCell(row, ["资金到位金额", "已到位资金", "已收到金额", "到账金额"])) || Number(existing?.received || 0),
    deadline: readCell(row, ["申报截止", "申报截止日"]) || existing?.deadline || "2026-08-31",
    materialDeadline: readCell(row, ["材料截止", "材料截止日", "材料节点"]) || existing?.materialDeadline || "2026-08-10",
    owner: readCell(row, ["负责人", "项目负责人", "申报负责人"]) || existing?.owner || "张英",
    nextProcess: readCell(row, ["后续流程", "下一流程", "后续需要流程"]) || existing?.nextProcess || defaultNextProcess({ applicationKind: funding ? "funding" : "qualification", threshold }),
    materialNeeds: readCell(row, ["待备材料", "后续材料", "需要准备材料", "材料清单"]) || existing?.materialNeeds || defaultMaterialNeeds({ applicationKind: funding ? "funding" : "qualification", threshold }),
    completedInfo: readCell(row, ["已完成事项", "已完成信息", "完成情况"]) || existing?.completedInfo || "基础信息已导入，完成事项待负责人补充。",
    nextStep: readCell(row, ["下一步", "后续动作"]) || existing?.nextStep || "负责人补齐信息后，财务按主体和项目复核费用归集。",
    note: readCell(row, ["备注", "说明"]) || existing?.note || ""
  };
}

function toPercentNumber(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  const number = Number(text.replace(/[,%\s]/g, ""));
  if (!Number.isFinite(number)) return 0;
  if (number > 0 && number <= 1 && !text.includes("%")) return number * 100;
  return number;
}

function toRate(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  const number = Number(text.replace(/[,%\s]/g, ""));
  if (!Number.isFinite(number)) return 0;
  if (text.includes("%") || number > 1) return number / 100;
  return number;
}

function openProjectUpdateModal(projectId) {
  const project = projectById(projectId);
  if (!project) return;
  const aggregate = aggregateProject(project);
  const funding = isFundingProject(project);
  const stageProgress = projectStageProgress(project, aggregate);
  openModal(`
    <div class="modal-header">
      <h2>更新项目进展</h2>
      <button class="close-button" type="button" data-close-modal>×</button>
    </div>
    <form class="modal-body" id="projectUpdateForm" data-project="${project.id}">
      <div class="form-grid">
        <div class="form-field full">
          <label>项目名称</label>
          <input name="name" value="${escapeHtml(project.name)}" required>
        </div>
        <div class="form-field">
          <label>申请下来/获批日期</label>
          <input name="approvalDate" value="${escapeHtml(project.approvalDate || "")}" placeholder="例如 2025-11-18">
        </div>
        <div class="form-field">
          <label>研究方向</label>
          <input name="researchDirection" value="${escapeHtml(project.researchDirection || "")}" required>
        </div>
        <div class="form-field">
          <label>当前阶段</label>
          <select name="executionStatus">
            ${["未启动", "执行中", "材料准备中", "已提交", "已完成", "暂停", "逾期待补"].map((item) => `<option ${project.executionStatus === item ? "selected" : ""}>${item}</option>`).join("")}
          </select>
        </div>
        <div class="form-field">
          <label>阶段进度(%)</label>
          <input name="executionProgress" type="number" min="0" max="100" step="1" value="${stageProgress}" required>
        </div>
        ${funding ? `
          <div class="form-field">
            <label>历史已归集金额(元)</label>
            <input name="baselineCollected" type="number" min="0" step="1000" value="${Number(project.baselineCollected || 0)}">
          </div>
          <div class="form-field">
            <label>补贴申请金额(元)</label>
            <input name="declaredAmount" type="number" min="0" step="1000" value="${Number(project.declaredAmount || 0)}">
          </div>
          <div class="form-field">
            <label>已到位资金(元)</label>
            <input name="received" type="number" min="0" step="1000" value="${Number(project.received || 0)}">
          </div>
        ` : `
          <div class="form-field">
            <label>认定/申报状态</label>
            <input name="policyResult" value="${escapeHtml(project.policyResult || project.executionStatus || "待申报")}">
          </div>
        `}
        <div class="form-field">
          <label>材料截止日</label>
          <input name="materialDeadline" type="date" value="${escapeHtml(project.materialDeadline || "")}">
        </div>
        <div class="form-field">
          <label>负责人</label>
          <input name="owner" value="${escapeHtml(project.owner || "张英")}">
        </div>
        <div class="form-field full">
          <label>后续流程</label>
          <textarea name="nextProcess">${escapeHtml(project.nextProcess || defaultNextProcess(project))}</textarea>
        </div>
        <div class="form-field full">
          <label>后续需要准备的材料</label>
          <textarea name="materialNeeds">${escapeHtml(project.materialNeeds || defaultMaterialNeeds(project))}</textarea>
        </div>
        <div class="form-field full">
          <label>已经完成的信息</label>
          <textarea name="completedInfo">${escapeHtml(project.completedInfo || "")}</textarea>
        </div>
        <div class="form-field full">
          <label>下一步动作</label>
          <textarea name="nextStep">${escapeHtml(project.nextStep || "")}</textarea>
        </div>
      </div>
    </form>
    <div class="modal-footer">
      <button class="button" type="button" data-close-modal>取消</button>
      <button class="button primary" type="button" data-action="save-project-update">保存更新</button>
    </div>
  `, true);
}

function saveProjectUpdateFromModal() {
  const form = document.getElementById("projectUpdateForm");
  if (!form.reportValidity()) return;
  const project = projectById(form.dataset.project);
  const data = Object.fromEntries(new FormData(form));
  const funding = isFundingProject(project);
  Object.assign(project, {
    name: data.name,
    approvalDate: data.approvalDate || "待确认",
    researchDirection: data.researchDirection,
    executionStatus: data.executionStatus,
    executionProgress: Number(data.executionProgress || 0),
    materialDeadline: data.materialDeadline || project.materialDeadline,
    owner: data.owner || project.owner,
    nextProcess: data.nextProcess,
    materialNeeds: data.materialNeeds,
    completedInfo: data.completedInfo,
    nextStep: data.nextStep,
    formStatus: "已更新",
    lastUpdate: new Date().toISOString().slice(0, 10)
  });
  if (funding) {
    project.baselineCollected = Number(data.baselineCollected || 0);
    project.declaredAmount = Number(data.declaredAmount || 0);
    project.received = Number(data.received || 0);
  } else {
    project.requirementProgress = Number(data.executionProgress || 0);
    project.policyResult = data.policyResult || data.executionStatus;
  }
  saveState();
  closeModal();
  render();
  showToast("项目进展已更新");
}

function approveExpense(expenseId) {
  const expense = db.expenses.find((item) => item.id === expenseId);
  if (!expense) return;
  expense.recognitionStatus = "可归集";
  saveState();
  render();
  showToast("费用口径已确认为可归集");
}

function approveReview(expenseId) {
  const expense = db.expenses.find((item) => item.id === expenseId);
  if (!expense) return;
  expense.reviewStatus = "已审核";
  expense.reviewedAt = new Date().toISOString().slice(0, 10);
  saveState();
  render();
  showToast("负责人审核已通过");
}

function returnReview(expenseId) {
  const expense = db.expenses.find((item) => item.id === expenseId);
  if (!expense) return;
  expense.reviewStatus = "退回调整";
  saveState();
  render();
  showToast("已退回财务调整");
}

function approveMonth() {
  const pending = monthlyExpenses().filter((expense) => expense.reviewStatus === "待负责人审核");
  pending.forEach((expense) => {
    expense.reviewStatus = "已审核";
    expense.reviewedAt = new Date().toISOString().slice(0, 10);
  });
  saveState();
  render();
  showToast(`已通过 ${pending.length} 条本月记录`);
}

function inspectExpense(expenseId) {
  const expense = db.expenses.find((item) => item.id === expenseId);
  if (!expense) return;
  const project = projectById(expense.projectId);
  openModal(`
    <div class="modal-header">
      <h2>费用详情</h2>
      <button class="close-button" type="button" data-close-modal>×</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        ${detailField("费用编号", expense.id)}
        ${detailField("费用日期", expense.date)}
        ${detailField("法人主体", entityById(expense.entityId).name)}
        ${detailField("归属项目", project?.name || allocationLabel(expense))}
        ${detailField("费用类型", expense.category)}
        ${detailField("发生金额", `${money(expense.amount)} 元`)}
        ${detailField("可归集金额", `${money(expense.eligibleAmount)} 元`)}
        ${detailField("认定状态", expense.recognitionStatus)}
        ${detailField("审核状态", expense.reviewStatus || "待负责人审核")}
        ${detailField("来源", expense.source)}
        ${detailField("凭证号", expense.voucherNo)}
        <div class="form-field full"><label>摘要</label><div class="note-box">${escapeHtml(expense.summary)}</div></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="button primary" type="button" data-close-modal>关闭</button>
    </div>
  `);
}

function detailField(label, value) {
  return `<div class="form-field"><label>${escapeHtml(label)}</label><div class="note-box">${escapeHtml(value)}</div></div>`;
}

function bindAllocationInputs() {
  updateAllocationTotal();
  document.querySelectorAll(".allocation-percent").forEach((input) => {
    input.addEventListener("input", () => {
      const number = document.querySelector(`.allocation-number[data-project="${input.dataset.project}"]`);
      if (number) number.value = input.value;
      updateAllocationTotal();
    });
  });
  document.querySelectorAll(".allocation-number").forEach((input) => {
    input.addEventListener("input", () => {
      const range = document.querySelector(`.allocation-percent[data-project="${input.dataset.project}"]`);
      if (range) range.value = input.value;
      updateAllocationTotal();
    });
  });
}

function updateAllocationTotal() {
  const total = [...document.querySelectorAll(".allocation-number")]
    .reduce((sum, input) => sum + Number(input.value || 0), 0);
  const box = document.getElementById("allocationTotal");
  if (!box) return;
  box.innerHTML = total === 100
    ? `<strong class="money-green">当前合计 100%</strong><br>比例正确，可以保存分摊。`
    : `<strong class="danger-text">当前合计 ${total}%</strong><br>保存前需要调整为 100%。`;
}

function saveAllocation() {
  const detail = document.querySelector(".allocation-detail");
  if (!detail) return;
  const expense = db.expenses.find((item) => item.id === detail.dataset.expense);
  const inputs = [...document.querySelectorAll(".allocation-number")];
  const total = inputs.reduce((sum, input) => sum + Number(input.value || 0), 0);
  if (total !== 100) {
    showToast("分摊比例需要合计 100%");
    return;
  }
  expense.allocations = inputs
    .map((input) => ({ projectId: input.dataset.project, percent: Number(input.value || 0) }))
    .filter((item) => item.percent > 0);
  expense.projectId = null;
  expense.allocationStatus = "已分摊";
  saveState();
  render();
  showToast("人员费用已分摊到深圳课题");
}

function markAllReminders() {
  db.reminders.forEach((reminder) => {
    if (dateDiffDays(reminder.dueDate) > 0) reminder.status = "处理中";
  });
  saveState();
  render();
  showToast("未到期提醒已标记为处理中");
}

function exportSummary() {
  const rows = [["主体", "项目编号", "项目名称", "研究方向", "政府要求研发投入", "当前研发投入", "研发投入缺口", "研发投入达标率", "补贴申请金额", "补贴到位金额", "补贴资金到账率"]];
  filteredProjects().filter(isBalanceProject).forEach((project) => {
    const aggregate = aggregateProject(project);
    rows.push([
      entityById(project.entityId).name,
      project.code,
      project.name,
      project.researchDirection || "",
      project.threshold,
      Math.round(aggregate.total),
      Math.round(aggregate.gap),
      pct(aggregate.investmentProgress),
      fundingRequested(project),
      Number(project.received || 0),
      pct(aggregate.fundingProgress)
    ]);
  });
  downloadCsv("研发补贴平衡汇总.csv", rows);
}

function exportExpenses() {
  const rows = [["日期", "主体", "项目", "费用编号", "费用类型", "摘要", "供应商", "发生金额", "可归集金额", "认定状态", "分摊状态", "凭证号", "来源"]];
  filteredExpenses().forEach((expense) => {
    rows.push([
      expense.date,
      entityById(expense.entityId).name,
      projectById(expense.projectId)?.name || allocationLabel(expense),
      expense.id,
      expense.category,
      expense.summary,
      expense.vendor,
      expense.amount,
      expense.eligibleAmount,
      expense.recognitionStatus,
      expense.allocationStatus,
      expense.voucherNo,
      expense.source
    ]);
  });
  downloadCsv("研发费用台账.csv", rows);
}

function copyMonthlyReport() {
  const text = monthlyReportText();
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showToast("月报已复制，可以粘贴到邮件或微信"))
      .catch(() => fallbackCopyText(text));
    return;
  }
  fallbackCopyText(text);
}

function fallbackCopyText(text) {
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.left = "-9999px";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
  showToast("月报已复制，可以粘贴到邮件或微信");
}

function exportMonthlyReport() {
  downloadText(`${ui.month}-研发补贴平衡月报.txt`, monthlyReportText());
}

function applyAnalysisBudget() {
  const value = Number(document.getElementById("analysisBudgetInput")?.value || 0);
  ui.analysisBudget = Math.max(value, 0);
  render();
  showToast("已按新的预计投入重新分析");
}

function copyAnalysisSummary() {
  const analysis = buildSmartAnalysisData();
  const text = [
    "研发补贴台账智能分析建议",
    "",
    analysis.conclusion,
    analysis.nextMove,
    "",
    "优先行动：",
    ...analysis.actions.map((item, index) => `${index + 1}. [${item.level === "high" ? "高" : item.level === "mid" ? "中" : "低"}] ${item.title}；负责人：${item.owner}；原因：${item.detail}；下一步：${item.nextStep}`)
  ].join("\n");
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showToast("智能分析建议已复制"))
      .catch(() => fallbackCopyText(text));
    return;
  }
  fallbackCopyText(text);
}

function openMonthlyReportEmail() {
  if (!REPORT_EMAILS.length) {
    showToast("还没有设置月报收件邮箱");
    return;
  }
  const subject = `研发补贴平衡月报（${ui.month}）`;
  const body = monthlyReportText();
  const mailto = `mailto:${REPORT_EMAILS.map(encodeURIComponent).join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;
  showToast("已打开邮件草稿，确认后点发送");
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("CSV 已导出");
}

function downloadText(filename, text) {
  const blob = new Blob([`\uFEFF${text}`], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("月报文本已导出");
}

function handleAction(action, target) {
  const actions = {
    "add-expense": openExpenseModal,
    "save-expense": saveExpenseFromModal,
    "open-import": openImportModal,
    "preview-import": renderImportPreviewFromText,
    "run-import": runImport,
    "open-legacy-import": openLegacyImportModal,
    "preview-legacy-import": renderLegacyProjectImportPreview,
    "run-legacy-import": runLegacyProjectImport,
    "export-summary": exportSummary,
    "export-expenses": exportExpenses,
    "copy-monthly-report": copyMonthlyReport,
    "export-monthly-report": exportMonthlyReport,
    "open-monthly-report-html": openMonthlyReportHtml,
    "open-report-email": openMonthlyReportEmail,
    "apply-analysis-budget": applyAnalysisBudget,
    "copy-analysis-summary": copyAnalysisSummary,
    "open-project-modal": openProjectModal,
    "save-project": saveProjectFromModal,
    "save-monthly-fixed": saveMonthlyFixedNumbers,
    "save-project-update": saveProjectUpdateFromModal,
    "save-policy": savePolicyFromModal,
    "save-allocation": saveAllocation,
    "mark-all-reminders": markAllReminders,
    "approve-month": approveMonth,
    "login": loginWithPassword,
    "send-login-link": sendLoginLink,
    "logout": logout,
    "sync-now": async () => {
      if (!cloud.user) {
        renderAuthGate();
        return;
      }
      if (!cloud.db) {
        await prepareCloudbase();
      }
      if (!cloud.db) {
        showToast("腾讯云数据库暂时没连上，当前数据已保存在本机");
        return;
      }
      await loadCloudState();
      render();
      showToast("已刷新腾讯云数据");
    },
    "reset-data": () => {
      db = migrateState(clone(seed));
      saveState();
      render();
      showToast("演示数据已重置");
    }
  };
  if (action === "open-policy") return openPolicyModal(target.dataset.project);
  if (action === "open-project-update") return openProjectUpdateModal(target.dataset.project);
  if (action === "approve-expense") return approveExpense(target.dataset.expense);
  if (action === "approve-review") return approveReview(target.dataset.expense);
  if (action === "return-review") return returnReview(target.dataset.expense);
  if (action === "inspect-expense") return inspectExpense(target.dataset.expense);
  if (action === "edit-expense") return openExpenseModal(target.dataset.expense);
  if (action === "select-allocation") {
    ui.allocationExpenseId = target.dataset.expense;
    return render();
  }
  if (actions[action]) actions[action]();
}

document.addEventListener("click", (event) => {
  const close = event.target.closest("[data-close-modal]");
  if (close) return closeModal();

  if (event.target === dom.modalLayer) return closeModal();

  const nav = event.target.closest("[data-nav]");
  if (nav) {
    ui.page = nav.dataset.nav;
    render();
    return;
  }

  const navTarget = event.target.closest("[data-nav-target]");
  if (navTarget) {
    ui.page = navTarget.dataset.navTarget;
    render();
    return;
  }

  const action = event.target.closest("[data-action]");
  if (action) handleAction(action.dataset.action, action);
});

document.addEventListener("change", (event) => {
  if (event.target?.id === "monthSelect") {
    ui.month = event.target.value;
    render();
  }
});

dom.entityTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-entity]");
  if (!button) return;
  ui.entity = button.dataset.entity;
  render();
});

dom.sidebarEntity.addEventListener("change", (event) => {
  ui.entity = event.target.value;
  render();
});

dom.yearFilter.addEventListener("change", (event) => {
  ui.year = event.target.value;
  render();
});

dom.globalSearch.addEventListener("input", (event) => {
  ui.search = event.target.value;
  render();
});

render();
initCloud();
