# Changelog

## 0.1.1 — 2026-11-22

- 安全 / 非功能约束硬化（仅 playbook 层，不涉及 DSH 内核）：`bmad-architecture` 新增「安全与非功能风险分析」（信任边界 / 认证授权 / 密钥与凭据 / 密码学原语 / 防账号枚举 / 时序与侧信道），要求每条安全决策落成可测试约束并标注验收方式；`bmad-build` 要求实现前逐条通读架构安全 ADR 并补确定性回归测试（失败路径一致性 / 配置与输入边界 / 启动期不变量）；`bmad-squad-protocol` 要求 Lead 把安全约束逐条转写为可测验收标准、用确定性证据过阶段门、无法覆盖的标残余风险；`bmad-test-strategy` 要求主动覆盖冷启动 / 配置边界 / 安全负路径 / 启动期不变量。另 `ROADMAP.md` 新增 R4「轻量 per-role 工作记忆」候选（仅待调研，无实现）。版本保持 0.1.1；`scripts/verify.py` 通过。

- 委派命名可辨识：`prompts/squad-lead.md` 的 Roster 为 7 名成员标注子代理代号（`mary-n` / `john-n` / …），运行协议第 4 步要求每次 `delegate_*` 必须传 `name`（`<代号>-<序号>`，序号按本会话该队员出现次数递增、首次为 1；不确定先 `list_agents` 查已用名再取下一个未占用序号），不再因省略 `name` 而落到 `agent-1` / `agent-2`，使「编队 / Agent 网络」面板显示真实队员名。同时 7 个成员 prompt 各加一条同口径的「派生命名」约定（成员当前无委派 / 子代理工具，属前瞻性约定；成员在编队的显示名本就由 Lead 委派时传入的 `name` 决定）。只改小队 prompt（真相源）并重建 `cordis.patch.yml`，**不涉及 DSH 内核**；`scripts/verify.py` 通过。

- 新增「从 GitHub 下载安装到 DSH」说明：`SETUP.md` 给出面向外部用户的完整流程（前置条件；`git clone` / ZIP 获取；Web「选择本地目录」与 `plugin_manager` 的 `install_bundle` 两种安装方式；成功标志；首次使用；更新；卸载；常见问题），并明确 DSH 只支持「本地目录」安装、无 git URL 直装、link 安装不可删移目录；同时把原「开发者改模板后重建（`build_patch.py`）」单列为开发者章节，与外部用户安装区分；`README.md` 增加安装入口指向该章节。

- 新增零依赖 playbook `playbooks/modern-web-guidance/`：把 Modern Web Guidance 作为**纯 markdown 前端最佳实践参照**（210 篇已展开的干净 guides，17 个分类，`guides/<category>/<slug>.md`）随包携带，做 HTML/CSS/客户端 JS 时按分类查阅；**不引入 Node/Python 运行时、不长期 npx**（如 macro 展开、源仓库、构建均在获取阶段完成，产物仅为本地 .md）。由 `playbooks/bmad-build/SKILL.md` 与 `prompts/dev.md` 各加一句「前端实现前先按分类查 modern-web-guidance 技能」接入。`scripts/verify.py` 新增对应正向校验（SKILL.md 存在、`guides/` 非空、零依赖）并同步期望版本到 `0.1.1`。正文中上游遗留的 `npx -y modern-web-guidance@latest retrieve "ID"` 交叉引用已确定性本地化为 `(local: \`guides/<category>/<id>.md\`)` 本地文件指针（208 处 / 67 文件 / 106 个 id，全部可解析、0 broken），**交叉引用已本地化，无 npx**。

- 升级 `playbooks/bmad-ux/`（Sally 设计流程）：`bmad-ux/SKILL.md` 引入 design.md 9 段式骨架 + token 契约，experience.md/design.md 内嵌五态 / 无障碍 / 反 AI 味硬 gate；并按「混合」vendoring 设计参照库 `playbooks/bmad-ux/reference/`（open-design 品牌无关 craft 11 篇 + design-systems `_schema` + wireframe/prototype 蓝图；顶层 Apache-2.0、craft 正文 MIT 归属已保留）。

