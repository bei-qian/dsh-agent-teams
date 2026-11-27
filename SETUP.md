# SETUP · 安装与使用 Olympus Squad 插件

本插件是一个 **配置型 DSH bundle + 轻量客户端半边**：在 Host 侧只新增若干「agent 预设」（不写业务 Host 代码），并由浏览器半边 `client.js` 负责在选择器里隐藏成员预设。
它复用 DSH 内置的 Agent Teams（共享任务板 + 子代理）。

> 两类读者，看不同章节：
> - **外部用户**（从 GitHub 拿到本仓库，想装进自己的 DSH）：读 [从 GitHub 下载安装到 DSH](#从-github-下载安装到-dsh)。`cordis.patch.yml` 已随仓库提交，**无需 Python/Node 构建**。
> - **开发者**（改了 `cordis.patch.tmpl.yml` / `persona/*.md` 后要重建产物）：读 [开发者：改模板后重建](#开发者改模板后重建)。

## 从 GitHub 下载安装到 DSH

DSH 安装插件 bundle **只支持「本地目录」这一种来源**，**不支持**直接从 git URL 或 npm 包名安装。因此外部用户的正确流程是：先把仓库取到本地（`git clone` 或下载 ZIP 解压），再用「本地目录」方式安装。本节按此流程给出完整步骤。

### 前置条件

- 一个能运行的 **DeepSeek Harness（DSH）**，且已进入可用的 profile（本机默认 `desktop`）。
- 本仓库的 `cordis.patch.yml` **已提交**（预生成）；**无需** Python/Node 即可安装。
- **无需**把本插件发布到 npm。`package.json` 里的 peerDependency `@deepseek-ai/dsh-agent-preset` 由 DSH 安装过程自行解析；`private: true` 也不影响「本地目录」安装。
- 可选：项目里已装好 BMad 技能，仅用于让成员加载 `bmad-*` 技能，不影响预设本身工作（本插件已内置零依赖 playbook，见文末「注意」）。

### 第一步：把仓库取到本地

任选其一：

**方式 1：git clone**

```bash
git clone https://github.com/bei-qian/dsh-olympus.git
```

**方式 2：下载 ZIP**

在 GitHub 仓库页点击 **Code → Download ZIP**，解压后得到 `dsh-olympus/` 目录。

两种方式都会得到一个包含 `cordis.patch.yml` 的目录（即本仓库根 `dsh-olympus/`）。**请记住这个目录的绝对路径**，下一步要用。

> ⚠️ **这个目录之后不能删除、不能移动。** DSH 是**链接（link）**这个本地目录来安装，而不是拷贝。移动或删除会让插件失效（见 [常见问题](#常见问题faq)）。建议放在一个稳定的位置，例如：
> - macOS / Linux：`~/plugins/dsh-olympus`
> - Windows：`C:\Users\<你>\plugins\dsh-olympus`

### 第二步：用「本地目录」安装

**安装方式 A：Web 图形界面**

DSH → **Plugins** → **Add plugin** → **选择本地目录**，选中上一步得到的 `dsh-olympus` 目录。

**安装方式 B：agent / `plugin_manager`**

让 agent 调用 `plugin_manager` 的 `install_bundle`，`target` 填该目录的**绝对路径**（macOS / Linux / Windows 都用绝对路径）：

```
install_bundle  target = /绝对/路径/to/dsh-olympus
# 例（macOS/Linux）：/Users/你的名字/plugins/dsh-olympus
# 例（Windows）    ：C:\Users\你的名字\plugins\dsh-olympus
```

`install_bundle` 会自行完成 package 安装与 bundle 选择，**不要**用 shell 手动复刻这些步骤。

### 成功标志

安装后到 **Plugins** 列表确认出现：

- **插件本体行** `dsh-olympus`（非预设行，属正常现象）；
- **8 个预设行**，均处于激活（active）状态：`preset-squad-lead` 以及 `preset-analyst / -pm / -po / -ux / -architect / -dev / -tea`。

每行显示各自的角色名与说明（如「Olympus · Apollo 业务分析师」），而不是统一的「Agent 预设定义 / 声明一个 Agent 预设及其使用的插件组合。」——它们各自挂载 `dsh-olympus/presets/<role>` 薄模块并带自己的 locale。

### 首次使用

1. 新建一个会话。
2. 在 **模型/推理 → 预设** 里选 **「Olympus Squad · 调度」**（`squad-lead`）。
3. **Agent Teams 会自动开启**（随预设走、不覆盖你的手动选择，详见下文「注意」）。
4. 预设选择器**默认只显示「调度」**：7 个成员预设被 `client.js` 从选择器过滤掉（Host 端 8 个预设仍全部注册，供 `delegate_*` 使用）——日常只需选这一个，它会自动点名成员。

### 更新

```bash
cd /你的/dsh-olympus
git pull
```

然后在 **Plugins** 里把 `dsh-olympus` 插件**关开一次**，或**重启 DSH**，让新内容生效（Host 半边不像浏览器半边那样热更）。

### 升级与版本锁定（07a）

上面「更新」走的是「本地目录 + `git pull`」。若你把 `dsh-olympus` 作为 **profile 依赖**（在 profile 的 `package.json` 里以 `github:` specifier 引入）安装，请把依赖**锁定到显式 ref**，避免跟随默认分支漂移：

```yaml
# ~/.dsh/profiles/<profile>/package.json
"dsh-olympus": "github:bei-qian/dsh-olympus#v0.2.5"   # 锁到发布 tag（或改用具体 commit sha）
```

升级流程 = **改 specifier → 重装 → 核对**：改到目标 tag / commit → `pnpm install` 重装 → 核对 `pnpm-lock.yaml` 里该依赖的 tarball commit 与所选 ref 一致、`require('dsh-olympus/package.json').version` 等于所选版本（如 `0.2.5`）。

> **发版 = 打 tag**（tag 推送即触发 CI `verify`，`on: push` 无 branches/tags 过滤器）；**不使用 prepack** 作为安装门禁——pnpm 11.28.5 实测 git 依赖默认受 `allowBuilds` 白名单约束、`prepack` 不会自动执行（未列入白名单时安装报 `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`）。

### 卸载

在 **Plugins** 里移除 `dsh-olympus` bundle 即可（或在 profile 的 `cordis.patch.yml` 中删除对应插入）。

## 常见问题（FAQ）

- **为什么安装后不能删除 / 移动克隆下来的目录？**
  DSH 的「本地目录」安装是**链接（link）**而非拷贝：插件运行时直接读这个 checkout 里的文件（`index.js` / `client.js` / `cordis.patch.yml` / `presets/` / `playbooks/` 等）。删除或移动目录会让插件失效。若要换位置，先在 **Plugins** 里卸载，把目录移到新位置后，再按上面步骤重新安装。
- **能不能直接填 git URL / npm 包名安装？**
  不能。DSH 目前只支持从**本地目录**安装插件 bundle，没有「从 git URL 或 npm spec 直接安装 bundle」的能力。务必先 `git clone` 或下载 ZIP 解压，再用本地目录方式安装。
- **Windows 上 target 路径怎么写？**
  用该目录的**绝对路径**，例如 `C:\Users\<你>\plugins\dsh-olympus`。不要用 `~` 或相对路径。
- **`package.json` 里是 `private: true`，会不会装不上？**
  不会。`private: true` 只影响发布到 npm；「本地目录」安装不经过 npm 发布，照常可用。
- **需要先 `npm install` 或 `node scripts/build_patch.mjs` 吗？**
  外部用户**不需要**。`cordis.patch.yml` 已随仓库提交，直接安装即可。开发/校验仅需 Node（无需 Python），用于开发者改模板后重建（见下节），以及可选地跑 `scripts/verify.mjs` 校验。
- **peerDependency `@deepseek-ai/dsh-agent-preset` 要怎么装？**
  无需手动处理，由 DSH 安装过程自行解析；**不用**把它发布到 npm。

## 使用一支小队

1. 新建一个会话，在 **模型/推理菜单** 里选预设 **「Olympus Squad · 调度」**（即 `squad-lead`）。
2. **Agent Teams 会自动跟着预设走（但不覆盖你的手动选择）**：Host 半边（`index.js`）在**进入**团队预设（默认「Olympus Squad · 调度」）时自动把 **「Use Agent Teams / 启用 agent 协作」** 打开；在**非团队预设之间切换时保持当前开关不动**（你手动开的 Team 会一直开着）；从团队预设**切回**非团队预设时，恢复到**进入团队预设之前**你的非团队选择（原先关→关、原先开→开）。共享任务板因此对「调度」开箱可用。（该开关仍在模型/推理菜单里，可随时手动改。）
3. 直接把一段工作发给它，例如：
   > 帮我做一个「周报自动汇总」的小功能：先调研可行性，再出个 PRD，然后实现并加测试。
   负责人会按「分析→规划→实现→验证」把它分派给 Apollo / Prometheus / Hephaestus 等成员，
   成员在各自子代理里干活，完成后回报，负责人在合适时机交回结果。
4. 会话头部的 **子代理/共享任务** 面板可看到成员与任务进度。

## 注意

- **预设选择器默认只显示「Olympus Squad · 调度」**：浏览器半边 `client.js` 会把 7 个成员预设从选择器里过滤掉
  （Host 端 8 个预设仍全部注册，`delegate_*` 照常可用）。若某次升级导致该过滤失效，成员预设会退而显示为
  「Olympus · <花名> <职能>」并标注「仅供内部委派、请勿直接选择」。正常只需选「调度」，它会自动点名成员。
- **Team 模式跟着预设走（可配置 + 不覆盖手动选择）**：Host 半边把「Agent Teams 开关」对齐到当前预设——
  - **哪些预设算「团队预设」**：默认 `['squad-lead']`，改 `index.js` 顶部的 `TEAM_PRESETS`（或在 Loader 行上加
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
  需要上游原文时请 clone `bmad-code-org/BMAD-METHOD` / `bmad-code-org/bmad-method-test-architecture-enterprise`（见 `ATTRIBUTION.md`）；仓库不再保留副本。
  来源与许可见 `ATTRIBUTION.md`（MIT © 2025 BMad Code, LLC）。
- **每个成员可选模型**：默认成员跟随调度会话的当前模型。要在**委派时**给某个成员换模型，先打开
  **Plugins → Subagent → Model selection** 启用并勾选允许的模型路由，之后调度会在 `delegate_*` 里按需传
  `provider/model/reasoning_effort`（未启用时只能选父会话当前的模型）。要给某成员**固定默认模型**，
  在 `cordis.patch.tmpl.yml` 对应 `delegate_*` 行加 `agentOptions: { provider, model, reasoningEffort }`，
  再跑 `node scripts/build_patch.mjs`。

## 开发者：改模板后重建

> 仅当你**改动了 `cordis.patch.tmpl.yml` 或 `persona/*.md`** 时才需要这一节。普通外部用户装完即用，可忽略。

1. 重新生成 `cordis.patch.yml`（模板 / 提示词改动后需要重跑）：
   ```bash
   cd dsh-olympus
   node scripts/build_patch.mjs
   ```
2. 重新安装 / 刷新插件（与外部用户同样的「本地目录」方式）：
   ```
   install_bundle  target = /绝对/路径/to/dsh-olympus
   ```
   或在 Web 的 **Plugins → Add plugin → 选择本地目录** 选择本目录；已在 Plugins 里的，关开一次或重启 DSH 生效。
3. 校验（可选；CI 也会跑）：
   ```bash
   node scripts/verify.mjs
   ```
