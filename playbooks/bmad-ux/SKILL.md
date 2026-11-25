---
name: bmad-ux
description: Olympus Squad UX 流程（Ariadne）。产出 design.md（外观：9 段式 + token 契约）与 experience.md（行为：流程/状态/无障碍），内嵌五态/无障碍/反 AI 味硬 gate 勾选项，按 bmad-squad-protocol 的固定目录落盘。
---
# UX：外观与行为（Ariadne）

## 何时用
- 需要明确**界面长什么样**（`design.md`）或**交互怎么走**（`experience.md`）时。
- 为 story 补设计决策、状态与边界、无障碍底线，或给工程可实现的界面结构时。
- 不做技术架构、不写前端代码（除非负责人要可看小样）；设计决策层归本技能，实现层归 Hephaestus（见「边界」）。

## 先读
- `bmad-output/initiative.md`、`bmad-output/prd.md`（若存在）
- `bmad-output/index.md`
- 参照库索引：`dsh-olympus/playbooks/bmad-ux/reference/README.md`（下方路径均相对该 `reference/`）

## 步骤
1. 对齐用户与关键场景（谁、在什么情境、要完成什么）。
2. 写 `bmad-output/design.md`：套下方 **9 段式骨架**，颜色/排版/布局落成 **token 契约**，末尾勾选**状态覆盖**与**反 AI 味**两道硬 gate。
3. 写 `bmad-output/experience.md`：分步主流程 + 边界/失败态 + 无障碍；末尾勾选**状态覆盖**与**无障碍底线**两道硬 gate。
4. 对不确定的审美/方向，**列选项（≥2，含利弊）让 Lead 或用户拍板**，不擅自重设计。
5. 收尾按 `bmad-squad-protocol` 写对固定路径，并对照本技能自检清单核对。

## design.md 模板（9 段式 + token 契约）
复制下面骨架为 `bmad-output/design.md`（锚点为中文，可加英文对照；数值/品牌决策来自本项目，勿照搬样例品牌值）：

