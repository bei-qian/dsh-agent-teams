---
name: bmad-prd
description: BMad 小队 PRD 流程（John）。把已确认的想法/调研写成结构化 PRD，按 bmad-squad-protocol 的固定目录落盘。
---
# PRD（John）

## 何时用
想法已成形、需要一份团队可据此实现的 PRD 时。

## 先读
- `bmad-output/initiative.md`
- `bmad-output/research/`（若 Mary 已调研）
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

## 收尾
- 交付后提示 Lead 让 Sofia 据此切 epic/story。
- 交付后由 Lead 跑校验器做 Gate（你按 `bmad-squad-protocol` 的固定位置写对即可，并对照本节自检清单）。
