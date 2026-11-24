# Olympus Squad · 花名表（Glossary）

> 本表是人读层的唯一映射表：**机器层用职能词，人读层用神话**；**id 是地址，花名是称号**。
> 运行时真源：preset id 在 `cordis.patch.tmpl.yml` 的 `config.id`；花名只在 `persona/*.md`、`locale/*.json`、
> `presets/*/locale/*.json` 与 `playbooks/bmad-squad-protocol/SKILL.md` 的映射表里出现。

| 希腊花名 / call-sign | preset id | 上游 BMad 角色（仅来源说明） / upstream role (provenance only) | 座位职责 / seat | 希腊词义 / Greek sense |
|---|---|---|---|---|
| Hermes 赫尔墨斯 | `squad-lead` | （上游无对应，队长） | 调度：读票据、判断该谁上、把活分派出去，自己不实现 | 神使 / 引魂者（ψυχοπομπός）：在神与人之间传令、为亡魂引路——对应「在人与队员之间传递意图」 |
| Apollo 阿波罗 | `analyst` | Mary | 分析：调研、市场与竞品、brief、PRFAQ | 德尔斐神谕（μάντις）：先问、先验、把不确定说清楚——对应「先查清值不值得做」 |
| Prometheus 普罗米修斯 | `pm` | John | 产品：PRD 与各类规划文档、就绪度检查 | 先见（προ- + μῆτις「先思」）：把后果想在动手之前——对应「先写清目标与验收」 |
| Themis 忒弥斯 | `po` | Sofia | 票据：把输入变成票据需求、切 epic/story、维护票板 | 既定之序 / 神律（θέμις）：把约定固成可执行的秩序——对应「票据即规格」 |
| Ariadne 阿里阿德涅 | `ux` | Sally | 体验：DESIGN.md（外观）与 EXPERIENCE.md（行为） | 引路线团（μίτος）：给人一条走得出去的路——对应「状态、流程与无障碍」 |
| Athena 雅典娜 | `architect` | Winston | 架构：技术决策、架构脊（architecture spine）、ADR | 技艺与战略（τέχνη + βουλή）：定技、定策、定边界——对应「让各部分保持一致」 |
| Hephaestus 赫菲斯托斯 | `dev` | Amelia | 开发：端到端实现 story、写测试、评审、回顾 | 锻造（匠神）：把设计打成实物——对应「把 story 做出来」 |
| Argus 阿耳戈斯 | `tea` | Murat | 测试：测试策略、框架、自动化、发布门禁 | 百眼守望（Πανόπτης）：睁一百只眼看住每一处——对应「按风险布防、守发布门」 |
| Nemesis 涅墨西斯 | —（占位，无 preset） | reviewer | 评审：独立评审与「改动是否配得上声称」 | 度量 / 应得（νέμεσις）：给僭越者以应得的报应——对应「评审者 ≠ 实现者」；**用户明确「先不开」，只占位** |

## 为什么这样命名

1. **机器层用职能词，人读层用神话**。`squad-lead` / `analyst` / `pm` / `po` / `ux` / `architect` / `dev` / `tea`
   是**地址**：写在 `delegate_*` 的 `agentPreset`、`TEAM_PRESETS`、`client.js` 的成员过滤集里，被 `list_agents`
   寻址、被脚本断言。地址必须稳定、可预测、可 grep，且**绝不能**带品牌或神话名。
2. **花名可换，地址不动**。想换称谓只改 `persona/*.md` 的自称、`locale` 卡片文案与本表，**不用动**
   `cordis.patch.tmpl.yml`、`package.json`、门禁脚本，也不会让历史会话/任务板寻址失效。
3. **神话是「职责的隐喻」，不是装饰**。每个花名都对应这个座位真正的产出物（见上表「希腊词义」列）：
   Themis 定序 → 票据即规格；Ariadne 引线 → 状态与出路；Argus 百眼 → 测试布防。
4. **`squad-lead` 不叫裸 `lead`**：DSH 运行时的根 agent 就叫 `lead`，裸 `lead` 会让 `list_agents` 寻址混淆。
5. **`reviewer`/Nemesis 只占位**：用户明确「先不开」——不建 preset、不配工具、不进 `squad.roles.json`。
6. **方法来源如实标注**：小队的流程参考 BMad Method（MIT © BMad Code, LLC）；`BMad` 是其商标，
   故只用于「准确说明来源/兼容」，不作产品名（见 `ATTRIBUTION.md`、`LICENSE-BMAD-METHOD.txt`）。
