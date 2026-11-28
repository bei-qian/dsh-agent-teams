---
name: bmad-tickets
description: Olympus Squad 票据流程（Themis）。把 initiative/PRD 切成 epic 与 story，维护 index.md 票据真相，按 bmad-squad-protocol 的固定目录落盘。当要把 initiative/PRD 切成 epic 与 story、维护 index.md 票据真相时使用（Use when…）。
---
# 票据：epic / story（Themis）

## 何时用
需要从 PRD/简报建立或调整票据树时。

## 先读
- `bmad-output/initiative.md`、`bmad-output/prd.md`（若存在）
- `bmad-output/index.md`（当前票据真相）

## 步骤
1. 把举措切成若干 epic，每个 epic 写清目标与范围。
2. 每个 epic 切成**可独立验收**的 story（一个 story 一次能做完、能验证）。切片优先走「纵切片」，见下节「纵切片规则」。
3. 给每个 story 标出**阻塞边**（它依赖哪些 story），落进 story 的「前置 / blocked_by」字段，见下节「阻塞边 → 依赖字段」。
4. 落盘：
   - `bmad-output/epics/epic-<nnn>.md`
   - `bmad-output/stories/story-<nnn>.md`
5. **更新 `bmad-output/index.md`**：新增/修改对应行，状态从 `todo` 起。

## 纵切片规则（tracer-bullet）

> 定位：这是**票据层**的切片判据（怎么把工作切成一张能独立验收的 story）。调度层的依赖图 / writeScopes / 宽改执行序列归 `cap-task-coordination`，此处只引用、不重复。

一张合格的 story 是**纵切片（tracer bullet，一条贯穿到底的薄路径）**，须同时满足三条可复核判据：

1. **贯穿各层、端到端一条薄路径**：一张 story 从最外层（界面 / 入口 / 调用方）切到最内层（数据 / 存储 / 契约），把一条真实路径打通；而不是只改一层（如「先把数据库表都建好」「先把所有 API 定义写完」这类**横切片**，要等别的层才能验收）。
2. **可独立验收**：这张 story 单独完成即可 demo 或用一条确定性命令验证其行为，不依赖「下一张 story 做完才能看出对不对」。验收点是**可观察的行为**，不是「代码写完了」。
3. **单窗口可完成**：规模控制在一个干净上下文窗口内能做完、能自检的范围；一张 story 一个明确产出面，不塞多个不相关的改动。

**先做「让改动变容易」的前置**：若某段重构能让后续切片明显更简单（如先补一个可注入的接缝、先抽掉一处硬耦合），把它作为**第一张** story 先行落地；前置做完再切业务切片。

**宽改是纵切片的例外**：一次机械改（改列名 / 换共享符号类型）的爆炸半径横跨全仓、没有一条纵切片能单独跑绿时，不要硬切成纵切片，改走 **expand→migrate→contract** 序列；该序列的细则只在 `cap-task-coordination/references/decomposition.md` 定义（单一真源），本 playbook 只指向它。

### 何时**不**切（避免过度分解）

不是所有工作都要切纵切片。命中以下情形，**保持单张 story、不强行纵切**：

- **极小的单文件任务**：一处 typo、单文件文案、一次性重命名、几行的孤立修正——切多片只会让协调开销大于收益（委派 ROI < 1）。
- **没有跨层路径可切**：纯文档 / 纯配置这类本就单层的改动，没有「贯穿各层」可谈，按单张处理。
- **切完每片都不可独立验收**：若硬切出来的每片都必须等其它片才能验证，那不是纵切片，是有序的横切片——要么合并回一张，要么重新找一条能端到端跑通的薄路径。

判据：**若一张 story 已经「单窗口能做完 + 一条命令能验收」，就到此为止，不要再切。**

## 阻塞边 → 依赖字段

- 每张 story 明确「哪些 story 必须先完成」，这些**阻塞边**统一写进 story 的 **`前置 / blocked_by`** 字段（无前置写 `无` 并注明「可立即开工」）；字段为空等价于无前置、可立即开工。
- **不引入外部 tracker、不新增第二真相源**：依赖关系只落在这个字段 + `index.md` 票据行里，不另建依赖清单文件、不同步到外部 issue 系统。依赖图由这些字段派生（`cap-task-coordination/scripts/check_dag.mjs` 可校验无环）。
- **取 frontier 派活**：所有前置都 `done` 的 story 即为「就绪前沿」，可开工；纯线性链就是从前往后逐张做。
- 若 story 模板/现有票据已用「前置 / blocked_by」表达依赖，**复用它**，不另造「依赖」重复字段。

## story 模板（内联）
```markdown
# story-<nnn> · <标题>
- **前置 / blocked_by**: 无（可立即开工） | story-<mmm>, ...
## 验收标准
- ...
- <涉及移除/隐藏某既有用户可见元素的可断言 AC>
  用户授权：「<用户原话引用>」（<轮次/日期>）
## 实现
（待填）
## 验证
（待填）
```

> 模板约定：`前置 / blocked_by` 表达阻塞边（无前置即「可立即开工」）；「验收标准」每条尽量可确定性断言；「实现 / 验证」收尾时回填命令与结果。字段名沿用现有票据约定（story-036 等已用「前置 / blocked_by」），不要另起重复字段。

> 模板约定（续）：AC 或实现涉及**移除 / 隐藏 / 降级既有用户可见元素**时，该条 AC 必须紧跟一行 `用户授权：<用户原话引用>`（原话加引号，注明轮次/日期）。缺这一行即视为未获授权，由 `scripts/squad_validate.mjs` 判定不合规。授权原话由 Lead 在向用户确认时取得，Themis 不得代写、不得事后补写一段并不存在的原话。

## index.md 契约（务必遵守）
表格列固定 `id | type | title | status | file`；`file` 相对 `bmad-output/` 且必须存在；状态 ∈ `todo|in_progress|in_review|done|blocked`。

## 收尾
- 交付后按 `bmad-squad-protocol` 阶段门跑校验器（你按固定位置写对即可，并对照本节自检清单）。
