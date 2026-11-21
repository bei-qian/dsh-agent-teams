---
name: bmad-ux
description: BMad 小队 UX 流程（Sally）。产出 design.md（外观）与 experience.md（行为），按 bmad-squad-protocol 的固定目录落盘。
---
# UX：外观与行为（Sally）

## 何时用
需要明确界面长什么样、交互怎么走时。

## 先读
- `bmad-output/initiative.md`、`bmad-output/prd.md`（若存在）
- `bmad-output/index.md`

## 步骤
1. 对齐用户与关键场景。
2. 写 `bmad-output/design.md`（结构与外观）；写 `bmad-output/experience.md`（流程、状态、边界）。
3. 对不确定的审美/方向，列选项让 Lead 或用户拍板，不擅自重设计。

## design.md 模板（内联）
```markdown
# Design · <功能>
## 界面结构
## 关键组件
## 视觉与状态（含空/错/载入）
```
## experience.md 模板（内联）
```markdown
# Experience · <功能>
## 主流程（分步）
## 边界与失败态
## 无障碍与一致性
```

## 收尾
- 交付后由 Lead 跑校验器做 Gate（你按 `bmad-squad-protocol` 的固定位置写对即可，并对照本节自检清单）。
