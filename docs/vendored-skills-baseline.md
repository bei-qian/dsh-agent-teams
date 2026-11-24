# vendored skills baseline — issue #16 删前快照

> 本文件在删除仓库内 `skills/` 副本**之前**生成，作为「当初对齐的是哪个上游 + 每个 vendored 目录对应上游哪个路径」的锚点。
> `docs/` 不在 `package.json#files` 内 → **不随包分发**，仅留仓库。

## pins（本机 clone 的对照基线；**≠ 已证快照来源**，未做逐文件 diff/bisect）

- `BMAD-METHOD` @ `e435a22574fe55722841086e5566420178b98df3`
- `bmad-method-test-architecture-enterprise` (TEA) @ `85fda574351f34c4f3ec2f9611b642c64b8601a0`
- 删除执行日期：2026-11-24（本机执行日；如需以发布/合并日为准请维护者复核）
- **快照规模（删前实测，2026-11-24）**：38 dirs / **653** git 跟踪文件 / **6.9M**；`npm pack` 产物 **458 文件 / tarball 1,159,575 B / 解包 3,497,549 B**（删目录前后一致；`skills` 从未进包）
- **整树摘要**：`sha256(list of "<sha256>\t<path>", sorted by path)` = `5f9f12bfa401877ca75a5f4b7948df103fcc44f54ed06e99ed38c65f52068811`

> ⚠️ 说明：issue 规格 §5.3 示例里 TEA pin 写的是 `a2819f62…`；本机 TEA clone 的 `HEAD` 已前进到 `85fda574351f34c4f3ec2f9611b642c64b8601a0`（`a2819f62` 仍是其历史祖先，`git cat-file -t` 为 commit）。此处记录**实际 clone HEAD** 作为对照基线，未 bisect 反推真实快照来源。

## 38 → 上游路径映射（TSV：dir<TAB>upstream_repo<TAB>upstream_path<TAB>SKILL.md_sha256）

