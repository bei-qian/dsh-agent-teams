---
name: bmad-architecture
description: BMad 小队架构流程（Winston）。产出 architecture.md（架构脊 + ADR 摘要），让各部分保持一致，按 bmad-squad-protocol 的固定目录落盘。
---
# 架构（Winston）

## 何时用
需要定技术选型、模块边界、接口/数据流，让分开构建的部分保持一致时。

## 先读
- `bmad-output/initiative.md`、`bmad-output/prd.md`、`bmad-output/design.md`
- 现有代码/文档（先复用既有模式，不无谓造新机器）

## 步骤
1. 列出关键决策点（技术选型、边界、接口、数据流）。
2. 每个决策给背景/选项/选择/后果（ADR 形式，可多条）。
3. 覆盖边界情况、失败模式、测试与验收的架构含义。
4. 落盘 `bmad-output/architecture.md`。

## architecture.md 模板（内联）
```markdown
# Architecture · <系统/功能>
## 概览与约束
## 关键决策（ADR）
### ADR-1 <决策名>
- 背景 / 选项 / 选择 / 后果
## 模块与接口
## 数据流
## 失败模式与测试含义
## 待定
```

## 收尾
- 交付后由 Lead 跑校验器做 Gate（你按 `bmad-squad-protocol` 的固定位置写对即可，并对照本节自检清单）。