```markdown
# Design · <功能>

## 1. 视觉主题与氛围 Visual Theme & Atmosphere
一句话定基调（3–5 个形容词）+ 参照感。例：温暖、从容、杂志感；克制 chrome、留白优先。

## 2. 配色与角色 Color Palette & Roles
按**用途**命名 token（非色相），列出每色角色与用量：
- Background / Foreground / Accent(primary) / Accent(secondary) / Muted / Surface / Success / Warn / Danger
- 规则：accent 每屏 ≤2 次可见；不用纯黑纯白作背景。

## 3. 排版规则 Typography Rules
- Display / Body / Mono 字体栈（含 system fallback）
- 字号阶（px）：≤6–8 档，给全尺度
- 行高：body 与 display 分别给值；**CJK 标题行高 ≥1.3–1.4、CJK 正文 1.7–1.8，CJK 不加负字距**（详见 reference/craft/typography.md）
- 字距：ALL CAPS ≥0.06em；display（Latin）−0.01~−0.03em
- 行宽：正文 50–75 字符（≈65ch）

## 4. 组件样式 Component Stylings
按钮 / 卡片 / 输入 / 链接 等：半径、内距、填充/描边、focus 态。每类给可复用的具体值。

## 5. 布局原则 Layout Principles
栅格（列数/最大宽/间距）、section 垂直节奏（桌面/平板/手机三档）、内容对齐（顶对齐，不垂直居中）。

## 6. 层次与阴影 Depth & Elevation
只列必要层（如 Flat 0 / Raised 1），给 offset/blur/透明度；明说禁 neumorphism / glassmorphism。

## 7. 该做 / 不该做 Do's and Don'ts
✅ 3–4 条可执行正向；❌ 3–4 条明确禁止（与反 AI 味清单呼应）。

## 8. 响应式 Responsive Behavior
断点（如 Desktop ≥1024 / Tablet 640–1023 / Phone <640）+ 每档栅格、间距、hero 高度变化。

## 9. 给实现 agent 的提示 Agent Prompt Guide
3–6 条生成纪律（先排版与留白、accent 配额、颜色 token 不可臆造、section 数量上限等），供 Hephaestus 实现时遵循。

## 状态覆盖自查（五态硬 gate）
五态/WCAG 底线见 `reference/craft/state-coverage.md`。

## 反 AI 味质量门（硬 gate —— P0 必过）
依据 reference/craft/anti-ai-slop.md 逐项核对：
P0 七宗罪（必须修）：
- [ ] 不用 Tailwind 默认 indigo 作 accent（`#6366f1/#4f46e5/#4338ca/#3730a3/#8b5cf6/#7c3aed/#a855f7`），用 `--accent`
- [ ] hero 不用两段式「信任」渐变（紫→蓝 / 蓝→青 / indigo→粉）
- [ ] 不用 emoji 当功能图标（✨🚀🎯⚡🔥💡…），用 1.6–1.8px 描边单线 SVG + `currentColor`
- [ ] display 标题若种了 serif 就用 `--font-display`，不硬编码 Inter/Roboto/system-ui
- [ ] 不做「圆角卡片 + 左侧彩色描边」的 AI dashboard 瓷砖
- [ ] 不编造指标（10× faster / 99.9% uptime / 3×），用真实来源或标注占位
- [ ] 不用填充文案（lorem ipsum / feature one-two-three / sample content）
P1（应修）：
- [ ] 不套「Hero→Features→Pricing→FAQ→CTA」无变化模板，至少一个非常规 section
- [ ] 不用外部占位图 CDN（unsplash / placehold / picsum…）
- [ ] `:root` 外原始 hex ≤ ~12 个；`var(--accent)` 每屏 ≤2 次可见
P2（可修）：
- [ ] section 带 `data-od-id`；无装饰性 blob/wave；避免无视觉张力的对称布局
```

### token 契约字段（A1/A2/B-slot 四层模型）
结构契约见 `reference/design-systems/_schema/AGENTS.md`；样例见 `reference/design-systems/samples/DESIGN.sample.md`、`reference/design-systems/samples/default-DESIGN.md`。design.md 第 2/3/5 段的颜色/排版/布局要落成工程可消费的 token，并标归属：

| 层 | 谁决定 | 省略时 | 例 |
|---|---|---|---|
| **A1-identity** | 品牌 | 失败（缺即错） | `--bg --fg --accent --font-display` |
| **A1-structure** | 品牌 | 失败 | 字号阶、`--container-max`、`--section-y-*` |
| **A2** | 品牌（带 fallback） | 当前契约仍要求显式声明 | `--motion-fast --success --space-4 --font-mono` |
| **B-slot** | 品牌或 schema 建议 alias | 失败（须声明，可 alias） | `--fg-2 → var(--fg)`、`--surface-warm → var(--surface)` |

- **C-extension**：品牌私有、不属共享 schema 的 token（记入 `BRAND_EXTENSIONS`）。
- **何时不该新增 token**：① 组件内部值（直接 inline）② 一次性值（如某 hero 裁剪比）③ 投机性（「也许要 --motion-slow」，真用到再加）④ 已可表达（`color-mix(...)` 能算的 tint 先 inline，≥2 组件同值同 alpha 再提升）。
- 命名按用途不按色相（`--accent` 而非 `--blue-500`）。

## experience.md 模板（流程 + 状态 + 无障碍，内嵌硬 gate）
复制下面骨架为 `bmad-output/experience.md`：

```markdown
# Experience · <功能>

## 主流程（分步）
按用户任务分解为有编号的步骤/屏幕，标注每步的入口、动作、系统反馈、出口。低保证度可参照
`reference/templates/wireframes/*/SKILL.md`。

## 屏幕与状态
列出每个关键界面的状态矩阵（见下方五态硬 gate），并说明转场/跳转。

## 边界与失败态
异常输入、断网、超时、权限缺失、并发/重复提交等如何呈现与恢复；错误分级（字段/表单/区块/页面/应用）。

## 无障碍与一致性
键盘可达、焦点顺序、语义结构、文案一致性；底线见下方无障碍硬 gate。

## 平台约束与降级
逐条列出本功能里**会改变设计可行性**的平台事实，每条一行：
`交互 → 触屏行为 / 键盘行为 / 无 JS 时 / prefers-reduced-motion 时 → 依据篇目（playbooks/modern-web-guidance/guides/<category>/<slug>.md）`
例：`看板换列 → 触屏不给拖拽、走「移动到…」菜单；键盘 Alt+←/→；无 JS 时表单提交；减少动效时不做落位动画 → guides/ui-behaviors/drag-and-drop.md`。
这一段的结论归 UX；**具体写法归 Hephaestus，以 modern-web-guidance 原篇为准**，不在此重复。

## 状态覆盖自查（五态硬 gate）
五态/WCAG 底线见 `reference/craft/state-coverage.md`。