```
dir	upstream_repo	upstream_path	SKILL.md_sha256
bmad	BMAD-METHOD	skills/core-tools/bmad	a2740b6080a7b79a5a854d7c1261d029e126d19794c4d7038898264f43f1fa64
bmad-advanced-elicitation	BMAD-METHOD	skills/core-tools/bmad-advanced-elicitation	865e4a63e0c0d8e742139c413cc52fc47193da13fe96e4ccac5dd55a53b7343b
bmad-agent-analyst	BMAD-METHOD	skills/method/bmad-agent-analyst	43c2ac1dc0697ef31a259db5cbbbafd32b0276bf05fd633dd3b42a8a0a087096
bmad-agent-architect	BMAD-METHOD	skills/method/bmad-agent-architect	cab16bd4223f626e914da039bf5597b8dc34c0922e5df1189addd00ebde4e256
bmad-agent-dev	BMAD-METHOD	skills/method/bmad-agent-dev	72691e13785fe32fc937bf570d1f00b4541f1c650136cc3a4cc3c75a3688d481
bmad-agent-pm	BMAD-METHOD	skills/method/bmad-agent-pm	dc71f430483af5d515741f56fab93db1f3993c26993ad180b1b75ff01a870773
bmad-agent-po	BMAD-METHOD	skills/method/bmad-agent-po	b6d14b60fc74c72456a58fa8caad417052fd371877567930d2c23758798271c2
bmad-agent-ux-designer	BMAD-METHOD	skills/method/bmad-agent-ux-designer	0c295c2fd79b41627c3567c91fe3e44872b25b11983c2509d004134d6dac3a43
bmad-architecture	BMAD-METHOD	skills/method/bmad-architecture	10575dcd650f1602df50137589fb0781fb615bb1418f8af98ab1f123d50b248a
bmad-brainstorming	BMAD-METHOD	skills/core-tools/bmad-brainstorming	26bc84494a4d177dde70557ef224cd10cb6a0a7a43d31ab16563c25e607680da
bmad-build	BMAD-METHOD	skills/method/bmad-build	4c19bb23bfedc541df60f100e5333e22d62aff5dbec5cd72d52a8454e7aba228
bmad-build-auto	BMAD-METHOD	skills/method/bmad-build-auto	2176e57a1d834e2e8749582ce8e5498ade1ec3e9b9af891809e5c6247e8296fd
bmad-code-review	BMAD-METHOD	skills/method/bmad-code-review	d5af4c76e1dcb7e664a9db25d1a111e8d74b58ffc1ace01a00b08935db685eea
bmad-customize	BMAD-METHOD	skills/core-tools/bmad-customize	7335ce164dac2ec92919a923877f4683af8300187051b20da79ab0937ba0bcfa
bmad-deep-recon	BMAD-METHOD	skills/core-tools/bmad-deep-recon	f5360d92576908b91ce97c1bb75577c4cd724d0dcefaf20dd3b460c5a738507b
bmad-facilitate	BMAD-METHOD	skills/core-tools/bmad-facilitate	ba719e2fc6cb36d1f6cf3cb8cea4abffacaf7f4fbbf6acf781a7fd7419a50102
bmad-forge-idea	BMAD-METHOD	skills/core-tools/bmad-forge-idea	1de8258c9c493b8042de761e96fe150590e8c09d5e5bc5aec8d7da447f50bd02
bmad-ingest	BMAD-METHOD	skills/core-tools/bmad-ingest	5544f163278a3fcad811e86216d5ebdb29866045e9c84930c14d69e4ad67c49b
bmad-party-mode	BMAD-METHOD	skills/core-tools/bmad-party-mode	a29ab2937b2f80e28f32ac49aeb63cb8cf3ccac39240b7809acce0c39902a9d6
bmad-project-context	BMAD-METHOD	skills/method/bmad-project-context	2fc53a5a9639c832a65673dd9b16ecba4c70739054cad54f15c277e3295490d9
bmad-qa-generate-e2e-tests	BMAD-METHOD	skills/method/bmad-qa-generate-e2e-tests	6b772205d7a82a49cf4cdbf0913b6859f1d023e8834a70d10050ffad95eaa60a
bmad-retrospective	BMAD-METHOD	skills/method/bmad-retrospective	3084226f532486a284bb7cd9125a531cfb5f3088b17c9fa1557795b6ea3277d2
bmad-review	BMAD-METHOD	skills/core-tools/bmad-review	c5fa7bc6342fc4da84549c9fddcce04313c210863613724e2c44aeee0089e9cc
bmad-shard-pro	BMAD-METHOD	skills/core-tools/bmad-shard-pro	71587b406b4f71380bf2b7d14a2f1d76d08bec260d5c39c085f72a395bf46451
bmad-tea	TEA-REPO	skills/bmad-tea	cf7f77c4cb7dd1c2e75567d68e697af75c7e59a0949588ef193c11a12b5047c3
bmad-tea-automate	TEA-REPO	skills/bmad-tea-automate	a2ef2f632861d2d814e3c8cc99a1864e2882f736eeaf3cfaa19725cd77adf0b9
bmad-tea-evaluate	TEA-REPO	skills/bmad-tea-evaluate	a6370c30c879541f663128dd915f3f274deec06b447759fb5213a5882341c0ea
bmad-tea-framework	TEA-REPO	skills/bmad-tea-framework	e957906cf4c5e3ee0f8bd20544f152683935bea0faab2a9d6b2769328bc255b8
bmad-tea-nfr	TEA-REPO	skills/bmad-tea-nfr	7d2ac9c16141657ddf918b8c64b3917b0321d53876aef7b50f68500b6c1fdddf
bmad-tea-teach-me-testing	TEA-REPO	skills/bmad-tea-teach-me-testing	b52a8b9012cd8637f24165f3fa11817d49b3f675dffead48511716bff5f1376c
bmad-tea-test-design	TEA-REPO	skills/bmad-tea-test-design	9edf7daa284da624820bbd2fff6d614f31b74c500328e64153687368fa9e6325
bmad-tea-test-review	TEA-REPO	skills/bmad-tea-test-review	d38718fd4d8354ee5a0b8ab6243e570612189eab9057a3683be2f0f9b12b9a90
bmad-tea-trace	TEA-REPO	skills/bmad-tea-trace	78686bf60a8956dc30bb82950b68fb2edd97cf4d0cf7c751c6660ea8d44fa15a
bmad-ux	BMAD-METHOD	skills/method/bmad-ux	7d343199346bbecaad3b2d2aa7591cee8f84a43af126d9ce796e43191745698a
bmad-walkthrough	BMAD-METHOD	skills/method/bmad-walkthrough	c28fad6ab0ca63cb6b0b00e326dbfd49540d5dd7154ea21216bda66a73a3aacb
bmod-core-tools	BMAD-METHOD	skills/core-tools/bmod-core-tools	9392dc6f150da22ba00c7ecbb25a109073128a63f218d720edb44074ec2a7109
bmod-method	BMAD-METHOD	skills/method/bmod-method	3200579fbff4a77543d9471658bfbf86193ff7274efab3af3c935056acecaa14
bmod-tea	TEA-REPO	skills/bmod-tea	9c32b8f48d6f6b33ccbd9a3fac89ab43471f1c1a2ecf1e7a9e4039dcb82b4a0d
```

映射口径：`BMAD-METHOD` = `skills/<category>/<name>/SKILL.md`（core-tools/method 两个分类）；`TEA-REPO` = `bmad-method-test-architecture-enterprise` 的扁平 `skills/<name>/SKILL.md`。以上 38/38 全部由本机两仓 `ls` 实匹配、无 UNMAPPED。
