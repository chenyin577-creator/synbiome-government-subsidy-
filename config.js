window.SUBSIDY_APP_CONFIG = {
  // 腾讯云 CloudBase 环境。这个版本只用腾讯云一体化保存数据。
  cloudbaseEnvId: "synbiome-d6gjygam37987566a",

  // 存放台账数据的腾讯云集合名称。
  cloudbaseCollection: "ledger_snapshots",

  // 一家公司一个台账。没有特殊需要不要改。
  organizationId: "micro-wisdom-balance",

  // MVP 简化登录：只允许下面三个公司邮箱，用统一密码登录。
  loginPassword: "888888",
  cloudbaseLoginPassword: "Synbiome888888",
  accounts: [
    { email: "yin.chen@synbiome.cn", cloudUsername: "yinchen", role: "管理层" },
    { email: "yin.zhang@synbiome.cn", cloudUsername: "yinzhang", role: "项目负责人" },
    { email: "lei.dai@synbiome.cn", cloudUsername: "leidai", role: "会计" }
  ]
};
