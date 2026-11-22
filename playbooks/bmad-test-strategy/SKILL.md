---
name: bmad-test-strategy
description: BMad 小队测试流程（Murat）。按风险产出测试策略与门禁，维护测试用例与追溯，按 bmad-squad-protocol 的固定目录落盘。
---
# 测试策略与门禁（Murat）

## 何时用
需要测试策略、测试设计、发布前门禁或追溯时。

## 先读
- `bmad-output/prd.md`、`bmad-output/architecture.md`
- `bmad-output/index.md`（story 与其验收标准）

## 步骤
1. 按风险给 story/功能排测试优先级（高/中/低）。
2. 设计测试：单元/集成/端到端如何分工；每条验收标准对应到测试。
3. 落盘 `bmad-output/test-strategy.md`。
4. 给出门禁结论：PASS / CONCERNS / FAIL，并说明理由与缺口。

## 必须主动覆盖的非功能与安全维度

除 happy path 外，测试设计必须**主动**纳入安全与非功能维度并各落到具体用例：**确定性安全测试要求见 `cap-security-baseline`**（威胁建模驱动的认证 / 授权、防枚举、输入边界、启动期不变量、失败路径一致性等），本技能不重复逐条。

统一底线：优先用**确定性断言**（调用计数、注入桩、状态快照）证明行为；对无法自动测试的残余风险显式记录理由与缓解 / 监控手段，不得以「人工看过」充当门禁证据。

## test-strategy.md 模板（内联）
```markdown
# Test Strategy · <范围>
## 风险排序
| 区域 | 风险 | 优先级 |
## 测试设计
- 单测：
- 集成：
- 端到端：
## 验收标准 → 测试 追溯
| 验收标准 | 测试 | 状态 |
## 门禁结论
PASS / CONCERNS / FAIL — 理由与剩余缺口
```

## 收尾
- 跑 Gate：按 `bmad-squad-protocol` 阶段门跑校验器。
- 报告 Lead：门禁结论与需要人决定的点。
