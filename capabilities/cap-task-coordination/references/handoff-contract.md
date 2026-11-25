# Handoff Contract · 可复用交接契约与单元计划模板

> 单一真源：本文件维护 `cap-task-coordination` 的**单元计划模板**与**handoff 契约 schema**，其它处只引用、不复制。字段为**可机械检查**的最小集；未知可选字段可加，不改语义。
>
> 来源与许可：`§B` 结构化交接包（handoff packet）思想借鉴自上游 `handoff` skill（productivity，**MIT**）；**零逐字、只取思想自写**，来源与 Limitations 见 `../SOURCE.md`。字段细则单一真源在本文件，`bmad-squad-protocol`（及 `SKILL.md`）**只留指针、不重复字段**。

## A. 单元计划模板（unit plan）

```yaml
plan_version: 1
goal: "<一句话目标；含完成定义>"
units:
  - id: U1                       # 稳定 ID，勿重编号
    scope: "<有界职责：做什么 / 不做什么>"
    interface:                   # 显式接口/产出契约（下游只依赖此接线）
      inputs: ["<入参/事件>"]
      outputs: ["<返回值/产物>"]
      touched_files: ["<主要改动文件>"]
    acceptance_criteria:         # 每单元 ≥1 条可执行/可断言 AC（可独立验收）
      - id: AC1
        check: "<可观察行为断言>"
        verify: "<命令 或 断言方式>"
    writeScopes: ["<可写路径前缀>"]   # 与其他并行单元必须不相交
    blocked_by: []               # 依赖的前置单元 id（构成 DAG；必须无环）
    role: dev                    # 期望角色（dev/architect/tea/...）
```

**校验**：`node scripts/check_dag.mjs plan.json` 应 exit 0；`node scripts/run_evals.mjs` 覆盖 scope/AC/writeScopes/blocked_by 齐全性、DAG 无环、无序重叠检测。

## B. handoff 契约（worker → lead/orchestrator）

```yaml
handoff_version: 1
from: "<worker id>"
to: "lead"
unit_id: U1
changed:                          # 改了什么（对 diff，不凭记忆）
  - file: "<path>"
    summary: "<一句话>"
evidence:                         # 证据命令 + 结果（可复现）
  - command: "<测试/构建/校验命令>"
    result: "<exit code / 关键输出>"
decisive_claims:                  # 必须能被复核者重推的决定性声明
  - claim: "<如：新增回归测试且通过>"
    rederive_by: "<复核者该如何对 diff/重跑验证>"
    rederived: null               # 复核前留空；复核后填 true/false
residual_risks: ["<残余风险 / 未覆盖>"]
next_steps: ["<下一步建议>"]
```

**纪律**：`decisive_claims` 里每条都要给出 `rederive_by`（可执行/可检的复核方式）；worker 自述只是输入，复核者负责把 `rederived` 落成 true/false。

### B.1 结构化交接包（handoff packet）：在 §B 之上只加「指针 / redact / 建议能力」

`handoff packet`（跨 agent 接手用的结构化交接包）**复用 §B 的字段**，不重新定义语义：
`changed`（改了什么）/ `evidence`（证据命令与结果）/ `residual_risks`（残余风险）/ `next_steps`（下一步）
四者语义**一律以 §B 为准，本节不重复**；本节只补 §B 未覆盖的三项增量：

- **pointers（指针）**：用路径 / URL / 可复跑命令**引用既有产物**（story 文件、日志、diff、ADR、票据），**不把正文复制进交接包**（见 B.2）。
- **redact**：交接前移除 / 替换敏感信息（见 B.3）。
- **suggested_capabilities（可选）**：接手者建议先加载的能力 / playbook id（把上游 suggested skills 映射为**建议能力**；只是建议，不授权、不改流程）。

**最小交接包模板**（方括号 `<...>` 为必填，`[可选]` 可省；四个 §B 字段在此**只占位、语义见 §B**）：

```markdown
### 交接包 · <unit_id / story-id> · <from> → <to>
- **改了什么**：<!-- §B.changed：对 diff，逐文件一句话，不凭记忆 -->
  - <path> — <summary>
- **证据命令与结果**：<!-- §B.evidence：可复跑 -->
  - `<command>` → <exit code / 关键输出>
- **残余风险**：<未覆盖 / 已知缺口>   <!-- §B.residual_risks -->
- **下一步**：<接手者第一个动作>       <!-- §B.next_steps -->
- **指针**（不重复既有产物，只写路径 / 命令）：
  - story: <stories/story-xxx.md>
  - 日志: <path>
  - diff / commit: <ref 或可复跑命令>
- **redact**：<已移除项，或「无敏感信息」>
- [可选] **建议能力 / playbook**：<cap-xxx / bmad-xxx>
```

