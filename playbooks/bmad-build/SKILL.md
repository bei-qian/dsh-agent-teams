---
name: bmad-build
description: BMad 小队实现流程（Amelia）。端到端实现一个 story：计划、编码、测试、自检，更新 story 文件与 index.md，按 bmad-squad-protocol 落盘并过校验。
---
# 实现一个 story（Amelia）

## 何时用
拿到一个已验收标准清晰的 story，要把它做出来时。

## 先读
- story 文件：`bmad-output/stories/story-<nnn>.md`
- `bmad-output/architecture.md`、`bmad-output/prd.md`
- `bmad-output/index.md`

## 步骤
1. 读 story 与相关代码；确认范围，不擅自扩大。
2. 实现改动 + 写必要测试（沿用项目现有框架/风格）。
3. 实际跑测试/构建，确认通过；复核最终 diff。
4. 回填 story 文件的 `## 实现` 与 `## 验证`（写清命令与结果）。
5. 更新 `bmad-output/index.md` 该 story 的 status（进行中→done/review）。

## 规则
- 遇到要改现有调用方预期、或需多模块协调重设计：**停下报告 Lead**，不要硬做。
- 不 merge、不替人做发布决策。
- 不碰别人票据范围内的文件。

## 收尾
- 跑 Gate：`node <本技能目录>/../../scripts/squad_validate.mjs ./bmad-output`。
- 报告 Lead：改了什么、验证命令与结果、剩余风险。
