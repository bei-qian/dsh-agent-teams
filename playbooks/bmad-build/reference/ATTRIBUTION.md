# Attribution / NOTICE — vendored 后端模式参照切片

本目录 `dsh-olympus/playbooks/bmad-build/reference/` 内的全部模式 README 均为 **原样快照（snapshot）**，逐篇 `cp` 自本地只读仓库 `./java-design-patterns`，**正文未改写、未删节**（README 顶部 YAML frontmatter 一并保留）。仅用于 BMad 小队开发者（Hephaestus）随取随读的后端设计参照库。

## 来源仓库与快照

| 项 | 值 |
|---|---|
| 来源仓库 | [`iluwatar/java-design-patterns`](https://github.com/iluwatar/java-design-patterns)（本地只读副本 `./java-design-patterns`） |
| 快照 commit | `4cabb204f240240bea319605a5ffa46ded728001` |
| 快照日期 | 2026-11-22 |
| 许可 | MIT |
| 版权 | © 2014-2024 Ilkka Seppälä |

> 快照锁定：日后如需上游更新，须以新的 commit/日期重抽，并同步更新本文件与 `README.md`。

## 许可全文：MIT（摘自 `java-design-patterns/LICENSE.md`）

```
The MIT License (MIT)

Copyright © 2014-2024 Ilkka Seppälä

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

上游仓库许可全文另见 `java-design-patterns/LICENSE.md`（同一 MIT 文本；文件末尾另有一段说明「Module Model-view-viewmodel is using ZK framework（LGPL）」属该特定模块的依赖声明，不改变本仓库整体 MIT 口径，也不在本次 vendoring 范围内）。

## 逐篇归属

每个 vendored 模式 README 的原始 `## References and Credits`（或 `## References`）段落**保留在各自文件内**，未删改，指向该模式的原始出处与作者。版权与许可归属统一以上述来源仓库为准，各文件内不再重复声明。

## 未纳入（C 档与 localization）

本次 vendoring **只收 A 档 43 篇**后端模式 README，按「架构 / 并发 / 数据访问 / 韧性 / 集成 / 消息 / gof」7 类分目录存放。未纳入：

- **C 档**（纯前端表现层/游戏运行时/UI 测试：`model-view-controller`、`model-view-viewmodel`、`model-view-presenter`、`model-view-intent`、`bloc`、`flux`、`presentation-model`、`view-helper`、`front-controller`、`page-controller`、`templateview`、`composite-view`、`component`(ECS)、`game-loop`、`page-object` 等）。
- `localization/` 译文目录（310 篇非英文译本）。
- 其余 B 档模式正文（仅在 `README.md` 索引中以一行摘要出现，指向上游深读）。
- README 中指向 `./etc/*.png` 等相对图片的链接（因仅 vendor 正文、不复制图，故失效——见 `README.md` 说明，属可接受快照取舍）。
