# Changelog

## Unreleased (0.1.x)

- 成员独立选模型：7 个 `delegate_*` 工具开启 `modelSelection`，并在 `delegate-analyst` 上开启 `modelDiscovery`（每 scope 仅一个实例，注册 `list_subagent_models`）。调度可在委派时按成员传 `provider` / `model` / `reasoning_effort`，不传则跟随会话当前模型；需要给某成员固定默认模型时，在该 `delegate_*` 行加 `agentOptions`。DSH 的 preset 本身不声明模型，成员模型统一走 `dsh-tool-subagent`。`scripts/verify.py` 增加对应校验（7 个 modelSelection、1 个 modelDiscovery）。
- 选择器只留「调度」：新增浏览器半边 `client.js`（`dsh.client` + `./client` 导出），在客户端包装 `remote.agentPresets.list()`，把 7 个 BMad 成员预设从「新建会话预设选择器」与「设置 → Agent 预设」中过滤掉，仅保留 `bmad-squad-lead`（及所有非 BMad 预设）。Host 端 8 个预设仍全部注册，`delegate_*` 委派不受影响。为让 `@deepseek-ai/dsh-client-modules` 发现 `dsh.client`，新增裸包名宿主行 `agent-teams`（`index.js` 为 no-op）与 `package.json` 的 `"."`/`"./client"` 导出。
- 预设选择器去噪：7 个成员预设改名为「〔内部成员〕…」并在描述标注「仅供『BMad 小队 · 调度』内部委派，请勿直接选择」；负责人描述改为「日常只需选这一个，它会自动把工作分派给下面各成员」。作为客户端过滤未生效时的兜底（成员必须保留供 `delegate_*` 按 id 调用）。
- 修复 Plugins 列表显示：8 个预设行不再统一显示 `@deepseek-ai/dsh-agent-preset` 的模块文案（「Agent 预设定义 / 声明一个 Agent 预设及其使用的插件组合。」）。每个预设改挂自己的薄模块 `dsh-agent-teams/rows/<role>`（re-export `@deepseek-ai/dsh-agent-preset`），并随行提供 `locale/en|zh.json` 与图标（各角色共用同一小队图标），列表与详情因此显示各自的角色名与说明（如「〔内部成员〕BMad · Mary 业务分析师」）。`package.json` 增加 `./rows/*` 导出与 `@deepseek-ai/dsh-agent-preset` peer 依赖，`scripts/verify.py` 增加对应校验。
- 评审后硬化与一致性：`client.js` 改为显式 7 个成员 id 集合（不再用 `bmad-` 前缀，避免误伤未来非成员 `bmad-*` 预设）、`defineProperty` 包 try/catch 且仅包装可配置自有属性、二次 `apply` 幂等、仅在包装仍生效时还原、形状异常一次性告警、补 `isDefault` 兜底；8 份 `rows/*/locale/{en,zh}.json` 文案与预设口径对齐（含「内部成员 / 请勿直接选择」）；`@deepseek-ai/dsh-agent-preset` 由可选 peer 改为非可选并钉 `^0.2.2-rc.5`（rows 硬 import 它）；`verify.py` 增补 client 半边装配断言、每行 title 精确比对 / description 非空 / 标题去重、`node --check client.js`。
- 零依赖 playbook 版：新增 `playbooks/`（协议 + 7 角色自包含技能），成员预设改扫 `playbooks/`（`includeDefaultRoots:false`）；完整 BMad 技能保留在 `skills/` 但不再启用。
- 确定性校验器 `scripts/squad_validate.mjs`（Node，零依赖）+ `examples/bmad-output/` 示例；阶段门由 Lead 执行。
- Lead 预设加 shell 以运行校验器；`scripts/verify.py` 与 CI 覆盖 playbook 与校验器。
- 修复：为 7 个成员预设补齐 `tool-fs-search.sampleOverCapGlobResults: false` 与 `tool-todo.allowParallelInProgress: true` 必填配置（与 Lead 预设一致），解决新版 DSH 下 `delegate_*` 因成员预设配置校验失败而无法拉起队员的问题；`cordis.patch.yml` 已按模板重新生成。

## 0.1.0 — 2026-11-21

- 初始版本：BMad 小队（1 名负责人 + 7 名 BMad 专家）作为 DSH agent 预设，构建在内置 Agent Teams 之上。
- 负责人用「一成员一个 `delegate_*` 工具」做零代码点名委派；成员共享任务板。
- 随包携带 BMad 技能（core-tools / method / tea，MIT），安装本插件即无需单独安装 BMad 技能。
- 显示元数据（locale en/zh、icon）；配置型 bundle，无 Host 代码。
