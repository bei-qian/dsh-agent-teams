# bmad-ux/reference — Sally 设计参照库（vendored 快照）

本目录是 BMad 小队 UX 设计师（Sally）的**品牌无关设计参照库**，按方案③「混合」从 `open-design` 原样快照（vendoring）而来。Sally 写 `design.md`（外观）与 `experience.md`（行为）时按需深读。

- **来源仓库**：`open-design`（本地只读 `./open-design`）
- **快照 commit**：`e033aad1d1` (`e033aad1d15a9d4084316e5223f2c6597fd32619`)
- **快照日期**：2026-11-21
- **许可**：顶层 Apache-2.0；`craft/` 正文改编自 MIT（refero_skill）。详见 [ATTRIBUTION.md](ATTRIBUTION.md)。
- **性质**：原样快照，**正文未改写**。

> **边界（避免双维护）**：实现层（CSS/WCAG/兼容）归 `modern-web-guidance`（Amelia 前端）；本库只保留**设计决策层**（五态总纲、accent 配额、CJK 行高、laws-of-ux、anti-ai-slop、token 契约、wireframe/prototype 参照）作为 Sally 的增量。

档位说明：**A 档** = 直接可复用（品牌无关、稳定）；**B 档** = 需挑选的参照（格式/颗粒度范例、蓝图）。

## 1. craft/（A 档，13 文件）

| vendored 文件 | 源路径 | 档 | 对应 Sally 环节 | 备注 |
|---|---|---|---|---|
| `craft/laws-of-ux.md` | `craft/laws-of-ux.md` | A | design.md 结构（界面编排：Hick/Fitts/Gestalt…） | 296 行，每条落到可执行动作 |
| `craft/state-coverage.md` | `craft/state-coverage.md` | A | design.md 状态（空/错/载入）+ experience.md 边界/失败态 | 五态总纲 + 阈值 + retry + ARIA，**最高价值** |
| `craft/accessibility-baseline.md` | `craft/accessibility-baseline.md` | A | experience.md 无障碍与一致性 | WCAG 2.2 AA 底线、触控 24×24、焦点 |
| `craft/typography.md` | `craft/typography.md` | A | design.md 视觉（排版） | 字号阶/行高/字距，**含 CJK 行高覆盖** |
| `craft/typography-hierarchy.md` | `craft/typography-hierarchy.md` | A | design.md 视觉（层级） | 层级契约：单一主入口、节奏 |
| `craft/typography-hierarchy-editorial.md` | `craft/typography-hierarchy-editorial.md` | A | design.md 视觉（编辑/长阅读型） | 编辑式层级变体 |
| `craft/color.md` | `craft/color.md` | A | design.md 视觉（配色） | 调色四层 + accent 每屏≤2 次纪律 |
| `craft/animation-discipline.md` | `craft/animation-discipline.md` | A | design.md 视觉 + experience.md 过渡/微交互 | 何时该动、时长阈值、curve vs spring |
| `craft/form-validation.md` | `craft/form-validation.md` | A | design.md 关键组件 + experience.md 边界/失败态 | 输入态机、校验时机、schema 契约 |
| `craft/anti-ai-slop.md` | `craft/anti-ai-slop.md` | A | design.md 视觉（质量门） | 「AI 味」七宗罪 + P0/P1 清单 |
| `craft/rtl-and-bidi.md` | `craft/rtl-and-bidi.md` | A | experience.md 一致性（本地化） | dir/lang、逻辑属性 |
| `craft/README.md` | `craft/README.md` | A(元) | 导航/说明 | 含 MIT refero_skill 归属段 |
| `craft/FUTURE_SECTIONS.md` | `craft/FUTURE_SECTIONS.md` | A(元) | 导航/说明 | 占位/前向引用清单 |

## 2. design-systems/_schema/（A 档，5 文件）

| vendored 文件 | 源路径 | 档 | 对应 Sally 环节 | 备注 |
|---|---|---|---|---|
| `design-systems/_schema/AGENTS.md` | `design-systems/_schema/AGENTS.md` | A | design.md 结构（token 模型） | A1/A2/B-slot/C-extension 四层模型 |
| `design-systems/_schema/manifest.schema.ts` | `design-systems/_schema/manifest.schema.ts` | A | design.md 结构（包契约） | v1 包结构：DESIGN.md + tokens.css + manifest.json |
| `design-systems/_schema/tokens.schema.ts` | `design-systems/_schema/tokens.schema.ts` | A | design.md 结构（token 契约） | **仅 re-export**（见下行），原样保留 |
| `design-systems/_schema/token-schema.ts` | `packages/contracts/src/design-systems/token-schema.ts` | A | design.md 结构（token 契约） | **真实实现**（tokens.schema.ts 只是 `export * from` 它，故一并收） |
| `design-systems/_schema/defaults.css` | `design-systems/_schema/defaults.css` | A | design.md 结构（A2 回退值） | token 回退 CSS |

## 3. design-systems/samples/（A 档，2 文件）

