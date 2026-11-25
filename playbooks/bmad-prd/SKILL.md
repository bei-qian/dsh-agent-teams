---
name: bmad-prd
description: Olympus Squad PRD 流程（Prometheus）。把已确认的想法/调研写成结构化 PRD，按 bmad-squad-protocol 的固定目录落盘。
---
# PRD（Prometheus）

## 何时用
想法已成形、需要一份团队可据此实现的 PRD 时。

## 先读
- `bmad-output/initiative.md`
- `bmad-output/research/`（若 Apollo 已调研）
- `bmad-output/index.md`

## 步骤
1. 明确目标、成功标准、范围与非目标。
2. 用户故事 + 验收要点；列出依赖与开放问题（不要臆造需求）。
3. 落盘到 `bmad-output/prd.md`（覆盖更新，不新建副本）。

## PRD 模板（内联）
```markdown
# PRD · <产品/功能>
## 背景与问题
## 目标与成功标准
- 目标：...
- 成功标准（可度量）：...
## 范围
- 包含 / 不包含
## 用户故事
- 作为<角色>，我希望<能力>，以便<价值>。
## 验收要点
## 依赖与风险
## 开放问题
```

## 术语（GLOSSARY）纪律（指针）

- PRD 内**同一术语只用一种含义**；模糊 / 过载术语先消歧再写，保证 PRD 术语前后一致。
- 需要时在 `bmad-output/prd.md` 增设「术语」节，作为**产物 / 指针**；**术语表非票据真相**（不载实现细节、不进 `index.md` 票行）。
- 完整 glossary 纪律与 ADR 三条触发的**单一真源见 `bmad-architecture/SKILL.md`〈术语与 ADR 纪律〉**，此处不复述。

## 收尾
- 交付后提示 Lead 让 Themis 据此切 epic/story。
- 交付后按 `bmad-squad-protocol` 阶段门跑校验器（你按固定位置写对即可，并对照本节自检清单）。
