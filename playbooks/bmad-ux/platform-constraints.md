# 平台约束索引（UX 第 1 层）

> **正文以 `modern-web-guidance` 为准。** 本文件只回答「该看哪一篇」，不复制任何实现规则；发现与本表重复的正文，删本文件份、链回原篇（避免双维护）。
> 路径均相对 `playbooks/modern-web-guidance/`，随包分发（扁平 `.md`，17 分类 / 210 篇，见其 `SKILL.md:14-35`）。

| 设计时的问题（会改变「能不能这么设计」） | 该看哪一篇 |
|---|---|
| 触屏上能不能拖拽换列/换位；拖拽的取消、落点提示、动效降级 | `guides/ui-behaviors/drag-and-drop.md`、`guides/ui-behaviors/drag.md` |
| 模态/非模态弹层、top-layer、`inert`、声明式开关、点遮罩关闭 | `guides/ui-behaviors/declarative-dialog-popover-control.md`、`guides/ui-behaviors/light-dismiss-a-dialog.md` |
| 轮播/横向卡片轨道用 `scroll-snap`，以及滑动中的视觉高亮 | `guides/ui-behaviors/carousel-snap-highlights.md` |
| 表单什么时候报错、错误怎么被读屏播报 | `guides/forms/validate-input-after-interaction.md`、`guides/accessibility/accessible-error-announcement.md` |
| 断点、窄屏重排、触控目标在真实小屏上的可行性 | `guides/css/responsive-design.md` |
| 系统字号放大时布局会不会崩（`rem` 化、可增长容器） | `guides/accessibility/respect-os-text-scale.md` |
| 键盘可达与焦点可见（`:focus-visible`）底线 | `guides/accessibility/accessibility.md`（总览） |
| `color-mix()` / forced-colors 下的配色边界 | `guides/visual-design/color.md` |

**用法**：写 `experience.md` 的「平台约束与降级」段时，一行一个问题、一行一个篇目；**不要**把篇目里的代码抄进来。

> 维护：`modern-web-guidance` 快照刷新时，顺手 `ls` 一遍上表 9 条篇目路径是否仍存在。
