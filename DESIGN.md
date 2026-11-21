# dsh-agent-teams — BMad 小队插件设计

> 版本：design draft · 2026-11-21
> 目标读者：本项目维护者（以及后续接手实现的 agent）。

---

## 0. 一句话

把 DSH 内置的 **Agent Teams**（共享任务板 + 子代理树）当成底座，在其上做一层
**「小队（Squad）」** 产品概念：**一个 Leader + 一份命名专家 Roster + 小队指令 + 一套 BMad 工作法**，
让用户像 Multica 里「把 issue 指派给 squad」一样，把一段工作交给一支 BMad 小队，由 Leader 路由到对的角色。

---

## 1. 关键发现：不要重造轮子

### 1.1 DSH 已内置 Agent Teams（机制层）

- `@deepseek-ai/dsh-agent-team`：给现有子代理树加一块**持久共享任务板**。任务有 DAG 依赖、CAS 版本号、
  Lead 可把任务重派给根或任意可达后代，成员自行认领。成员 = 子代理。
- `@deepseek-ai/dsh-tool-agent-team`：给每个成员四个任务工具
  `team_task_create / team_task_list / team_task_get / team_task_update`，外加一段固定的 `team:policy` 系统提示。
- `@deepseek-ai/dsh-client-ui-agent-team`：Web 会话头部的「子代理树 + 共享任务」面板（只读看板）。
- 成员之间的通信走标准子代理运行时：`subagent` / `subagent_fork` 创建、`send_message` / `list_agents` /
  `wait_agent` / `interrupt_agent` 通信，按 `name` 寻址。
- **Team 模式是按根 Session 开关的**（模型/推理菜单里的「Use Agent Teams / 启用 agent 协作」），
  默认 **off**；新会话需手动开启（或由宿主组成设置 `defaultEnabled: true`）。

**结论**：任务板、认领、消息、Web 看板这些机制都已具备，插件不需要实现它们。

### 1.2 DSH 缺的、Multica Squads 有而 DSH 没有的三层（产品层）

Multica 的 squad = **Leader + Members + Role descriptions + Squad instructions**，指派后：
只唤醒 Leader → 注入 *Roster + Instructions + Operating Protocol* → Leader 委派（@mention 成员）→ 停止 →
成员回报再唤醒 Leader 复评。这是**编制与路由**，DSH 的通用 Team 机制刻意不提供。

所以本插件补三层：

1. **角色预设（agent presets）**：把 BMad 的角色做成可复用、可选择的 `dsh-agent-preset`。
2. **小队编制/路由**：Leader 预设 + 成员清单（含角色描述）+ 小队指令；委派用 DSH 子代理实现。
3. **BMad 工作法**：四阶段（分析→规划→实现→验证）+ 票据即规格（initiative/epic/story）。

---

## 2. 概念映射：Multica Squad ⇄ DSH 原语

| Multica Squads | 本插件的 DSH 实现 |
|---|---|
| Squad | 一组预设 + 一份「小队清单」（leader preset、members、instructions） |
| Leader agent | `bmad-squad-lead` 预设：persona = 运行协议；工具 = 委派 + 任务板；**不亲自实现** |
| Members（agents） | 成员预设 `bmad-analyst/-pm/-po/-ux/-architect/-dev/-tea`；作为具名子代理被创建 |
| Role descriptions | 写进 Leader persona 的「Roster」段落 |
| Squad instructions | 写进 Leader persona 的「小队指令」段落（v2 可按小队自定义） |
| Assign issue to squad | 新开一个 **Leader 会话**（可带上 issue/票据正文）；v2 用 `squad_run` 命令/UI |
| Leader briefed with Roster + Instructions + Protocol | Leader 预设的 `persona` + `systemPrompt.section`（v1 静态；v2 由 Host 按小队注入） |
| Leader delegates by @mention | Leader 调 `delegate_<member>(task)` 子代理工具（用成员预设 spawn） |
| Leader records evaluation, then stops | Leader persona 规则：委派后停止；任务板记录进度 |
| Member reports back → Leader re-triggered | 子代理完成会作为消息自动回到 Leader；Leader 复评下一步 |
| Status → in_review | 由 Leader / 人判定完成；v2 可映射票据状态 |
| Web task board | 复用内置 `dsh-client-ui-agent-team`（子代理树 + 共享任务） |
| Human member | DSH 里人不作为子代理；人通过给 Leader 会话发消息参与 |

