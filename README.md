# dsh-agent-teams · BMad 小队插件

把 DeepSeek Harness 内置的 **Agent Teams** 机制，升级成类似 Multica **Squads** 的「小队」产品概念，
并用 **BMad Method** 的角色（Mary / John / Sofia / Sally / Winston / Amelia / Murat）作为默认成员编制。

![version](https://img.shields.io/badge/version-0.1.0-blue) ![license](https://img.shields.io/badge/license-MIT-green) ![type](https://img.shields.io/badge/DSH-bundle-7c3aed)

> 状态：**v1 已安装验证**（8 个预设 active，含内置 BMad 技能）。设计见 [DESIGN.md](./DESIGN.md)，安装与用法见 [SETUP.md](./SETUP.md)。

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

本插件就是补上这三层，所以它本质是「小队 ⇄ Agent Teams」的胶水层 + BMad 编制。

## 目录

- [SETUP.md](./SETUP.md) — 安装与使用（如何选预设、开 Team、跑一支小队）。
- [DESIGN.md](./DESIGN.md) — 概念映射、架构（v1 配置型 / v2 Host+UI）、默认 BMad 编制、运行协议、约束与里程碑。
- [ROADMAP.md](./ROADMAP.md) — 未来两条大改法：零依赖自包含 playbook；v2 小队 Web 面板。
- [ATTRIBUTION.md](./ATTRIBUTION.md) — 内置 BMad 技能的来源与许可说明。
- [CHANGELOG.md](./CHANGELOG.md) — 版本记录。
- [LICENSE](./LICENSE) — MIT（本插件）；`skills/` 内的 BMad 技能版权归 BMad Code, LLC（MIT）。

## 版本

- 包版本：**0.1.0**（见 `package.json`）。安装后可在 DSH「Plugins」里看到 `dsh-agent-teams` 及其版本。
- 形态：**配置型 bundle + 轻量客户端半边**：新增 8 个 agent 预设 + 零依赖 `playbooks/`（默认启用）+ 完整 BMad 技能（`skills/`，保留未启用）；并带一个浏览器半边（`client.js`），把 7 个成员预设从预设选择器里过滤掉、只留「调度」一个（Host 端 8 个预设仍全部注册，供 `delegate_*` 委派）。Host 半边（`index.js`）会让内置 Agent Teams 跟着预设走、但不覆盖你的手动选择：**进入**团队预设（默认「调度」）时**自动打开**，**离开**团队预设回到非团队预设时**还原进入前的非团队选择**（原先关→关、原先开→开），**非团队预设之间切换则保持当前状态不动**，无需每次手动勾「启用 agent 协作」。团队预设列表可配置（`TEAM_PRESETS` / `config.teamPresets`），且在插件启用时只对当前已打开的**空白**会话补开团队预设（不擅自改动非团队会话的手动状态）。
- 版本策略：维持在 **0.1.x** 迭代，重大改动再升大版本（按维护者约定）。

## 小队编制（Roster）

装好后这些预设会出现在「模型/推理 → 预设」选择器里（描述都标注「供小队…使用」）：

| 预设 | 角色 | 职责 |
|---|---|---|
| `bmad-squad-lead` | 调度（Lead） | 只路由与委派，不亲自实现；跑在共享任务板上 |
| `bmad-analyst` | Mary 业务分析师 | 调研、brief、PRFAQ |
| `bmad-pm` | John 产品经理 | PRD 与规划文档 |
| `bmad-po` | Sofia 产品负责人 | 票据需求、切 epic/story、跑票板 |
| `bmad-ux` | Sally UX 设计师 | DESIGN.md / EXPERIENCE.md |
| `bmad-architect` | Winston 架构师 | 技术决策、架构脊 |
| `bmad-dev` | Amelia 开发者 | 实现、测试、评审、回顾 |
| `bmad-tea` | Murat 测试架构师 | 测试策略、自动化、发布门禁 |

> **默认启用零依赖 playbook**：成员预设的 `skill-filesystem.customSkillDirs` 指向 `playbooks/`（自包含，不依赖 `_bmad`/Python/uv）。
> 每个角色一份 `SKILL.md` + 固定 `bmad-output/` 目录 + `index.md` 票据真相，收尾用 `scripts/squad_validate.mjs` 校验器把关（由 Lead 执行）。
> 仓库仍完整保留 BMad 技能于 `skills/`（**未启用**，便于日后回退或参考；不需要可直接删）。
> 技能来源与许可：MIT © 2025 BMad Code, LLC（见 `ATTRIBUTION.md`）。

## 每个成员选择模型

小队默认让成员跟随调度会话的当前模型；同时**每个成员都可以独立选用模型**，两种方式可叠加：

1. **委派时临时指定（运行时）**：7 个 `delegate_*` 工具都开启了 `modelSelection`，并由 `delegate-analyst` 注册 `list_subagent_models`（`modelDiscovery`，每个 scope 只开一个实例）。调度的模型在委派时可给某个成员传 `provider` / `model` / `reasoning_effort`（例如「让 Amelia 用强模型实现」），不传则跟随会话当前模型。
   > 前提：要让调度选到「会话当前模型之外」的模型，需先打开 **Plugins → Subagent → Model selection**，启用并勾选允许的模型路由。这是 DSH 的会话授权策略，插件无法绕过；未启用时只允许选择父会话当前的 provider/model 及其支持的 effort。
2. **固定默认模型（配置）**：想给某角色钉一个默认模型，在该 `delegate_*` 行加 `agentOptions`，例如：

   ```yaml
   - id: delegate-dev
     name: '@deepseek-ai/dsh-tool-subagent'
     config:
       provider: spawn
       toolName: delegate_dev
       agentPreset: bmad-dev
       modelSelection: true        # 仍允许调度临时覆盖
       agentOptions: { provider: deepseek, model: deepseek-chat, reasoningEffort: high }
   ```

   改完 `cordis.patch.tmpl.yml` 后跑 `python3 scripts/build_patch.py` 重新生成 `cordis.patch.yml`。

> DSH 的 agent 预设本身不能声明模型（preset 只声明插件组合）；成员模型一律走 `dsh-tool-subagent` 的 `agentOptions` / `modelSelection`。

## 开发与校验

```bash
# 改完 prompts/*.md 后重新生成 cordis.patch.yml
python3 scripts/build_patch.py

# 校验：生成物是否同步、8 个预设/委派接线/内置技能/元数据是否齐全
python3 scripts/verify.py
```

CI（`.github/workflows/verify.yml`）在 push / PR 时跑 `scripts/verify.py`，防止 `cordis.patch.tmpl.yml`、`prompts/` 与 `cordis.patch.yml` 漂移。

## 许可

- 本插件：MIT（见 [LICENSE](./LICENSE)）。
- 内置的 BMad 技能（`skills/`）：MIT，© 2025 BMad Code, LLC，来源 `bmad-code-org/BMAD-METHOD`（见 [ATTRIBUTION.md](./ATTRIBUTION.md) 与 `skills/LICENSE-BMAD-METHOD.txt`）。
