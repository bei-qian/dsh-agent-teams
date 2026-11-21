---
name: bmad-squad-protocol
description: BMad 小队的零依赖运行协议：固定 bmad-output/ 目录、index.md 票据真相、squad_validate 确定性校验。Lead 与成员开工/收尾时加载。
---
# BMad 小队 · 零依赖运行协议

这是「零依赖版」小队的纪律基线。不依赖 `_bmad/`、不依赖 Python/uv，但用**固定目录 + 索引文件 + 校验器**保证确定性。所有成员与负责人每次开工、收尾都遵守。

## 输出目录（固定契约）

小队的一切产出都写到当前工作区的 `bmad-output/` 下，路径固定、不得自创：

```
bmad-output/
  initiative.md        # 唯一真相：举措目标/范围/开放问题（Lead 维护）
  index.md             # 唯一真相：票据清单（Lead 维护）
  research/            # Mary：调研笔记、brief
  prd.md               # John：PRD
  architecture.md      # Winston：架构 + ADR 摘要
  design.md            # Sally：设计
  experience.md        # Sally：体验/行为
  epics/epic-*.md      # Sofia：epic
  stories/story-*.md   # Sofia：story
  tasks/task-*.md      # 可选：拆到 task
```

## index.md 格式（票据真相）

Markdown 表格，列顺序固定 `id | type | title | status | file`：

```
| id | type | title | status | file |
|---|---|---|---|---|
| epic-001 | epic | 周报自动汇总 | in_progress | epics/epic-001.md |
| story-001 | story | 收集来源数据 | done | stories/story-001.md |
```

- `type` ∈ `epic|story|task`；`status` ∈ `todo|in_progress|in_review|done|blocked`。
- `file` 相对 `bmad-output/`，必须真实存在。
- 任何票据状态变化，**改 index.md 的那一行**，不要新建第二份索引。

## 阶段门（Gate，强制）

每完成一个阶段、或把一个 story 置为 `done` 之前，**必须**跑校验器并让它通过：

```
node <本技能目录>/../../scripts/squad_validate.mjs ./bmad-output
```

（加载本技能时 DSH 会给出该 SKILL.md 的真实路径；校验器就在插件 `scripts/squad_validate.mjs`，即本技能目录的上两级 `../../scripts/`。）

- 退出码 0 = 通过，可以继续/收尾；
- 退出码 1 = 有硬错误（缺文件、重复 id、非法状态、index 指向不存在的文件），**修好再跑**，不得跳过；
- 警告（如 story 标 done 但缺「验收标准/实现/验证」）不阻断，但应在收尾前补齐。

## 规则

1. **先读后写**：开工先读 `initiative.md` 与 `index.md`；只处理自己票据范围内的文件。
2. **改状态走索引**：完成后更新 `index.md` 对应行（成员可改自己票据的行；派活/重排由 Lead 改）。
3. **不自创路径**：产出只写进上面的固定位置；需要新目录先与 Lead 确认。
4. **交付前跑 Gate**：见上；不通过不算完成。
5. **Lead 收尾**：整队目标达成时，Lead 跑一次校验并确保 0 警告，再向用户交付「可评审」。