---

## 3. 推荐架构（两层，先 v1 后 v2）

### 3.1 v1：配置型 Bundle（零 Host 代码，最快跑通）

纯 `cordis.patch.yml`，插入若干 `@deepseek-ai/dsh-agent-preset` 行 + 提示文件 + 可选 skills。
**不需要写 TypeScript、不需要写 UI**，用 `plugin_manager install_bundle` 装进 profile 即可。

**点名委派的关键技巧（零代码）**：`dsh-tool-subagent` 的 `agentPreset` 是**每个工具行固定**的。
所以给 Leader 挂「每个成员一个委托工具行」，各自固定不同成员预设 —— Leader 就获得一组成员具名工具：

```yaml
# dsh-agent-teams/cordis.patch.yml（节选，示意）
- insert:
    # ---------- Leader：只路由、不实现 ----------
    - id: preset-bmad-squad-lead
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: bmad-squad-lead
        name: BMad 小队 · 调度
        description: BMad 小队的负责人。只做路由与委派，不亲自实现；供小队会话使用。
        order: 20
        plugins:
          - id: persona
            name: '@deepseek-ai/dsh-persona'
            config:
              prefix: !!js process.getBuiltinModule('node:fs').readFileSync(process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('dsh-agent-teams/package.json')), 'prompts', 'squad-lead.md'), 'utf8')
          - id: agent-instructions
            name: '@deepseek-ai/dsh-agent-instructions'
            config: { maxBytes: 65536 }
          - id: time-context
            name: '@deepseek-ai/dsh-time-context'
          - id: tool-fs
            name: '@deepseek-ai/dsh-tool-fs'
            config: { write: false, edit: false }   # 只读，避免 Leader 亲自改代码
          - id: tool-fs-search
            name: '@deepseek-ai/dsh-tool-fs-search'
          - id: tool-todo
            name: '@deepseek-ai/dsh-tool-todo'
          - id: tool-ask-user
            name: '@deepseek-ai/dsh-tool-ask-user'
          # Agent Teams 任务板（共享）
          - id: tool-agent-team
            name: '@deepseek-ai/dsh-tool-agent-team'
          # 委派：每成员一个 subagent 行（各自固定 agentPreset）
          - id: delegate-analyst
            name: '@deepseek-ai/dsh-tool-subagent'
            config: { provider: spawn, toolName: delegate_analyst, agentPreset: bmad-analyst }
          - id: delegate-architect
            name: '@deepseek-ai/dsh-tool-subagent'
            config: { provider: spawn, toolName: delegate_architect, agentPreset: bmad-architect }
          - id: delegate-dev
            name: '@deepseek-ai/dsh-tool-subagent'
            config: { provider: spawn, toolName: delegate_dev, agentPreset: bmad-dev }
          - id: tool-subagent-control
            name: '@deepseek-ai/dsh-tool-subagent-control'

    # ---------- 成员：Mary 业务分析师 ----------
    - id: preset-bmad-analyst
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: bmad-analyst
        name: BMad · Mary 业务分析师
        description: BMad 小队的业务分析师 Mary，负责调研、简报与 PRFAQ。供小队成员使用。
        order: 21
        plugins:
          - id: persona
            name: '@deepseek-ai/dsh-persona'
            config:
              prefix: !!js process.getBuiltinModule('node:fs').readFileSync(process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('dsh-agent-teams/package.json')), 'prompts', 'analyst.md'), 'utf8')
          - id: agent-instructions
            name: '@deepseek-ai/dsh-agent-instructions'
            config: { maxBytes: 65536 }
          - id: time-context
            name: '@deepseek-ai/dsh-time-context'
          - id: tool-fs
            name: '@deepseek-ai/dsh-tool-fs'
          - id: tool-fs-search
            name: '@deepseek-ai/dsh-tool-fs-search'
          - id: tool-web
            name: '@deepseek-ai/dsh-tool-web'
            config: { fetch: true, searchTimeoutMs: 60000 }
          - id: tool-todo
            name: '@deepseek-ai/dsh-tool-todo'
          # 复用项目里已安装的 BMad 技能（需项目里跑过 bmad setup）
          - id: skill-filesystem
            name: '@deepseek-ai/dsh-skill-filesystem'
            config:
              customSkillDirs:
                - !!js process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:os').homedir(), '.dsh', 'skills')
          - id: tool-skill
            name: '@deepseek-ai/dsh-tool-skill'
    # …pm / po / ux / architect / dev / (tea) 同构
```

