---
name: bmad-research
description: Olympus Squad 调研/简报流程（Apollo）。做市场/竞品/技术可行性调研，产出 brief 或 PRFAQ，按 bmad-squad-protocol 的固定目录落盘。
---
# 调研 / Brief（Apollo）

## 何时用
需要外部事实、可行性判断、竞品/市场分析，或要把想法变成一页 brief / PRFAQ 时。

## 先读
- `bmad-output/initiative.md`（目标与范围）
- `bmad-output/index.md`（已有票据，避免重复）

## 步骤
1. 写清要回答的**决策问题**（给谁、要做什么决定、多快）。
2. 用 web 工具检索证据，**每条结论带来源链接**，区分事实与假设。
3. 结论先行：先给判断，再给支撑；列出不确定点。
4. 落盘到固定位置。

## 产出位置
- 调研笔记：`bmad-output/research/<slug>.md`
- 一页简报：`bmad-output/research/brief-<slug>.md`

## Brief 模板（内联，直接照此结构写）
```markdown
# Brief · <主题>
## 问题
<一句话：要决定什么>
## 结论（先行）
<值不值得做 / 推荐方向>
## 证据
- <事实> — [来源](链接)
## 关键假设与风险
## 下一步建议
```

## 术语（GLOSSARY）纪律（指针）

- 访谈 / 调研遇到模糊或过载术语时用一句话消歧：**一个术语只允许一个含义，先澄清再记录**，别把歧义带进 brief / PRD。
- 定案的术语条目落到 `bmad-output/` 的**产物 / 指针**（如 `research/glossary.md`）；**术语表非票据真相**（票据状态只在 `index.md` / `initiative.md`，术语表不载实现细节、不进 `index.md` 票行）。
- glossary 纪律正文与 ADR 三条触发的**单一真源见 `bmad-architecture/SKILL.md`〈术语与 ADR 纪律〉**，此处不复述。

## 超大举措 scoping（仅用于「超过一个会话装不下」的举措）

有的举措**大到一次会话装不下**、路还没看清（雾里）。常规举措用 `initiative.md` 的目标 / 范围 / 开放问题就够，**不要**套本节流程；只有当「一个会话装不下」时才用这套 scoping 框架，把「找到通往终点的路」和「冲到终点」分开。

**适用门槛（负路径，先判）**：
- **用**：范围明显超过一次会话能装下的量、关键决策互相牵连看不清、需要多轮才能把路走明。
- **不用**：一次会话能做完 / 能直接开的常规举措——按 `initiative.md` 的常规范围划定走，**不套用**本节。
- 「是否超过一个会话」由 Lead 判定并在 `initiative.md` 标注；拿不准先按常规举措做，真做不下再升级。

**四个动作**：
1. **命名 destination（终点）**：先写清「走到头是什么样」——一份可交付的 spec、一个要先定下的关键决策、或一次就地改动。destination 决定范围，先定它，后面每个问题都对它校准。
2. **列 fog of war（未知区）**：把「知道迟早要面对、但现在还说不清」的问题区写下来（如 initiative 的「未定 / 待探索」）。**别把雾硬切成一条条 ticket**——雾比单条决策粗，等前进一步看清了再转成具体问题。
3. **定 frontier（当前可解边界）**：从雾里挑出**现在这一轮就能解**的一小组问题（不依赖还没答案的问题），作为本轮边界。
4. **一次解一个 → 产出决策（decisions-not-deliverables）**：每轮只解 frontier 上的一个**决策**，记下**决策记录**（问题 → 选项 → 选择 → 理由 → 影响）；frontier 推进、雾随之前移，直到路清晰、没有待决问题——再交正常实现流程去「做」。**先定方向 / 关键取舍，不承诺具体交付。**

**落点与不重复**：
- 决策记录是 `bmad-output/` 下的**产物 / 指针**（如 `research/scoping-<举措>.md`，或 initiative 的「决策记录 / 未定」小节），**不是第二真相源**；票据状态 / 依赖仍只在 `index.md`（需要转成 ticket 时由 Themis 建行）。
- **与 initiative 协作不重复**：initiative 的常规目标 / 范围 / 开放问题仍按原样由 Themis 维护；本节只在「超大举措」时**补充** destination / fog / frontier，**不复制** initiative 既有小节。
- **不引入外部 tracker / map 票机制**：只借「destination / fog of war / frontier / 一次解一个决策」的框架，决策落成本仓库的 `bmad-output/` 产物 / 指针与 `index.md` 票据依赖，**不搬**外部 issue-map / map 票 / 外部 tracker。

**与常规调研 / grilling 的边界**：本节是「超大举措怎么统筹」；具体每个决策怎么访谈、怎么调证据仍分别走本 playbook 常规调研与 grilling 访谈，本节不重复它们的流程。

## 收尾
- 若调研引出新工作，提示 Lead 让 Themis 建票据（不要自建 index 行）。
- 交付后按 `bmad-squad-protocol` 阶段门跑校验器（你按固定位置写对即可，并对照本节自检清单）。
