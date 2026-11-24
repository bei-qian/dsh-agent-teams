---
name: bmad-tickets
description: Olympus Squad 票据流程（Themis）。把 initiative/PRD 切成 epic 与 story，维护 index.md 票据真相，按 bmad-squad-protocol 的固定目录落盘。
---
# 票据：epic / story（Themis）

## 何时用
需要从 PRD/简报建立或调整票据树时。

## 先读
- `bmad-output/initiative.md`、`bmad-output/prd.md`（若存在）
- `bmad-output/index.md`（当前票据真相）

## 步骤
1. 把举措切成若干 epic，每个 epic 写清目标与范围。
2. 每个 epic 切成可独立验收的 story（一个 story 一次能做完、能验证）。
3. 落盘：
   - `bmad-output/epics/epic-<nnn>.md`
   - `bmad-output/stories/story-<nnn>.md`
4. **更新 `bmad-output/index.md`**：新增/修改对应行，状态从 `todo` 起。

## story 模板（内联）
```markdown
# story-<nnn> · <标题>
## 验收标准
- ...
## 实现
（待填）
## 验证
（待填）
```

## index.md 契约（务必遵守）
表格列固定 `id | type | title | status | file`；`file` 相对 `bmad-output/` 且必须存在；状态 ∈ `todo|in_progress|in_review|done|blocked`。

## 收尾
- 交付后按 `bmad-squad-protocol` 阶段门跑校验器（你按固定位置写对即可，并对照本节自检清单）。
