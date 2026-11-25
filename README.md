# dsh-olympus · Olympus Squad 插件

把 DeepSeek Harness 内置的 **Agent Teams** 机制，升级成类似 Multica **Squads** 的「小队」产品概念，
并用古希腊神话花名的角色（Apollo / Prometheus / Themis / Ariadne / Athena / Hephaestus / Argus，方法参考 BMad Method）作为默认成员编制。

![version](https://img.shields.io/badge/version-0.2.3-blue) ![license](https://img.shields.io/badge/license-MIT-green) ![type](https://img.shields.io/badge/DSH-bundle-7c3aed)

> 状态：**v1 已安装验证**（8 个预设 active，技能根 = `playbooks/` + `capabilities/`）。设计见 [DESIGN.md](./DESIGN.md)，安装与用法见 [SETUP.md](./SETUP.md)。

## 安装

从 GitHub 克隆或下载本仓库后，用 DSH 的**本地目录**方式安装即可（无需发布 npm、无需构建）：

```bash
git clone https://github.com/bei-qian/dsh-olympus.git   # 或 GitHub 页 Code → Download ZIP 解压
```

然后 DSH → **Plugins → Add plugin → 选择本地目录**（或让 agent 跑 `plugin_manager` 的 `install_bundle`，`target` 填该目录绝对路径）。完整步骤（前置条件、两种安装方式、成功标志、首次使用、更新、卸载、常见问题）见 [从 GitHub 安装](./SETUP.md#从-github-下载安装到-dsh)。

## 为什么是「在 Agent Teams 之上」，而不是重写

DSH 已经自带 Agent Teams：

| 包 | 提供 |
|---|---|
| `@deepseek-ai/dsh-agent-team` | 共享任务板（DAG、CAS 认领、Lead 权限、持久化投影） |
| `@deepseek-ai/dsh-tool-agent-team` | `team_task_create/list/get/update` 工具 + `team:policy` 提示 |
| `@deepseek-ai/dsh-client-ui-agent-team` | Web 端「子代理树 + 共享任务」面板 |

它给的是**机制**：一棵子代理树 + 一块任务板。它**没有**给出的，正是 Multica Squads 的三样东西：

1. **角色预设**（可复用的专家成员）；
2. **小队编制与路由**（Leader + Roster + 角色描述 + 小队指令）；
3. **一套工作法**（BMad 四阶段 + 票据即规格）。

本插件就是补上这三层，所以它本质是「小队 ⇄ Agent Teams」的胶水层 + Olympus Squad 编制。

## 目录

- [SETUP.md](./SETUP.md) — 安装与使用；外部用户请看 [从 GitHub 安装](./SETUP.md#从-github-下载安装到-dsh)（含如何选预设、开 Team、跑一支小队）。
- [DESIGN.md](./DESIGN.md) — 概念映射、架构（v1 配置型 / v2 Host+UI）、默认 Olympus Squad 编制、运行协议、约束与里程碑。
- [docs/GLOSSARY.md](./docs/GLOSSARY.md) — 花名 ↔ preset id ↔ 上游角色 ↔ 座位职责 ↔ 希腊词义（人读层唯一映射表；不随包分发）。
- [ROADMAP.md](./ROADMAP.md) — 未来若干大改法：零依赖自包含 playbook（已完成）；v2 小队 Web 面板；小队评测体系（待调研）。
- [ATTRIBUTION.md](./ATTRIBUTION.md) — 内置 BMad 技能的来源与许可说明。
- [CHANGELOG.md](./CHANGELOG.md) — 版本记录。
- [LICENSE](./LICENSE) — MIT（本插件）；BMad 上游技能版权归 BMad Code, LLC（MIT），全文见根 [LICENSE-BMAD-METHOD.txt](./LICENSE-BMAD-METHOD.txt）。

## 版本

- 包版本：**0.2.3**（见 `package.json`）。安装后可在 DSH「Plugins」里看到 `dsh-olympus` 及其版本。
- 形态：**配置型 bundle + 轻量客户端半边**：新增 8 个 agent 预设 + 零依赖 `playbooks/`（默认启用）；并带一个浏览器半边（`client.js`），把 7 个成员预设从预设选择器里过滤掉、只留「调度」一个（Host 端 8 个预设仍全部注册，供 `delegate_*` 委派）。Host 半边（`index.js`）会让内置 Agent Teams 跟着预设走、但不覆盖你的手动选择：**进入**团队预设（默认「调度」）时**自动打开**，**离开**团队预设回到非团队预设时**还原进入前的非团队选择**（原先关→关、原先开→开），**非团队预设之间切换则保持当前状态不动**，无需每次手动勾「启用 agent 协作」。团队预设列表可配置（`TEAM_PRESETS` / `config.teamPresets`），且在插件启用时只对当前已打开的**空白**会话补开团队预设（不擅自改动非团队会话的手动状态）。
- 版本策略：维持在 **0.2.x** 迭代，重大改动再升大版本（按维护者约定）。

## 升级与版本锁定（07a）

profile 里对 `dsh-olympus` 的依赖应**锁定到显式 ref**，不要用会随默认分支漂移的写法：

```yaml
# ~/.dsh/profiles/<profile>/package.json（dependencies 字段）
"dsh-olympus": "github:bei-qian/dsh-olympus#v0.2.3"   # 推荐：锁到发布 tag
# 或锁到具体 commit sha（可复现性更强）：
# "dsh-olympus": "github:bei-qian/dsh-olympus#<40 位 commit sha>"
```

升级流程 = **改 specifier → 重装 → 核对**：

1. 把 profile 依赖的 specifier 改到目标 tag / commit；
2. 重装（`pnpm install`，或走 DSH 的安装流程）；
3. 核对两处一致：
   - `pnpm-lock.yaml` 里该依赖解析到的 tarball commit == 所选 ref 指向的 commit；
   - `require('dsh-olympus/package.json').version` == 所选 tag 的版本号（如 `0.2.3`）。

> **发版 = 打 tag**（tag 推送即触发 CI `verify`：`on: push` 未加 branches/tags 过滤器，tag 推送同样会跑）；**不使用 prepack** 作为安装门禁——本机 pnpm 11.28.5 实测，git 依赖默认受 `allowBuilds` 白名单约束、`prepack` **不会**自动执行（未列入白名单时安装直接报 `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`）。

## 小队编制（Roster）

装好后这些预设会出现在「模型/推理 → 预设」选择器里（描述都标注「供小队…使用」）：

| 预设 | 角色 | 职责 |
|---|---|---|
| `squad-lead` | 调度（Lead） | 只路由与委派，不亲自实现；跑在共享任务板上 |
| `analyst` | Apollo 业务分析师 | 调研、brief、PRFAQ |
| `pm` | Prometheus 产品经理 | PRD 与规划文档 |
| `po` | Themis 产品负责人 | 票据需求、切 epic/story、跑票板 |
| `ux` | Ariadne UX 设计师 | DESIGN.md / EXPERIENCE.md |
| `architect` | Athena 架构师 | 技术决策、架构脊 |
| `dev` | Hephaestus 开发者 | 实现、测试、评审、回顾 |
| `tea` | Argus 测试架构师 | 测试策略、自动化、发布门禁 |

> **默认启用零依赖 playbook**：成员预设的 `skill-filesystem.customSkillDirs` 指向 `playbooks/`（自包含，不依赖 `_bmad`/Python/uv）。
> 每个角色一份 `SKILL.md` + 固定 `bmad-output/` 目录 + `index.md` 票据真相，收尾用 `scripts/squad_validate.mjs` 校验器把关（由 Lead 执行）。
> 内置 **10 份 `bmad-*` 流程 playbook**（含新增 `bmad-upstream-sync` 上游更新吸收例程：fetch+ff 更新参考克隆 → `scripts/upstream_drift.mjs` 漂移表 → 差距分类 absorb/skip → 切票/实现/门禁/评审/发版）+ `modern-web-guidance` 前端参照（非 `bmad-*`）+ `authoring-for-agents` 写作规范参照（非 `bmad-*`）。
> 需要上游原文时请 clone `bmad-code-org/BMAD-METHOD` / `bmad-code-org/bmad-method-test-architecture-enterprise`（见 `ATTRIBUTION.md`）；仓库不再保留副本。
> 技能来源与许可：MIT © 2025 BMad Code, LLC（见 `ATTRIBUTION.md`）。

## 每个成员选择模型

小队默认让成员跟随调度会话的当前模型；同时**每个成员都可以独立选用模型**，两种方式可叠加：

1. **委派时临时指定（运行时）**：7 个 `delegate_*` 工具都开启了 `modelSelection`，并由 `delegate-analyst` 注册 `list_subagent_models`（`modelDiscovery`，每个 scope 只开一个实例）。调度的模型在委派时可给某个成员传 `provider` / `model` / `reasoning_effort`（例如「让 Hephaestus 用强模型实现」），不传则跟随会话当前模型。
   > 前提：要让调度选到「会话当前模型之外」的模型，需先打开 **Plugins → Subagent → Model selection**，启用并勾选允许的模型路由。这是 DSH 的会话授权策略，插件无法绕过；未启用时只允许选择父会话当前的 provider/model 及其支持的 effort。
2. **固定默认模型（配置）**：想给某角色钉一个默认模型，在该 `delegate_*` 行加 `agentOptions`，例如：

   ```yaml
   - id: delegate-dev
     name: '@deepseek-ai/dsh-tool-subagent'
     config:
       provider: spawn
       toolName: delegate_dev
       agentPreset: dev
       modelSelection: true        # 仍允许调度临时覆盖
       agentOptions: { provider: deepseek, model: deepseek-chat, reasoningEffort: high }
   ```

   改完 `cordis.patch.tmpl.yml` 后跑 `node scripts/build_patch.mjs` 重新生成 `cordis.patch.yml`。

> DSH 的 agent 预设本身不能声明模型（preset 只声明插件组合）；成员模型一律走 `dsh-tool-subagent` 的 `agentOptions` / `modelSelection`。

## 开发与校验

```bash
# 改完 persona/*.md 后重新生成 cordis.patch.yml
node scripts/build_patch.mjs

# 校验：生成物是否同步、8 个预设/委派接线/内置技能/元数据是否齐全
node scripts/verify.mjs

# 原型静态门（零依赖）；加 --browser 跑三档截图 + console
node scripts/check_prototype.mjs <原型目录>
```

CI（`.github/workflows/verify.yml`）在 push / PR 时跑 `scripts/verify.mjs`，防止 `cordis.patch.tmpl.yml`、`persona/` 与 `cordis.patch.yml` 漂移。

## 许可

- 本插件：MIT（见 [LICENSE](./LICENSE)）。
- 蒸馏所依据的上游 BMad 技能：MIT，© 2025 BMad Code, LLC，来源 `bmad-code-org/BMAD-METHOD` / `bmad-code-org/bmad-method-test-architecture-enterprise`（见 [ATTRIBUTION.md](./ATTRIBUTION.md) 与根 [LICENSE-BMAD-METHOD.txt](./LICENSE-BMAD-METHOD.txt））。