> 具体 config 键以已安装版本为准：安装前用 `cordis.patch.yml` 与 `@deepseek-ai/dsh-tool-subagent`
> 的 README/Config schema 核对；不要臆造字段（例如 `description` 未必是合法 config 键）。

**v1 目录树**

```
dsh-agent-teams/
├─ package.json                 # dsh.bundle.patch 指向 cordis.patch.yml
├─ cordis.patch.yml             # 插入 leader + 成员预设 + 委派工具行
├─ prompts/
│  ├─ squad-lead.md             # Leader 运行协议 + Roster + 小队指令
│  ├─ analyst.md  pm.md  po.md  ux.md  architect.md  dev.md  tea.md
├─ skills/                      # 可选：bundle 自带精简 BMad 技能（不依赖外部 bmad 安装）
├─ locale/                      # 可选：面板文案（v1 若纯预设可无）
└─ README.md / DESIGN.md
```

**v1 优点**：零代码、安装即用；沿用 DSH 全部稳定性/持久化保证。
**v1 限制**：小队是**固定编制**（一套 BMad 产品小队）；小队指令/角色描述写死在提示文件里；
要「多支不同小队 / 用户自定义小队 / 把小队作为一级对象指派」就必须上 v2。

### 3.2 v2：Host 插件 + Web 面板（Multica 完整形态）

新增两个包：

- `dsh-squad`（Host 插件）
  - `ctx.squad` 服务：小队注册表（leader 预设、成员 `{name, preset, roleDescription}`、instructions），
    用 `ctx.storage.domain` 或 settings 持久化。
  - `squad_delegate` 工具：**按调用参数动态选预设**创建子代理（v1 做不到的点）。
  - `squad_brief`：在每次 Leader step 注入当前小队的 Roster + 指令（`ctx.systemPrompt.section()` / `agent.inject()`）。
  - `squad_run` / `/squad` 命令：接收一段工作（或票据文件），用 Leader 预设开根会话并**程序化打开 Team 模式**。
- `dsh-client-ui-squad`（Web 面板，slot）
  - 小队 CRUD（Leader / 成员 / 角色描述 / 指令），
  - 「把工作指派给小队」入口，
  - 运行视图（复用内置任务板 + 子代理树）。

**v2 目录树**

```
dsh-agent-teams/
├─ package.json            # dsh.bundle.patch + dsh.client.inject
├─ cordis.patch.yml        # Host 插件行 + 预设行 + 客户端行
├─ src/
│  ├─ index.ts             # Host：ctx.squad 服务 + 工具 + 命令
│  ├─ squad-store.ts       # 小队持久化
│  ├─ brief.ts             # Roster/指令注入
│  └─ client/              # Web 面板（React slot）
├─ prompts/  locale/  skills/
```

**v2 何时做**：确需多支小队、非开发者自定义编制、或要把「小队」当成可指派的一级对象时。

