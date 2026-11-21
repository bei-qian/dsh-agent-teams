# SETUP · 安装与使用 BMad 小队插件

本插件是一个 **配置型 DSH bundle + 轻量客户端半边**：在 Host 侧只新增若干「agent 预设」（不写业务 Host 代码），并由浏览器半边 `client.js` 负责在选择器里隐藏成员预设。
它复用 DSH 内置的 Agent Teams（共享任务板 + 子代理），所以你需要：

- 一个能运行 DeepSeek Harness 的 profile（本机默认 `desktop`）；
- 已在项目里装好 BMad 技能（可选，用于让成员能加载 `bmad-*` 技能；不影响预设本身工作）。

## 安装

1. 生成/更新 `cordis.patch.yml`（模板改动后需要重跑）：
   ```bash
   cd dsh-agent-teams
   python3 scripts/build_patch.py
   ```
2. 让 agent 用 `plugin_manager` 安装本目录（绝对路径）：
   ```
   install_bundle  target = /absolute/path/to/dsh-agent-teams
   ```
   或在 Web 的 **Plugins → Add plugin → 选择本地目录** 安装本目录。
3. 安装后在 **Plugins** 列表里应能看到 8 个预设行：`preset-bmad-squad-lead` 及
   `preset-bmad-analyst/-pm/-po/-ux/-architect/-dev/-tea`，状态为已激活。
   每行显示各自的角色名与说明（如「〔内部成员〕BMad · Mary 业务分析师」），而不是统一的
   「Agent 预设定义 / 声明一个 Agent 预设及其使用的插件组合。」——它们各自挂载
   `dsh-agent-teams/rows/<role>` 薄模块并带自己的 locale。
   此外列表里还会出现一个**插件本体条目** `dsh-agent-teams`（非预设行，属正常现象）。

## 使用一支小队

1. 新建一个会话，在 **模型/推理菜单** 里选预设 **「BMad 小队 · 调度」**（即 `bmad-squad-lead`）。
2. **Agent Teams 会自动跟着预设走（但不覆盖你的手动选择）**：Host 半边（`index.js`）在**进入**团队预设（默认「BMad 小队 · 调度」）时自动把 **「Use Agent Teams / 启用 agent 协作」** 打开；在**非团队预设之间切换时保持当前开关不动**（你手动开的 Team 会一直开着）；从团队预设**切回**非团队预设时，恢复到**进入团队预设之前**你的非团队选择（原先关→关、原先开→开）。共享任务板因此对「调度」开箱可用。（该开关仍在模型/推理菜单里，可随时手动改。）
3. 直接把一段工作发给它，例如：
   > 帮我做一个「周报自动汇总」的小功能：先调研可行性，再出个 PRD，然后实现并加测试。
   负责人会按「分析→规划→实现→验证」把它分派给 Mary / John / Amelia 等成员，
   成员在各自子代理里干活，完成后回报，负责人在合适时机交回结果。
4. 会话头部的 **子代理/共享任务** 面板可看到成员与任务进度。

## 注意

- **预设选择器默认只显示「BMad 小队 · 调度」**：浏览器半边 `client.js` 会把 7 个成员预设从选择器里过滤掉
  （Host 端 8 个预设仍全部注册，`delegate_*` 照常可用）。若某次升级导致该过滤失效，成员预设会退而显示为
  「〔内部成员〕…」并标注「仅供内部委派、请勿直接选择」。正常只需选「调度」，它会自动点名成员。
- **Team 模式跟着预设走（可配置 + 不覆盖手动选择）**：Host 半边把「Agent Teams 开关」对齐到当前预设——
  - **哪些预设算「团队预设」**：默认 `['bmad-squad-lead']`，改 `index.js` 顶部的 `TEAM_PRESETS`（或在 Loader 行上加
    `config.teamPresets`）即可，不用改逻辑；列表内=进入即强制开，列表外=非团队预设。
  - **切换规则**：**进入团队预设→开**；**离开团队预设回到非团队预设→还原进入前的非团队选择**（原先关→关、原先开→开）；
    **非团队预设之间切换→保持当前状态不动**（手动开着就一直开）。
  - **触发时机**：新建会话（团队预设→开）、切换预设（按上面的转移规则）、以及**插件启用时**对当前已打开的
    空白根会话补开团队预设（**只补开、不擅自关掉你手动开的**；你手动的非团队会话状态不被打扰）。
  - **举例**：`standard` 手动开了 Team → 切去「调度」（开）→ 再切回来仍是**开**；`standard` 关着 → 切去「调度」（开）→ 切回来仍是**关**；
    `standard` 手动开 → 切到另一个非团队预设 `minimal` → 保持**开**。**平时也可以随时手动拨这个开关**，只要不跨越「团队↔非团队」边界，插件不会改动它。
  - **改完 `index.js` 后**：Host 半边不像浏览器半边那样热更，需要*重启 DSH*，或在 *Plugins* 里把插件关开一次触发
    profile 重编排（本次已通过后者应用到当前 profile）。
  - **边界**：这层同步由本插件执行。**把插件关掉就没有代码去纠偏**，开关会退回 DSH 原生（保留上次状态）——这是 DSH
    本身「Team 按会话、切预设不重置」的行为，不是插件能做到的；要彻底摆脱插件，只能改 DSH 内核（见对话里的 B 方案）。
- **成员共享同一工作区**：多人并行写同一批文件会互相覆盖；让负责人在任务上登记写入范围，或改为串行。
- **零依赖 playbook（默认启用）**：成员预设 `skill-filesystem.customSkillDirs` 指向插件内 `playbooks/`，
  每个角色一份自包含 `SKILL.md`，固定写到工作区 `bmad-output/`（`index.md` 当票据真相）；**不需要** Python/uv/`_bmad`。
  **校验器** `scripts/squad_validate.mjs`（Node，零依赖）在每个阶段门由 **Lead** 执行（dev/tea 可自行执行）：
  `node scripts/squad_validate.mjs ./bmad-output`，退出码 0/1 决定能否继续。
  仓库仍保留完整 BMad 技能于 `skills/`（**未启用**，可日后参考或回退；不需要可删）。
  来源与许可见 `ATTRIBUTION.md`（MIT © 2025 BMad Code, LLC）。
- **每个成员可选模型**：默认成员跟随调度会话的当前模型。要在**委派时**给某个成员换模型，先打开
  **Plugins → Subagent → Model selection** 启用并勾选允许的模型路由，之后调度会在 `delegate_*` 里按需传
  `provider/model/reasoning_effort`（未启用时只能选父会话当前的模型）。要给某成员**固定默认模型**，
  在 `cordis.patch.tmpl.yml` 对应 `delegate_*` 行加 `agentOptions: { provider, model, reasoningEffort }`，
  再跑 `python3 scripts/build_patch.py`。

## 卸载

在 **Plugins** 里移除 `dsh-agent-teams` bundle，或在 profile 的 `cordis.patch.yml` 中删除对应插入即可。