- 升级 `playbooks/bmad-build/` 后端开发规范：vendoring `playbooks/bmad-build/reference/`（`iluwatar/java-design-patterns` 精选 43 篇后端模式 README，按 架构/并发/数据访问/韧性/集成/消息/GoF 分类，MIT，快照 commit `4cabb204f`）；`bmad-build/SKILL.md` 新增「后端设计规范（取自 java-design-patterns 精选）」（原则层 / 何时该用·何时别用决策表 43 条 / 反模式警戒 / Java 示例栈仅示例非强制 / 与架构层边界）；`playbooks/bmad-architecture/SKILL.md` 新增「模式选型」交叉引用（选型归架构、落地归开发、只维护一处）。

## 0.1.0 — 2026-11-21

- 项目级 `AGENTS.md` 能力（本次新增）：新增零依赖 playbook `playbooks/bmad-project-context/`（`setup` / `adopt` / `refresh` / `record` / `audit`，受管 `<!-- bmad:context -->` block + provenance；去掉 `_bmad`/uv 依赖、`{output_folder}`→`bmad-output/`）；`bmad-squad-protocol` 增加「第 0 步 · AGENTS.md」条件触发（无/空/无受管 block→建/吸收，已有受管 block→按需 refresh/audit，不静默跳过）；architect 执行、Lead 中介访谈与写前批准、`AGENTS.md` 置项目根为唯一写入例外、`writeScopes=[AGENTS.md]`、不 commit；`prompts/architect.md`、`prompts/squad-lead.md` 增补能力与路由话术；`scripts/verify.py` 增补 playbook 存在性/零依赖断言并修正过时 docstring；真机走查（`squad-lab` setup）通过。
- Agent Teams 开关改为「**跟着预设走，但不覆盖手动选择**」：**进入**团队预设（`TEAM_PRESETS`，默认 `['bmad-squad-lead']`，可用 Loader 行 `config.teamPresets` 覆盖）→强制开；**离开**团队预设回到非团队预设→恢复进入前的非团队选择（原先关→关、原先开→开）；**非团队预设之间切换**→保持当前开关不动（手动开着就一直开）。实现：Host 半边按会话记住「上一个已知预设」，在进入团队预设时用 `agentTeams.isEnabled(agent)` 捕获当时的实际值作为「非团队偏好」，离开时还原；`agent-preset/selected` 只带新预设、且此刻 `presetForSession` 可能已是新值，故自维护映射，未知历史的安全默认是不擅自翻转。触发点：`agent/created`（新建/clear 且为团队预设→开）、`agent-preset/selected`（按上述转移规则）、插件启用时仅对**空白**根会话补开团队预设（不擅自动非团队会话的手动状态）。沿用 `setTimeout(0)` 延后避开 `Session.append` 重入，事件均做兜底，`setEnabled` 交给服务端幂等。`scripts/test_host.mjs` 覆盖：S1–S5 矩阵（非团队开/关↔团队往返、非团队↔非团队保持、团队↔团队）/ 新建与 clear 开 / resume·compact 与子代理不动 / 启用巡检只补开空白 / `config.teamPresets` 覆盖与还原 / 异常兜底。
- 早期迭代（已并入上条）：曾实现「切到调度预设自动开 Team」与「切预设无条件重置为该预设默认（其它预设一律关）」。后者会误关用户在非团队预设里手动开的 Team，且从团队切回非团队时无法还原原本偏好，已由上面的「按会话记忆非团队偏好」方案取代。