---

## 4. 默认 BMad 编制（Roster）

来自已安装的 `method` 模块的六个命名专家（+ 可选 TEA 模块的 Murat）：

| 预设 id | 角色 | BMad 技能 | 适合委派的工作 | 关键工具 |
|---|---|---|---|---|
| `bmad-squad-lead` | 调度/交付负责人 | （无实现） | 路由、拆解、协调、验收判定 | 委派工具 + team board + 只读 fs + todo + ask |
| `bmad-analyst` | Mary 业务分析师 | `bmad-agent-analyst`, `bmad-deep-recon`, `bmad-brainstorming`, `bmad-forge-idea` | 调研、市场/竞品、brief、PRFAQ、BRD | fs, fs-search, web, todo, skill |
| `bmad-pm` | John 产品经理 | `bmad-agent-pm` | PRD 及各类规划文档、就绪度检查 | fs, fs-search, web, todo, skill |
| `bmad-po` | Sofia 产品负责人 | `bmad-agent-po` | 写票据需求、切 epic/story、跑票板、变更重规划 | fs, fs-search, todo, skill |
| `bmad-ux` | Sally UX 设计师 | `bmad-agent-ux-designer`, `bmad-ux` | 外观与行为（DESIGN.md / EXPERIENCE.md） | fs, fs-search, todo, skill |
| `bmad-architect` | Winston 架构师 | `bmad-agent-architect`, `bmad-architecture` | 技术决策、架构脊（architecture spine） | fs, fs-search, todo, skill |
| `bmad-dev` | Amelia 开发者 | `bmad-agent-dev`, `bmad-build`, `bmad-code-review`, `bmad-retrospective` | 实现 story、写测试、评审、回顾 | fs(+write/edit), fs-search, bash, jobs, todo, skill |
| `bmad-tea`（可选） | Murat 测试架构师 | `bmad-tea*` | 测试策略、框架、自动化、发布门禁 | fs, fs-search, bash, jobs, todo, skill |

> 编制可按项目裁剪：小而快的项目用 `lead + analyst + architect + dev` 即可；重合规项目加 `tea`。
> 预设行无法从预设选择器里隐藏 —— 名称/描述必须写明「供小队使用」，避免用户手动误选成员预设单干。

---

## 5. 小队运行协议（写进 `prompts/squad-lead.md`）

Leader 的 persona 承载 Multica 的 *Operating Protocol + Roster + Instructions* 的 BMad 版：

1. **票据即规格**：先读 initiative / epic / story 文件（若存在）再决策；不臆造需求。
2. **按 BMad 四阶段路由**：分析（Mary）→ 规划（John / Sofia / Sally / Winston）→ 实现（Amelia）→ 验证（Amelia / Murat）。
3. **路由规则（关键词→角色）**：
   - 「值不值得做 / 调研 / 简报」→ `delegate_analyst`
   - 「PRD / 规划文档」→ `delegate_pm`
   - 「票据需求 / 切 epic、story / 看板」→ `delegate_po`
   - 「界面长什么样 / 交互」→ `delegate_ux`
   - 「技术选型 / 架构」→ `delegate_architect`
   - 「实现 / 改代码 / 测试 / 评审 / 回顾」→ `delegate_dev`
   - 「测试策略 / 发布门禁」→ `delegate_tea`（若装）
4. **委派后停止**：Leader 派活后本 turn 结束，不亲自实现、不写代码。
5. **成员回报再评估**：子代理完成消息自动回来后再决定下一棒（继续、扩围、升级给人、或收尾）。
6. **写入协调**：成员共享同一工作区（无 worktree 隔离），并行写需在任务上登记 `writeScopes`，避免撞车；
   构建类工作优先串行或分目录。
7. **完成判定**：交付物自检通过 + 验证证据齐全，才向人汇报「可评审」；中途进度只在内部。

