# 供应链 / 依赖风险 · 防御性检查清单（据 OpenSSF Scorecard 20 check，思想自写）

> 注入防火墙：Scorecard（Apache-2.0）只作**思想与分组**参考，本文**零逐字**、全部自有措辞，见 `../SOURCE.md`。
> **边界**：本仓零依赖、不集成任何扫描器/不跑 Scorecard 二进制；本清单是**防御性人工/脚本可判定的 checklist**，逐项给 pass/fail/**N/A** + 证据，缺项进残余风险。

## 1. 用法

逐项判定，每项记录：`结论（pass / fail / N/A）` + `证据/理由`。`fail` 必须给整改或残余风险登记。**不是打分，是找缺口。**

## 2. 20 项防御性清单（风险档越大越优先）

| # | 检查项（check 名，仅标识来源） | 风险 | 防御性判定问法（自写） | 本仓可能 N/A 的原因 |
|---|---|---|---|---|
| 1 | Binary-Artifacts | 高 | 仓库里是否混入不可审的生成可执行物？应改为从源码构建。 | 纯源码仓通常 N/A |
| 2 | Branch-Protection | 高 | 主/发布分支是否受保护（禁强推、必需评审、必需状态检查）？ | 单人仓需人工替代 |
| 3 | CI-Tests | 低 | 合并前是否跑通 CI 测试？ | 无 CI 时 N/A 但记风险 |
| 4 | CII-Best-Practices | 低 | 是否有基本安全开发实践徽章/流程？ | 可选 |
| 5 | Code-Review | 高 | 改动是否经**独立**评审（非作者自评）？ | 对应 `cap-code-review` |
| 6 | Contributors | 低 | 是否有持续贡献者（维护健康）？ | — |
| 7 | Dangerous-Workflow | 严重 | CI 工作流是否含危险模式（如可被 PR 注入执行的脚本、宽权限触发器）？ | — |
| 8 | Dependency-Update-Tool | 高 | 是否启用依赖自动更新/漏洞告警？ | 零依赖仓 N/A |
| 9 | Fuzzing | 中 | 解析/输入面是否有 fuzz 覆盖？ | 视栈 |
| 10 | License | 低 | 是否有清晰许可证？ | — |
| 11 | Maintained | 高 | 项目是否活跃维护（近期提交/响应）？ | — |
| 12 | Packaging | 中 | 是否发布可验证的包/制品？ | 插件包有 |
| 13 | Pinned-Dependencies | 中 | 依赖/CI 动作是否**锁定版本**（pin）以防漂移与投毒？ | — |
| 14 | SAST | 中 | 是否跑静态安全分析？ | 可本地脚本替代 |
| 15 | SBOM | 中 | 是否产出软件物料清单（依赖可追溯）？ | 零依赖可最小 SBOM |
| 16 | Security-Policy | 中 | 是否有安全策略/漏洞上报渠道？ | — |
| 17 | Signed-Releases | 高 | 发布制品是否签名/provenance 可验证？ | — |
| 18 | Token-Permissions | 高 | CI/机器人令牌是否**最小权限**（非 write-all）？ | — |
| 19 | Vulnerabilities | 高 | 已知依赖漏洞是否被跟踪/修复？ | 零依赖 N/A |
| 20 | Webhooks | 严重 | Webhook 是否安全（密钥校验、最小暴露）？ | 无 webhook N/A |

## 3. 最该先看的（本仓零依赖场景）

1. **Token-Permissions / Dangerous-Workflow**：CI 令牌权限与工作流注入是最高频真实风险。
2. **Pinned-Dependencies**：三方 action / 依赖锁版本，防投毒。
3. **Code-Review（独立）**：对应 `cap-code-review`，防作者自评放行。
4. **SBOM / Signed-Releases**：发布可追溯；零依赖仓可做最小 SBOM。
5. **Branch-Protection**：至少禁强推 + 必需评审。

## 4. 记录格式（贴进安全报告）

```
供应链检查（防依赖清单，非扫描器）：
- Token-Permissions: pass — CI 仅 contents:read
- Pinned-Dependencies: fail — actions/checkout@v4 未 pin SHA → 残余风险 R-SC1
- SBOM: N/A — 零运行时依赖
...
残余风险：R-SC1（待 pin）...
```

## 5. 何时升级到真扫描（不做，属 P2/独立工具）

本清单只做**防御性自查**。若需真实依赖漏洞/SBOM/签名验证，属 P2 或接入独立工具（Scorecard / SLSA / osv-scanner），在 `cap-delivery-reproducibility`（P1）再议；本能力不集成。