- 成员独立选模型：7 个 `delegate_*` 工具开启 `modelSelection`，并在 `delegate-analyst` 上开启 `modelDiscovery`（每 scope 仅一个实例，注册 `list_subagent_models`）。调度可在委派时按成员传 `provider` / `model` / `reasoning_effort`，不传则跟随会话当前模型；需要给某成员固定默认模型时，在该 `delegate_*` 行加 `agentOptions`。DSH 的 preset 本身不声明模型，成员模型统一走 `dsh-tool-subagent`。`scripts/verify.py` 增加对应校验（7 个 modelSelection、1 个 modelDiscovery）。
- 选择器只留「调度」：新增浏览器半边 `client.js`（`dsh.client` + `./client` 导出），在客户端包装 `remote.agentPresets.list()`，把 7 个 BMad 成员预设从「新建会话预设选择器」与「设置 → Agent 预设」中过滤掉，仅保留 `bmad-squad-lead`（及所有非 BMad 预设）。Host 端 8 个预设仍全部注册，`delegate_*` 委派不受影响。为让 `@deepseek-ai/dsh-client-modules` 发现 `dsh.client`，新增裸包名宿主行 `agent-teams`（`index.js` 为 no-op）与 `package.json` 的 `"."`/`"./client"` 导出。
- 预设选择器去噪：7 个成员预设改名为「〔内部成员〕…」并在描述标注「仅供『BMad 小队 · 调度』内部委派，请勿直接选择」；负责人描述改为「日常只需选这一个，它会自动把工作分派给下面各成员」。作为客户端过滤未生效时的兜底（成员必须保留供 `delegate_*` 按 id 调用）。
- 修复 Plugins 列表显示：8 个预设行不再统一显示 `@deepseek-ai/dsh-agent-preset` 的模块文案（「Agent 预设定义 / 声明一个 Agent 预设及其使用的插件组合。」）。每个预设改挂自己的薄模块 `dsh-agent-teams/rows/<role>`（re-export `@deepseek-ai/dsh-agent-preset`），并随行提供 `locale/en|zh.json` 与图标（各角色共用同一小队图标），列表与详情因此显示各自的角色名与说明（如「〔内部成员〕BMad · Mary 业务分析师」）。`package.json` 增加 `./rows/*` 导出与 `@deepseek-ai/dsh-agent-preset` peer 依赖，`scripts/verify.py` 增加对应校验。
- 评审后硬化与一致性：`client.js` 改为显式 7 个成员 id 集合（不再用 `bmad-` 前缀，避免误伤未来非成员 `bmad-*` 预设）、`defineProperty` 包 try/catch 且仅包装可配置自有属性、二次 `apply` 幂等、仅在包装仍生效时还原、形状异常一次性告警、补 `isDefault` 兜底；8 份 `rows/*/locale/{en,zh}.json` 文案与预设口径对齐（含「内部成员 / 请勿直接选择」）；`@deepseek-ai/dsh-agent-preset` 由可选 peer 改为非可选并钉 `^0.2.2-rc.5`（rows 硬 import 它）；`verify.py` 增补 client 半边装配断言、每行 title 精确比对 / description 非空 / 标题去重、`node --check client.js`。
- 零依赖 playbook 版：新增 `playbooks/`（协议 + 7 角色自包含技能），成员预设改扫 `playbooks/`（`includeDefaultRoots:false`）；完整 BMad 技能保留在 `skills/` 但不再启用。
- 确定性校验器 `scripts/squad_validate.mjs`（Node，零依赖）+ `examples/bmad-output/` 示例；阶段门由 Lead 执行。
- Lead 预设加 shell 以运行校验器；`scripts/verify.py` 与 CI 覆盖 playbook 与校验器。
- 修复：为 7 个成员预设补齐 `tool-fs-search.sampleOverCapGlobResults: false` 与 `tool-todo.allowParallelInProgress: true` 必填配置（与 Lead 预设一致），解决新版 DSH 下 `delegate_*` 因成员预设配置校验失败而无法拉起队员的问题；`cordis.patch.yml` 已按模板重新生成。
- 初始版本：BMad 小队（1 名负责人 + 7 名 BMad 专家）作为 DSH agent 预设，构建在内置 Agent Teams 之上。
- 负责人用「一成员一个 `delegate_*` 工具」做零代码点名委派；成员共享任务板。
- 随包携带 BMad 技能（core-tools / method / tea，MIT），安装本插件即无需单独安装 BMad 技能。
- 显示元数据（locale en/zh、icon）；配置型 bundle，无 Host 代码。
