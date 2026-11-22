# Attribution / NOTICE — vendored 设计参照切片

本目录 `dsh-agent-teams/playbooks/bmad-ux/reference/` 内所有文件均为 **原样快照（snapshot）**，复制自本地仓库 `open-design`，正文未改写，仅用于 BMad 小队 UX 设计师（Sally）随取随读的**品牌无关设计参照**。

## 来源仓库与快照

| 项 | 值 |
|---|---|
| 来源仓库 | `open-design`（本地只读副本 `./open-design`） |
| 快照 commit | `e033aad1d1` (`e033aad1d15a9d4084316e5223f2c6597fd32619`) |
| 快照日期 | 2026-11-21 |
| 顶层许可 | Apache License 2.0 |
| 顶层版权 | `Copyright 2026 Open Design contributors` |

## 顶层许可：Apache-2.0（关键段，摘自 `open-design/LICENSE`）

```
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION
   ...
   Copyright 2026 Open Design contributors

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

完整 Apache-2.0 文本见来源仓库 `open-design/LICENSE`（201 行）。因该仓库为 Apache-2.0，vendored 目录据此分发；`craft/` 与 `design-systems/` 目录本身无独立 LICENSE，随顶层 Apache-2.0；但 `craft/` 正文另含下述 MIT 归属，需保留。

## `craft/` 正文：MIT（refero_skill）归属

`craft/` 全部正文改编自 **MIT** 许可的 `refero_skill` 项目。归属文字摘自 `open-design/craft/README.md`（原文保留于 `craft/README.md` 的 “Attribution” 段）：

> Craft content is adapted from the MIT-licensed
> [refero_skill](https://github.com/referodesign/refero_skill) project
> (© Refero Design), with edits to fit OpenDesign's house style and link
> back to OD's design tokens (`var(--accent)` etc.) instead of generic
> Tailwind hex values.

## 其他 MIT 内容

- `craft/` 全部 `.md`：见上，MIT（refero_skill，© Refero Design）。
- `design-templates/`（wireframe / prototype 蓝图）快照：来源仓库逐子目录自带许可中，相关 web/UX 模板为 MIT（见 `open-design-inventory.md` §6 核查记录）。本切片仅纳入 web/UX 蓝图，全部按原样快照保留。
- 其余 A/B 档内容（`design-systems/_schema/`、`docs/examples/DESIGN.sample.md`、`design-systems/default`、品牌 `DESIGN.md`）随顶层 Apache-2.0。

## 排除项（C 档，未纳入）

本次 vendoring **未纳入**任何 C 档资源：PPT/deck 模板、视频/音频/图片模板、`prompt-templates/`、`plugins/`、`apps/packages/shells/tools/e2e` 产品源码（仅点名复制的 `token-schema.ts` 除外）、产品 `docs/`（仅点名 `DESIGN.sample.md`）、85 个 stub 技能。详见同目录 `README.md`。

---
*快照锁定：日后如需上游更新，须以新的 commit/日期重抽，并同步更新本文件与 `README.md`。*
