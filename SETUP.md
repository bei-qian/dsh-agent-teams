# SETUP · 安装与使用 BMad 小队插件

本插件是一个 **配置型 DSH bundle**：不包含 Host 代码，安装后只新增若干「agent 预设」。
它复用 DSH 内置的 Agent Teams（共享任务板 + 子代理），所以你需要：

- 一个能运行 DeepSeek Harness 的 profile（本机默认 `desktop`）；
- 已在项目里装好 BMad 技能（可选，用于让成员能加载 `bmad-*` 技能；不影响预设本身工作）。

## 安装

1. 生成/更新 `cordis.patch.yml`（模板改动后需要重跑）：
   ```bash
   cd dsh-agent-teams
   python3 scripts/build_patch.py
   ```
2. 让 agent 用 `plugin_manager` 安装本目录（绝对路径）：
   ```
   install_bundle  target = /absolute/path/to/dsh-agent-teams
   ```
   或在 Web 的 **Plugins → Add plugin → 选择本地目录** 安装本目录。
3. 安装后在 **Plugins** 列表里应能看到 8 个预设行：`preset-bmad-squad-lead` 及
   `preset-bmad-analyst/-pm/-po/-ux/-architect/-dev/-tea`，状态为已激活。

## 使用一支小队

1. 新建一个会话，在 **模型/推理菜单** 里选预设 **「BMad 小队 · 调度」**（即 `bmad-squad-lead`）。
2. 在同一菜单里打开 **「Use Agent Teams / 启用 agent 协作」**（小队共享任务板需要）。
3. 直接把一段工作发给它，例如：
   > 帮我做一个「周报自动汇总」的小功能：先调研可行性，再出个 PRD，然后实现并加测试。
   负责人会按「分析→规划→实现→验证」把它分派给 Mary / John / Amelia 等成员，
   成员在各自子代理里干活，完成后回报，负责人在合适时机交回结果。
4. 会话头部的 **子代理/共享任务** 面板可看到成员与任务进度。

## 注意

- **只装预设、不改 profile 选择**：成员预设也会出现在预设选择器里（DSH 无法隐藏预设行），
  它们的描述都标了「供小队成员使用」。单独选用某个成员预设，等于只召唤那一个专家，也可用。
- **Team 模式按会话开关**：不开 Team 模式也能委派，但共享任务板工具不会出现。
- **成员共享同一工作区**：多人并行写同一批文件会互相覆盖；让负责人在任务上登记写入范围，或改为串行。
- **零依赖 playbook（默认启用）**：成员预设 `skill-filesystem.customSkillDirs` 指向插件内 `playbooks/`，
  每个角色一份自包含 `SKILL.md`，固定写到工作区 `bmad-output/`（`index.md` 当票据真相）；**不需要** Python/uv/`_bmad`。
  **校验器** `scripts/squad_validate.mjs`（Node，零依赖）在每个阶段门由 **Lead** 执行（dev/tea 可自行执行）：
  `node scripts/squad_validate.mjs ./bmad-output`，退出码 0/1 决定能否继续。
  仓库仍保留完整 BMad 技能于 `skills/`（**未启用**，可日后参考或回退；不需要可删）。
  来源与许可见 `ATTRIBUTION.md`（MIT © 2025 BMad Code, LLC）。

## 卸载

在 **Plugins** 里移除 `dsh-agent-teams` bundle，或在 profile 的 `cordis.patch.yml` 中删除对应插入即可。