### B.2 指针：不重复既有产物

- 交接包正文**只放指针**（路径 / URL / 可复跑命令），**禁止把既有产物（story、spec、ADR、日志、diff、评审记录）整段复制进来**——复制会产生第二真相源并迅速过期。
- 判据：交接包里出现「大段本可在既有产物查到的正文」即不合格；应改为一行指针。
- 票据状态**永远只在 `index.md`**；交接包不复制状态，只引用票据行。

### B.3 redact 清单（交接前移除 / 替换）

交接前逐项检查，命中即移除或替换为占位符（如 `<REDACTED:api-key>`）：

- **密钥 / 凭据**：API key、token、密码、私钥、带口令的连接串；
- **个人身份信息（PII）**：真实姓名、邮箱、电话、身份证 / 工号；
- **内部地址 / 敏感拓扑**：内网 IP、生产主机名、未公开的内部 URL；
- 其它按 Lead / 安全基线（`cap-security-baseline`）判定的敏感字段。

> 无敏感信息时，在交接包 redact 处**显式写「无敏感信息」**，不要留空——留空无法区分「已检查无」与「忘了查」。

### B.4 空字段可发现：占位符约定 + 收尾自检（确定性）

让「缺字段 / 缺 redact」可被**确定性发现**（零脚本，纯 grep）：

- **占位符约定**：未填的必填字段一律写可 grep 的 `TODO(handoff): <field>`，不得留空或写「待补」。
- **收尾自检**（交付前 / 接手前在交接包上跑）：
  - `grep -n "TODO(handoff)" <packet>` → **必须为空**（仍有输出 = 有必填字段未填，不得交付）；
  - 抽样核对五个关键字段齐全：改了什么 / 证据命令与结果 / 残余风险 / 下一步 / 指针；
  - 确认 redact 处**不是空白**（写了具体移除项或「无敏感信息」）；
  - 确认交接包正文**无「整段复制的既有产物」**（只有指针）。

### B.5 样例：一个 story 交接只填模板即含关键字段

```markdown
### 交接包 · story-038 · hephaestus-5 → reviewer
- **改了什么**：
  - capabilities/cap-task-coordination/references/handoff-contract.md — 新增 §B.1–B.5 结构化交接包（指针/redact/占位符）
  - playbooks/bmad-squad-protocol/SKILL.md — 加一行指针（不复述字段）
  - bmad-output/stories/story-038.md — 回填实现/验证、status→in_review
- **证据命令与结果**：
  - `node scripts/verify.mjs` → exit 0（VERIFY OK）
  - `node scripts/squad_validate.mjs bmad-output` → exit 0（SQUAD VALIDATE: OK）
- **残余风险**：纯文档改动、无运行时行为；未加 lint 脚本，改用 B.4 的 grep 占位符约定。
- **下一步**：评审者抽查五字段齐全、证据命令可复跑、协议里只有指针无字段复述。
- **指针**：
  - story: stories/story-038.md
  - diff: `git diff -- capabilities/cap-task-coordination/references/handoff-contract.md playbooks/bmad-squad-protocol/SKILL.md`
- **redact**：无敏感信息
- [可选] **建议能力 / playbook**：cap-code-review / bmad-squad-protocol
```

**判据（AC4）**：接手者只凭此包即可复跑证据命令并执行「下一步」，无需回读实现者上下文。

## C. 复核记录（review record，独立复核者填写）

```yaml
review_version: 1
handoff_unit: U1
reviewer: "<独立于实现者的角色>"
claims_checked:
  - claim: "<决定性 claim>"
    method: "<对 diff / 重跑 / grep / 大小比对>"
    outcome: match            # match | mismatch
verdict: accept               # accept | block
notes: "<mismatch 时写清差距：自述 vs 事实>"
```

**判定**：任一 `outcome: mismatch` → `verdict: block`，回退 worker 补做；全部 `match` 才 `accept`。样例见 `../evals/03-review-worker-claim-mismatch.json`。

## D. 与 Team 任务板的映射（可选）

- `scope`/`interface`/`acceptance_criteria` → 任务 `description` 的验收标准段；
- `writeScopes` → 共享任务的 `write_scopes`（派活前登记，冲突即可见）；
- `blocked_by` → 任务的 `blocked_by` 依赖；
- `handoff`/`review` 记录 → 任务完成前的 self-check 证据。
