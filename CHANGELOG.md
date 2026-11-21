# Changelog

## Unreleased (0.1.x)

- 零依赖 playbook 版：新增 `playbooks/`（协议 + 7 角色自包含技能），成员预设改扫 `playbooks/`（`includeDefaultRoots:false`）；完整 BMad 技能保留在 `skills/` 但不再启用。
- 确定性校验器 `scripts/squad_validate.mjs`（Node，零依赖）+ `examples/bmad-output/` 示例；阶段门由 Lead 执行。
- Lead 预设加 shell 以运行校验器；`scripts/verify.py` 与 CI 覆盖 playbook 与校验器。
- 修复：为 7 个成员预设补齐 `tool-fs-search.sampleOverCapGlobResults: false` 与 `tool-todo.allowParallelInProgress: true` 必填配置（与 Lead 预设一致），解决新版 DSH 下 `delegate_*` 因成员预设配置校验失败而无法拉起队员的问题；`cordis.patch.yml` 已按模板重新生成。

## 0.1.0 — 2026-11-21

- 初始版本：BMad 小队（1 名负责人 + 7 名 BMad 专家）作为 DSH agent 预设，构建在内置 Agent Teams 之上。
- 负责人用「一成员一个 `delegate_*` 工具」做零代码点名委派；成员共享任务板。
- 随包携带 BMad 技能（core-tools / method / tea，MIT），安装本插件即无需单独安装 BMad 技能。
- 显示元数据（locale en/zh、icon）；配置型 bundle，无 Host 代码。
