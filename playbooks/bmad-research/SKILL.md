---
name: bmad-research
description: BMad 小队调研/简报流程（Mary）。做市场/竞品/技术可行性调研，产出 brief 或 PRFAQ，按 bmad-squad-protocol 的固定目录落盘。
---
# 调研 / Brief（Mary）

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

## 收尾
- 若调研引出新工作，提示 Lead 让 Sofia 建票据（不要自建 index 行）。
- 交付后按 `bmad-squad-protocol` 阶段门跑校验器（你按固定位置写对即可，并对照本节自检清单）。
