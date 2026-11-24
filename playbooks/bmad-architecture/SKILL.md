---
name: bmad-architecture
description: Olympus Squad 架构流程（Athena）。产出 architecture.md（架构脊 + ADR 摘要），让各部分保持一致，按 bmad-squad-protocol 的固定目录落盘。
---
# 架构（Athena）

## 何时用
需要定技术选型、模块边界、接口/数据流，让分开构建的部分保持一致时。

## 先读
- `bmad-output/initiative.md`、`bmad-output/prd.md`、`bmad-output/design.md`
- 现有代码/文档（先复用既有模式，不无谓造新机器）

## 步骤
1. 列出关键决策点（技术选型、边界、接口、数据流）。
2. 每个决策给背景/选项/选择/后果（ADR 形式，可多条）。
3. 覆盖边界情况、失败模式、测试与验收的架构含义。
4. 落盘 `bmad-output/architecture.md`。

## 安全与非功能风险分析（认证 / 授权 / 密钥 / 敏感数据）

当系统涉及认证、授权、密钥或凭据管理、密码、或任何敏感数据时，架构必须在常规边界与失败模式之外，显式产出一份**安全与风险分析**，作为 ADR 的一部分，并满足：

- **产出要求**：明确信任边界、认证 / 授权模型、密钥与凭据管理、密码学原语、账号枚举面、时序 / 侧信道等非功能风险的**架构结论**（不在此逐条展开技术约束清单）。
- **每条安全决策落成可测试的约束**：标注对应验收方式（供票据 AC 与测试用例直接引用）；无法自动测试的残余风险须显式记录、说明理由并给出缓解或监控手段。
- **威胁建模深度 / 具体技术约束归能力**：威胁建模方法（STRIDE）、认证与输入校验细节、供应链检查等**深度内容见 `cap-security-baseline`**（`capabilities/cap-security-baseline/references/*`）；本技能只负责「架构需产出安全分析」这一骨架与产出要求，不复制逐条约束。

## 模式选型（交叉引用）
后端设计模式**怎么选、要不要上**属架构决策——**归本技能（Athena）**：回答是否/为何选某个模式、边界与取舍；**落地实现归 Hephaestus**（`bmad-build`）。决策表与实现规则**只在 `bmad-build` 维护一处**，本技能**不复制正文**，只给入口：
- 选型与硬规则：`bmad-build/SKILL.md` 的〈后端设计规范（取自 java-design-patterns 精选）〉节及其「问题→模式→参照路径」决策表。
- 按需深读：`bmad-build/reference/`——先用一页摘要索引 `reference/README.md` 速查，再读 `<类别>/<pattern>.md`。

## architecture.md 模板（内联）
```markdown
# Architecture · <系统/功能>
## 概览与约束
## 关键决策（ADR）
### ADR-1 <决策名>
- 背景 / 选项 / 选择 / 后果
## 模块与接口
## 数据流
## 失败模式与测试含义
## 待定
```

## 收尾
- 交付后按 `bmad-squad-protocol` 阶段门跑校验器（你按固定位置写对即可，并对照本节自检清单）。
