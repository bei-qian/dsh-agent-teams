---
name: modern-web-guidance
description: Modern Web 前端最佳实践参照（HTML/CSS/客户端 JS）：做前端实现前先按分类到 guides/<category>/<slug>.md 查相关篇目。
---
# Modern Web Guidance（前端最佳实践参照）

本技能是一套**零依赖、纯 markdown** 的现代 Web 前端最佳实践库（源自 GoogleChrome/modern-web-guidance 的已展开干净稿）。做 **HTML / CSS / 客户端 JS** 前端任务（组件、布局、动画、交互、表单、性能、可访问性、安全前端侧等）时，**先按分类到本技能 `guides/<category>/<slug>.md` 查阅相关篇目，再动手实现**，避免用过时或被训练权重固化的旧写法。

## 怎么用
1. 判断任务落在哪个分类（见下方索引），进入 `guides/<category>/`。
2. 按 slug 找到最相关的一篇（例如 `guides/css/style-parent-with-has.md`、`guides/ui-components/dialog.md`、`guides/forms/autofill-sign-in-form.md`）。分类目录里若有同名总览篇（如 `css/css.md`、`forms/forms.md`、`performance/performance.md`），先读总览再读具体篇。
3. 对照指南里的「The Problem / The Solution / Implementation Guide / Fallbacks」在实现中落地，并注意其浏览器兼容与回退要求。

## 分类索引（`guides/<category>/`）
| category | 篇数 | 主题 |
|---|---|---|
| `accessibility` | 4 | 无障碍：错误播报、生成内容、尊重系统文字缩放 |
| `built-in-ai` | 4 | 浏览器内置 AI：语言检测/模型、摘要、翻译 |
| `css` | 18 | CSS 布局、动画、响应式、条件样式、`:has()`、容器查询等 |
| `forms` | 19 | 表单与输入控件：自动填充、校验、选择器、滑块、OTP 等 |
| `html` | 8 | HTML、Web Components、Shadow DOM、自定义元素 |
| `js` | 6 | 客户端 JS：事件、时间戳、全局日历系统 |
| `performance` | 26 | Core Web Vitals（LCP/INP/CLS）、图片/脚本/资源加载与调度 |
| `privacy` | 1 | 隐私 |
| `pwa` | 2 | 可安装 Web App、离线加载与更新 |
| `security` | 17 | 前端安全：passkeys、HTML 净化、Trusted Types、来源校验等 |
| `ui-atoms` | 13 | 原子 UI：图标、tooltip、滚动提示、粘性头部等 |
| `ui-behaviors` | 40 | 交互行为：过渡、拖拽、滚动效果、客户端路由等 |
| `ui-components` | 23 | 组件：dialog、tabs、accordion、data grid、菜单等 |
| `user-experience` | 3 | 用户体验：form factor 适配、偏好感知、引导 |
| `visual-design` | 22 | 视觉设计：颜色、排版、暗色模式、形状、纹理等 |
| `wasm` | 1 | WebAssembly（C++ on the web） |
| `webmcp` | 3 | WebMCP：agentic forms、agentic JS tools |

共 210 篇，均为已展开的干净 markdown（无宏、无构建步骤）。

## 边界（不适用）
- **不适用于后端**：SQL、ORM、API routes、服务端业务逻辑等，请勿查本技能。
- **不适用于 infra / 工具链**：CI/CD、Docker、Actions、部署脚本（Python/Go/Git）等。
- 也不是用来生成或管理前端工具配置（Vite、tsconfig、ESLint 等）的资料。