| vendored 文件 | 源路径 | 档 | 对应 Sally 环节 | 备注 |
|---|---|---|---|---|
| `design-systems/samples/DESIGN.sample.md` | `docs/examples/DESIGN.sample.md` | A | design.md 全篇写法（9 段式骨架） | 最干净官方样例（Warm Editorial，64 行） |
| `design-systems/samples/default-DESIGN.md` | `design-systems/default/DESIGN.md` | A | design.md 视觉/关键组件 | 极简 starter（Neutral Modern，62 行） |

## 4. design-systems/examples/（B 档，3 文件）

> ⚠️ **仅格式 / 颗粒度示例，数值不外溢到通用模板。** 以下为高完成度**品牌专属** DESIGN.md，仅用于示范「深度与颗粒度」，**不得照搬其中的具体数值/字体/OpenType 特性等品牌决策**到通用模板。

| vendored 文件 | 源路径 | 档 | 对应 Sally 环节 | 备注 |
|---|---|---|---|---|
| `design-systems/examples/linear-app-DESIGN.md` | `design-systems/linear-app/DESIGN.md` | B | design.md 视觉/关键组件（深度范例） | 370 行；Linear 品牌专属（weight 510、OpenType…）仅格式参考 |
| `design-systems/examples/notion-DESIGN.md` | `design-systems/notion/DESIGN.md` | B | design.md 视觉/关键组件（深度范例） | 312 行；仅格式/颗粒度参考 |
| `design-systems/examples/stripe-DESIGN.md` | `design-systems/stripe/DESIGN.md` | B | design.md 视觉/关键组件（深度范例） | 325 行；仅格式/颗粒度参考 |

## 5. templates/wireframes/（B 档，4 目录 × 2 文件）

| vendored 文件 | 源路径 | 档 | 对应 Sally 环节 | 备注 |
|---|---|---|---|---|
| `templates/wireframes/wireframe-annotated/{SKILL.md,example.html}` | `design-templates/wireframe-annotated/` | B | experience.md 主流程（分步）+ design.md 结构 | 红标注线框 + spec 面板，每 pin 一条 note |
| `templates/wireframes/wireframe-greybox/{SKILL.md,example.html}` | `design-templates/wireframe-greybox/` | B | experience.md 主流程（分步） | 低保真灰盒 |
| `templates/wireframes/wireframe-mobile-flow/{SKILL.md,example.html}` | `design-templates/wireframe-mobile-flow/` | B | experience.md 主流程（分步） | 3–4 屏手机流程 + 分步箭头 |
| `templates/wireframes/wireframe-sketch/{SKILL.md,example.html}` | `design-templates/wireframe-sketch/` | B | experience.md 主流程（分步） | 手绘草图风 |

## 6. templates/prototypes/（B 档，6 目录）

| vendored 文件 | 源路径 | 档 | 对应 Sally 环节 | 备注 |
|---|---|---|---|---|
| `templates/prototypes/web-prototype/{SKILL.md, example.html, references/layouts.md, references/checklist.md, assets/template.html}` | `design-templates/web-prototype/` | B | design.md 界面结构 + experience.md 主流程 | 8 个可粘贴 section + 自检 checklist |
| `templates/prototypes/saas-landing/{SKILL.md, example.html}` | `design-templates/saas-landing/` | B | design.md 界面结构 + experience.md 主流程 | 落地页蓝图 |
| `templates/prototypes/dashboard/{SKILL.md, example.html}` | `design-templates/dashboard/` | B | design.md 界面结构 + experience.md 状态 | 仪表盘蓝图 |
| `templates/prototypes/mobile-app/{SKILL.md, example.html, references/layouts.md, references/checklist.md, assets/template.html}` | `design-templates/mobile-app/` | B | design.md 界面结构 + experience.md 主流程 | 移动 App 蓝图 + layouts/checklist |
| `templates/prototypes/mobile-onboarding/{SKILL.md, example.html}` | `design-templates/mobile-onboarding/` | B | experience.md 主流程（引导流）+ 边界 | 引用 craft: state/animation/accessibility/form/laws |
| `templates/prototypes/pricing-page/{SKILL.md, example.html}` | `design-templates/pricing-page/` | B | design.md 界面结构（定价编排） | 定价页蓝图 |

## 省略资源记录

- **example.html / assets/ 省略**：本次所有 `example.html` 与 `assets/*`（含 `template.html`）均为**文本、单文件 < 80KB**，故**全部纳入**，无省略。
  - 最大 `example.html`：`wireframe-mobile-flow/example.html` 17,969 B；最大 `assets`：`web-prototype/assets/template.html` 16,603 B。均 < 80KB。
- **二进制 / 超大资源**：6 个 prototype 与 4 个 wireframe 目录内无二进制或超大资源需跳过。
- **C 档未纳入（整体排除）**：PPT/deck、视频/音频/图片模板、`prompt-templates/`、`plugins/`、产品源码（除点名 `token-schema.ts`）、产品 `docs/`（除点名 `DESIGN.sample.md`）、85 个 stub 技能。
- **范围裁剪**：品牌深度范例按任务要求取 3 个（linear-app / notion / stripe），未纳入 apple；其余 ~148 品牌包不收。

## 统计

- 文件总数：**51**（49 快照 + 本 README + ATTRIBUTION）。
- 体积：约 **540K**（`du -sh reference`）。