> 这段 persona 是 v1 的「小队指令」；v2 把「Roster/指令」改为 Host 按小队记录动态注入，persona 只留协议骨架。

---

## 6. 关键技术约束与决策

| 约束 | 影响 | 决策 |
|---|---|---|
| `dsh-tool-subagent.agentPreset` 每个工具行固定 | 无法在单工具里动态选成员 | v1：每成员一个委托工具行；v2：`squad_delegate` 动态选预设 |
| Team 模式默认 off，按根会话开关 | 小队会话需先开「Use Agent Teams」 | v1：提示用户开启，或在**专用 squad profile** 里 override `defaultEnabled: true`（影响全 profile，慎用）；v2：`squad_run` 程序化开启 |
| 预设行不能从选择器隐藏 | 用户可能误选成员预设单干 | 名称/描述显式标注「供小队使用」 |
| Agent Teams 成员共享工作区、无 worktree | 并行写会互相覆盖 | Leader 分配 `writeScopes`；构建任务串行/分目录；最终 diff 由 Leader 复核 |
| BMad 技能来源 | 需能在任意机器随插件分发 | 已采用：**把完整 BMad 技能打包进 `skills/`**（MIT，含归属），成员预设 `customSkillDirs` 指向插件内 `skills/`；完整工作流仍需目标项目 `_bmad/` + Python/uv（`bmad setup` 可生成） |
| 提示文件注入 | persona prefix 是字符串 | 用 `!!js` + `baseUrl` 从 `prompts/*.md` 读取，安装后可迁移 |
| KV cache | 预设组成变化会使缓存失效 | 预设保持稳定；成员/角色不频繁改 |
| 安装 = 在 Host 进程执行插件代码 | 需 Full access / 审批 | 装前先 `plugin_manager list_*` 核对，再 `install_bundle` |

---

## 7. 里程碑

- **M0 设计**（本文）。
- **M1 v1 最小可用**：✅ 已完成。`package.json` + `cordis.patch.tmpl.yml` / `cordis.patch.yml` + 8 个预设（负责人 + 7 成员），已装进 `desktop` profile 并激活；待用户在新建会话里选预设跑通一次真实分派。
- **M2 v1 完整**：补齐 6+1 角色、skills、locale、写 `SETUP.md`（像 superagent 那样让 agent 带着用户装）。
- **M3 v2**：`dsh-squad` Host 服务 + `dsh-client-ui-squad` 面板，支持多小队与「指派给小队」。

---

## 8. 已定决策（2026-11-21）

1. **v1 形态**：配置型闭环（零 Host 代码）——已实现。
2. **Roster 范围**：6 个 method 角色 + TEA 的 Murat，共 7 名成员 + 1 名负责人。
3. **命名**：目录与包名 `dsh-agent-teams`。
4. **落地**：已在 `desktop` profile 安装，8 个预设行均 `enabled=true / active`（见 SETUP.md 的验证方式）。
5. **提示语言**：中文。
6. **待办（下一轮）**：v2 的 Host 服务 + Web 面板；以及本插件的图标/详情页展示资源（本地 bundle 可后补）。

---

## 9. 参考

- DSH Agent Teams：`@deepseek-ai/dsh-agent-team`、`dsh-tool-agent-team`、`dsh-client-ui-agent-team` 的 README。
- Agent 预设：`@deepseek-ai/dsh-agent-preset` README；出厂预设 `@deepseek-ai/dsh-web-app/presets/standard.patch.yml`。
- 子代理工具：`@deepseek-ai/dsh-tool-subagent`、`dsh-tool-subagent-control`。
- BMad 角色/路由：本机已安装 `bmad` 技能的 `method` 模块帮助（Mary/John/Sofia/Sally/Winston/Amelia）。
- 同仓库参考实现：`dsh-superagent-prototype/`（多 agent 编排、prompts、team 分工的实际工程范式）。
- Multica Squads 概念：<https://multica.ai/docs/squads>。
