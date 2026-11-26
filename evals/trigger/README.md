# Trigger 契约 fixture（离线 · 确定性）

本目录是**仓库级 trigger 契约**的 fixture/文档，配合零依赖脚本 `../../scripts/check_skill_descriptions.mjs` 做**静态契约校验**。

- **不跑模型、不联网**：fixture 只描述「每个 skill 该/不该被哪些查询触发」的样本，供静态检查字段与覆盖；真实的 trigger-rate 采样（多跑取阈值、train/val）属人工/可选的未来方式，不在本 fixture 范围内。
- **覆盖集合**：`fixture.json` 的 `skills` 覆盖仓库全部 **20 个 skill**（13 playbook + 7 capability），与脚本从 `playbooks/*/SKILL.md`、`capabilities/*/SKILL.md` 得到的集合**必须相等**。
- **每条含正负例**：每个 skill 同时含 `should_trigger`（该命中）与 `should_not_trigger`（**near-miss 负例**：字面相近但本不该触发），缺一即校验失败。
- **shadows 排除**：`exempt` 数组列出 `shadows/` 的 6 个占位，`exempt:true` + `exempt_reason:"非 skill（issue-28 占位）"`，**不计入** 20 个必需 skill。

## 字段

| 字段 | 说明 |
|---|---|
| `id` | skill 目录名（kebab） |
| `type` | `playbook` \| `capability`（exempt 项为 `shadow`） |
| `trigger_surface` | playbook 取 `description`；capability 取 `whenToUse+metadata.triggers` |
| `should_trigger` | 应命中的查询样本（≥1） |
| `should_not_trigger` | near-miss 负例（≥1） |

## 运行

```bash
node dsh-olympus/scripts/check_skill_descriptions.mjs   # 全过 exit 0，违规则打印缺项 exit 1
```