## 无障碍底线自查（WCAG 2.2 AA 硬 gate）
依据 reference/craft/accessibility-baseline.md（实现细节以 modern-web-guidance 为准，见「边界」）：
- [ ] 目标 **WCAG 2.2 AA** 作为工作上限 / 合规底线
- [ ] 对比度：正文 4.5:1；大字（≥18pt 常规≈24px 或 14pt 粗≈18.5px）3:1；非文本 UI/图形 3:1；焦点指示 3:1
- [ ] 触控目标 ≥ **24×24 CSS px**（AA，SC 2.5.8；44×44 是 AAA，不是 AA）
- [ ] 焦点可见：`:focus-visible`，禁止 `outline:none` 无替代
- [ ] 表单标签：每个输入有可见 `<label>`（placeholder 不能当标签）；错误用 `aria-describedby` + `aria-invalid` + `role="alert"`
- [ ] 键盘可达、无键盘陷阱、焦点顺序合阅读顺序；语义 landmark / heading 层级；`<html lang>`

## 原型交付硬 gate（P0，不过不算交付）
- [ ] **平台约束核对**：凡是原型里出现的交互，逐条写出「触屏 / 键盘 / 无 JS / `prefers-reduced-motion`」下的行为与降级，并标注依据篇目（`playbooks/modern-web-guidance/guides/<category>/<slug>.md`）；核对不了的写「未核对 + 原因」，**不得留空**。
- [ ] **静态可跑证据**：`node scripts/check_prototype.mjs <原型目录>` 退出 0（无外链、token 收敛、图标非 emoji、区域带 `data-od-id`、基线文本非空非 lorem）。
- [ ] **运行时证据（按需）**：有 Chrome 时 `node scripts/check_prototype.mjs <原型目录> --browser` 退出 0，且截图落在 `--out` 目录、console 无 error；无 Chrome 时输出 `SKIP` 并在交付说明里**原样写「SKIPPED（Chrome 缺失）」**——「没跑」与「跑了通过」不得混为一谈。
```

## 一次性逻辑 / 状态原型（回答逻辑 / 状态设计问题，结论留存）

有的设计问题不是「长什么样」，而是「这样流转 / 这个状态机 / 这段并发 / 这条数据流对不对」。这类**逻辑 / 状态**问题可用**一次性原型**快速回答，结论沉淀下来供后续引用；它**不是产品代码**，也**不是 UI 外观原型**。

**何时用**：要验证状态机 / 状态转移 / 并发竞态 / 数据流与不变量 / 边界分支等**逻辑正确性**或「状态模型是否顺手」，且纸面推演不够、直接上生产代码又太重时。

**形态（throwaway，用完即弃）**：
- 单文件脚本 / 伪代码 / 状态表 / 小状态机 demo 均可；**显式标注 throwaway / PROTOTYPE**。
- **不并入产品代码库、不写测试、不做生产级错误处理与抽象**——只为回答那一个问题。
- 临时原型文件放一次性位置（如 `/tmp/`，或 `bmad-output/` 下可清理目录），用完可删，不长留仓库主路径。

**结论留存为 primary source**：
- 原型跑完，把**结论**（问题 / 关键原型要点 / 得到的答案或决策 / 遗留不确定）写成 `bmad-output/` 下的**结论产物或指针**（如 `research/proto-<问题>.md`，或 architecture / design 文档对应小节）；后续**引用这份结论**，而不是反复重造原型。
- **结论非票据真相**：结论产物是证据 / 指针，**不新增第二真相源**；票据状态 / 范围 / 依赖仍只在 `index.md` / `initiative.md`，结论不承载票据状态字段。

**与 UX 原型模板去重（关键）**：
- **UI 外观原型**（长什么样、变体、页面级结构蓝图）仍归 `reference/templates/prototypes/*`（及 `templates/wireframes/*`）；本小节**不重复**定义任何 UI 变体 / 页面模板，**只补逻辑 / 状态这一未覆盖增量，用指针引用既有模板**。
- UI 原型的**交付硬 gate**（`check_prototype.mjs` 等，见上文〈原型交付硬 gate〉）只适用于**要交付的 UI 原型**；本节的一次性逻辑原型**用完即弃、不交付**，不走该 gate。

**何时不该做原型**：
- 问题已清楚、直接实现更快 → 别为原型而原型。
- 原型成本高于直接实现 / 直接读代码就能回答 → 直接做。
- 属于 **UI 外观**问题 → 走既有 UX 原型模板（`reference/templates/prototypes/*`），不用本节。
- 不把 throwaway 原型当交付代码留存：结论留下，原型本身可弃。

## 参照库按需深读（`reference/`）
**日常只用上面的清单**；遇到下列决策点再按需深读原篇，别整篇搬进产出（路径相对 `reference/`）：

| 何时深读 | 去处 |
|---|---|
| 一屏放几个选项、主次编排、分组/节奏/进度感等**编排决策** | `craft/laws-of-ux.md` |
| 字号阶、行高、字距，尤其 **CJK 行高/负字距覆盖**（中文标题 1.3–1.4、正文 1.7–1.8） | `craft/typography.md`、`craft/typography-hierarchy.md`、`craft/typography-hierarchy-editorial.md` |
| 四层调色结构、**accent 每屏 ≤2 次**纪律、暗色主题（对比度数值以实现层为准） | `craft/color.md` |
| 该不该动、时长阈值（默认 150ms）、curve vs spring、reduced-motion | `craft/animation-discipline.md` |
| 输入状态机、校验时机（on blur）、schema 契约 | `craft/form-validation.md` |
| RTL / 双向文本、逻辑属性、`<html dir lang>` | `craft/rtl-and-bidi.md` |
| 需要低保真**分步流程 / 红标注 spec**（greybox、annotated、mobile-flow、sketch） | `templates/wireframes/{wireframe-annotated,wireframe-greybox,wireframe-mobile-flow,wireframe-sketch}/SKILL.md` |
| 需要页面级**结构蓝图 / 可粘贴 section**（landing、dashboard、mobile、onboarding、pricing、web） | `templates/prototypes/{web-prototype,dashboard,mobile-app,mobile-onboarding,saas-landing,pricing-page}/SKILL.md` |
| token 四层模型与包结构契约、9 段式样例 | `design-systems/_schema/AGENTS.md`、`design-systems/samples/DESIGN.sample.md`、`design-systems/samples/default-DESIGN.md` |
| 平台能力 / 交互实现期待（触屏拖拽、dialog 与 top-layer、scroll-snap、焦点可见、系统文字缩放、表单校验时机、响应式断点、`color-mix`/`forced-colors` 支持边界） | `playbooks/bmad-ux/platform-constraints.md`（**只索引**）→ 正文在 `modern-web-guidance` 的 `guides/ui-behaviors/`、`guides/ui-components/`、`guides/forms/`、`guides/css/`、`guides/accessibility/`、`guides/visual-design/` |

## 与 modern-web-guidance 的边界（重叠处只维护一处）
- **设计决策层 = Ariadne（本技能 + `reference/craft`）**：该不该、做几个、何时做——五态总纲、accent 配额、CJK 行高、laws-of-ux、anti-ai-slop、token 契约、wireframe/prototype 参照。
- **实现层 = Hephaestus（`modern-web-guidance`）**：具体 HTML/CSS/JS、WCAG SC 实现、`color-mix`、forced-colors、reduced-motion 实现、浏览器兼容。
- **重叠处只维护一处**：对比度数值、触控尺寸、WCAG 条款、reduced-motion 等——**实现细节以 `modern-web-guidance` 为准**；本技能清单只保留一句「设计验收底线」，不复制其实现规则；发现重复即删本技能份、链回 `modern-web-guidance`，避免双维护。
- **平台能力事实 = Ariadne（第 1 层，本技能也吃）**：会改变「能不能这么设计」的硬约束与降级路径（触屏拖拽是否可靠、`<dialog>`/top-layer/`inert`/`popover` 可用性、`scroll-snap`、`:focus-visible`、`prefers-reduced-motion`、触摸目标、`color-mix`/`forced-colors` 的支持边界）**归本技能核对**，但只把**结论 + 依据篇目**写进 `experience.md` 的「平台约束与降级」段；**正文一律以 `playbooks/modern-web-guidance/guides/<category>/<slug>.md` 为准，不复制**。定位用 `playbooks/bmad-ux/platform-constraints.md`（只索引）。
- **第 2 层（实现规则）仍不是本技能**：具体 HTML/CSS/JS、CSS 架构、性能、安全、兼容细节归 Hephaestus（`bmad-build`）。凡「同一句话在两边都写」的地方，删本技能那份、链回 `modern-web-guidance`。

## 收尾
- 产出固定写 `bmad-output/design.md` 与 `bmad-output/experience.md`（见 `bmad-squad-protocol`）。
- 交付后按 `bmad-squad-protocol` 阶段门跑校验器（退出码 0 才过）；你按固定位置写对，并对照本节硬 gate 与验收标准自检。
