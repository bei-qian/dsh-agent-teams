---
name: bmad-build
description: Olympus Squad 实现流程（Hephaestus）。端到端实现一个 story：计划、编码、测试、自检，更新 story 文件与 index.md，按 bmad-squad-protocol 落盘并过校验。
---
# 实现一个 story（Hephaestus）

## 何时用
拿到一个已验收标准清晰的 story，要把它做出来时。

## 先读
- story 文件：`bmad-output/stories/story-<nnn>.md`
- `bmad-output/architecture.md`、`bmad-output/prd.md`
- `bmad-output/index.md`
- 后端设计规范速查表：`dsh-olympus/playbooks/bmad-build/reference/README.md`（43 条意图 / 何时用 / **何时别用** / 权衡 / 路径一页摘要）；要动手实现某模式时再深读 `reference/<类别>/<pattern>.md`。

## 步骤
1. 读 story 与相关代码；确认范围，不擅自扩大。
2. 实现改动 + 写必要测试（沿用项目现有框架/风格）。
3. 实际跑测试/构建，确认通过；复核最终 diff。
4. 回填 story 文件的 `## 实现` 与 `## 验证`（写清命令与结果）。
5. 更新 `bmad-output/index.md` 该 story 的 status（进行中→done/review）。

## 规则
- 做前端实现（HTML/CSS/客户端 JS）前，先按分类查 `modern-web-guidance` 技能的相关篇目（`guides/<category>/<slug>.md`）。
- 做后端实现前，先按本 SKILL 的「**后端设计规范**」过一遍原则层与决策表；需要深读某模式时按 `reference/<类别>/<pattern>.md` 打开全文（索引见 `reference/README.md`）。
- 遇到要改现有调用方预期、或需多模块协调重设计：**停下报告 Lead**，不要硬做。
- 不 merge、不替人做发布决策。
- 不碰别人票据范围内的文件。
- **遵循架构的安全 / 非功能决策**：动手实现前逐条通读 `bmad-output/architecture.md` 中与本 story 相关的安全 / 非功能 ADR，并在代码中逐条落实；实现前按架构安全 ADR + `cap-security-baseline` 的约束补确定性回归测试。确定性安全测试的具体门类（失败路径一致性、配置 / 输入边界、启动期不变量等）以 `cap-security-baseline` 为准，不在此重复。

## 后端设计规范（取自 java-design-patterns 精选）

> 本规范把 `reference/`（vendored 的 `iluwatar/java-design-patterns` 精选 43 篇）蒸馏成**可执行、可核对**的硬规则：先过原则层 → 按决策表查「问题→模式→参照路径」→ 过反模式警戒 → 遵循示例栈约定 → 守住与架构层的边界。**不是复述模式名，而是回答「该不该用、不用会怎样」。**

### a) 原则层（放最前，先做最简）

**先做能跑的最简方案，模式只在确有可扩展需求时才引入。** 直接引用仓库根 `README.md` 原话：

> "All designs should be as simple as possible. You should start with **KISS, YAGNI, and Do The Simplest Thing That Could Possibly Work** principles. Complexity and patterns should only be introduced when they are needed for practical extensibility."

- **KISS**（保持简单）：能简单就别复杂，能用语言/框架内置能力就别自造机制。
- **YAGNI**（你不会需要它）：不为「以后可能」埋抽象；只为「已可预见的变化」付复杂度。
- **DRY**（不重复自己）：重复的是**知识与规则**才消除；三行相似的样板不必强抽（错误的抽象比重复更难改）。
- **SOLID**：单一职责、开闭、里氏替换、接口隔离、依赖倒置——用来**判断边界是否健康**，不是用来堆类。

**硬性判定（不过就不加）：**

1. **引入任何模式前，先回答「不加它会出什么问题」；答不出具体问题，就不加**（YAGNI 闸门）。
2. **三个相似的 `if/switch` 不是抽象的理由，需求的变化方向才是**：只有当「变化维度已可预见且会独立变化」时才引入策略/工厂等抽象；否则直接写清楚的分支更可读。
3. **先写最小的能跑实现 + 测试；复杂度是挣来的，不是默认的。** 若一个月后仍无第二种实现/无变化压力，当前的简单版本就是正确答案。

### b) 「何时该用 · 何时别用」决策表（问题 → 模式 → 参照路径）

> 用法：实现时**先查这张表**。左列是你遇到的场景/问题，中列给出推荐模式与 `reference/<类别>/<pattern>.md` 全文路径，右列是**同等分量的「何时别用」**——它是本规范反过度设计的灵魂，**满足「推荐」条件但同时命中「别用」条件时，以「别用」为准，先回到 a) 原则层**。共覆盖 **43 个模式（架构 7 + 并发 5 + 数据访问 6 + 韧性 6 + 集成 4 + 消息 5 + GoF 核心 10）**。

#### 1. 架构（7）

| 你遇到的场景 / 问题 | 推荐模式 | 参照路径 | 何时**别**用 |
|---|---|---|---|
| 需要表现/应用/领域/基础设施分层，改动不跨层扩散 | Layered Architecture | `reference/架构/layered-architecture.md` | 层次简单或团队不守边界、无需技术栈隔离的小工具 → 多一层治理只是负担 |
| 要让领域逻辑与 DB/UI/第三方解耦、适配器可替换、便于单测 | Hexagonal Architecture | `reference/架构/hexagonal-architecture.md` | 简单应用 → 平添端口/适配器抽象层，属过度设计 |
| 大型应用要清晰层边界、领域独立于框架、依赖倒置 | Clean Architecture | `reference/架构/clean-architecture.md` | 小项目 → 严格同心圆分层是过度设计，初始复杂度高 |
| 需应用服务编排用例、划分事务边界、隔离领域与接口层 | Service Layer | `reference/架构/service-layer.md` | 业务极简（纯 CRUD）→ 多一层即多一跳，无复杂用例可编排 |
| 业务规则复杂、需数据与行为合一的富领域对象 | Domain Model | `reference/架构/domain-model.md` | 简单 CRUD / 以数据为主的应用 → 富模型是过度设计 |
| 读写负载/模型差异大，需命令与查询各自优化 | CQRS | `reference/架构/command-query-responsibility-segregation.md` | 简单单体、读写同构 → 引入读写同步复杂度，过度设计 |
| 需完整审计/历史回放、由事件重建任意时点状态 | Event Sourcing | `reference/架构/event-sourcing.md` | 无审计/回溯需求、团队无事件建模与版本治理能力 → 慎用（维护复杂） |

#### 2. 并发（5）

| 你遇到的场景 / 问题 | 推荐模式 | 参照路径 | 何时**别**用 |
|---|---|---|---|
| 大量短时独立任务、需限并发防资源耗尽、复用线程 | Thread Pool Executor | `reference/并发/thread-pool-executor.md` | 任务极长且数量少、或任务间强依赖 → 线程池无益甚至饥饿 |
| 生产与消费速率不匹配需缓冲、需解耦二者 | Producer-Consumer | `reference/并发/producer-consumer.md` | 单线程或读写本就同步的简单流程 → 队列徒增同步复杂度 |
| 任务无需立即完成、IO/网络/重计算耗时、需非阻塞 | Async Method Invocation | `reference/并发/async-method-invocation.md` | 后续步骤强依赖该结果（必须同步）、异常/资源难管理 → 别异步 |
| 需异步处理且不阻塞主线程、模块化并发管理 | Active Object | `reference/并发/active-object.md` | 简单并发（线程池/异步调用即可）→ 消息传递开销得不偿失 |
| 数据高速产生、消费者有过载风险、需向上游流控保稳定 | Backpressure | `reference/并发/backpressure.md` | 生产速率本就可控、消费者无过载风险 → 无需引入流控复杂度 |

#### 3. 数据访问（6）

| 你遇到的场景 / 问题 | 推荐模式 | 参照路径 | 何时**别**用 |
|---|---|---|---|
| 需解耦业务与数据访问、可能多数据源、需 mock 便于测试 | Repository | `reference/数据访问/repository.md` | 简单 CRUD / 报表查询 → 直接用 DAO/查询即可，多一层抽象 |
| 领域对象与库表结构不一致、需双向映射保持领域纯净、用 ORM | Data Mapper | `reference/数据访问/data-mapper.md` | 领域对象与表几乎同构的简单场景 → 映射层纯属负担 |
| 一次业务多次写须作单事务、跟踪脏对象批量提交 | Unit of Work | `reference/数据访问/unit-of-work.md` | 单表单写 → 事务注解足够，无需工作单元 |
| 跨层/跨进程传输需聚合数据、减少网络调用、批量处理 | Data Transfer Object | `reference/数据访问/data-transfer-object.md` | 同进程紧耦合的简单传参 → 额外 DTO 只冗余、易致贫血模型 |
| 多事务并发改同一数据但冲突概率低、需避免长锁 | Optimistic Offline Lock | `reference/数据访问/optimistic-offline-lock.md` | 高冲突、频繁碰撞 → 乐观锁大量重试，应改悲观锁/队列 |
| 单库容量/吞吐成瓶颈、需按分片键水平扩展 | Sharding | `reference/数据访问/sharding.md` | 数据未超单库、跨分片查询多、无运维能力 → 分片反而更复杂 |

#### 4. 韧性（6）

| 你遇到的场景 / 问题 | 推荐模式 | 参照路径 | 何时**别**用 |
|---|---|---|---|
| 下游故障需快速失败、防反复失败与级联雪崩、依赖第三方/DB 可能变慢 | Circuit Breaker | `reference/韧性/circuit-breaker.md` | 单体内无远程调用、故障非瞬时 → 应先修根因，熔断无意义 |
| 操作可能瞬时失败（网络/连接/外部服务）、重试成本低 | Retry | `reference/韧性/retry.md` | 非幂等操作盲目重试（先做幂等/补偿）、失败是持续性而非瞬时 |
| 依赖经网络易故障、返回默认/缓存值优于整体失败、UI 需可用 | Fallback | `reference/韧性/fallback.md` | 兜底数据不可接受（强一致/强正确性场景）→ 降级会误导用户 |
| 服务调用多个下游、需保护关键请求容量、怕被单一依赖拖垮 | Bulkhead | `reference/韧性/microservices-bulkhead.md` | 下游单一且无隔离诉求、资源紧张 → 隔离让整体利用率下降 |
| 容量可测但流量会超限、延迟比吞吐更重要、需保护核心流程 | Load Shedding | `reference/韧性/microservices-load-shedding.md` | 流量稳定不超容量、调用方无法处理拒绝（不能重试/降级）→ 不宜 |
| 事务跨多个微服务、需跨服务最终一致不用 2PC、长事务异步 | Saga | `reference/韧性/saga.md` | 可接受最终一致且无跨服务事务、或事务本可收敛到单服务 → 不必引入 |

#### 5. 集成（4）

| 你遇到的场景 / 问题 | 推荐模式 | 参照路径 | 何时**别**用 |
|---|---|---|---|
| 微服务群需统一入口、路由/聚合结果、集中鉴权限流 | API Gateway | `reference/集成/microservices-api-gateway.md` | 服务很少 / 简单直连即可 → 网关反成单点与额外跳 |
| 需为远端服务在本地放代理、处理监控/日志/路由/重试等旁路逻辑 | Ambassador | `reference/集成/ambassador.md` | 简单直连、无跨切面旁路需求 → 多一跳多一层只增开销 |
| 多阶段迁移新旧系统并存、子系统语义不同、集成遗留怕污染领域 | Anti-Corruption Layer | `reference/集成/anti-corruption-layer.md` | 一次性小对接、语义本可对齐 → 薄适配器足够，完整防腐层过重 |
| 不同客户端（Web/移动/桌面）需不同形状/粒度/聚合、共享 API 堆满分支 | Backends for Frontends | `reference/集成/backends-for-frontends.md` | 客户端类型单一、需求一致 → 多套 BFF 只会重复建设与多跳 |

#### 6. 消息（5）

| 你遇到的场景 / 问题 | 推荐模式 | 参照路径 | 何时**别**用 |
|---|---|---|---|
| 一个事件需通知多个互不关心的消费者、需松耦合可扩展异步 | Publish-Subscribe | `reference/消息/publish-subscribe.md` | 只有单一消费者、需强同步强一致且基础设施不可靠 → 延迟与一致性难保 |
| 多事件源与处理器、需解耦事件产生与处理、集中事件管理 | Event Aggregator | `reference/消息/event-aggregator.md` | 事件源/处理器少且简单直连即可 → 聚合器反成复杂中心节点 |
| 多组件需共享数据但不宜直接耦合、事件驱动信息流、跨环境部署 | Data Bus | `reference/消息/data-bus.md` | 组件少且关系固定、可直连 → 总线徒增复杂度与延迟 |
| 消息可能因网络/重试重复到达、需保状态一致、水平扩展无状态消费 | Idempotent Consumer | `reference/消息/microservices-idempotent-consumer.md` | 消费端天然幂等（如置位操作）且无重复投递风险 → 无需去重表等额外开销 |
| 需更新库并可靠发消息无丢失/无双写不一致、不愿用 XA/2PC | Transactional Outbox | `reference/消息/transactional-outbox.md` | 可容忍最终一致且允许丢消息、无需可靠发事件 → 简化即可 |

#### 7. GoF 核心（10）

| 你遇到的场景 / 问题 | 推荐模式 | 参照路径 | 何时**别**用 |
|---|---|---|---|
| 类无法预知要创建的对象类、需由子类决定实例化哪个 | Factory Method | `reference/gof/factory-method.md` | 产品类型固定单一、无需延迟到子类决定 → 构造器/静态工厂即可 |
| 需创建一系列相关/依赖的产品族、可切换产品族、只暴露接口 | Abstract Factory | `reference/gof/abstract-factory.md` | 只有单一产品族、未来不预期增加族 → 抽象工厂是过度设计 |
| 构造参数多/步骤多、需分步构建不可变对象 | Builder | `reference/gof/builder.md` | 参数少（<4）且不常变 → 构造器/静态工厂足够，builder 徒增类与内存 |
| 确需全局唯一实例（配置/连接池）且需众所周知访问点 | Singleton | `reference/gof/singleton.md` | 能用依赖注入/容器托管时优先 DI → 别用单例（全局状态难测） |
| 想复用接口不匹配的现有类、包装遗留/第三方 API 做中间层 | Adapter | `reference/gof/adapter.md` | 接口本可对齐 / 可改源码 → 直接改比套适配器更简单 |
| 需不改原类动态叠加职责、职责可撤销、继承会爆炸 | Decorator | `reference/gof/decorator.md` | 职责固定、一次装配即可 → 用继承/组合更直观，滥用生大量小类 |
| 需为复杂子系统提供简单统一入口、降低依赖提升可读性 | Facade | `reference/gof/facade.md` | 子系统本就简单、或门面会膨胀成耦合所有类的上帝对象 → 不宜 |
| 算法可运行时切换、多个类仅行为不同、大量条件分支选行为 | Strategy | `reference/gof/strategy.md` | 只有一种实现、未来不预期扩展 → 直接写死即可（策略是过度设计） |
| 状态变化需通知多个数量未知的订阅者、需松耦合 | Observer | `reference/gof/observer.md` | 订阅关系固定、通知强顺序/强一致要求 → 顺序不确定易出问题 |
| 需把请求封装成对象（可排队/延迟/撤销/记录/日志重放） | Command | `reference/gof/command.md` | 简单直接调用即可、无排队/撤销/记录需求 → 为每个命令建类徒增类数 |

### c) 反模式 / 过度设计警戒清单（提交前逐条勾）

> 灵魂：**模式的默认答案往往是「不用」**。以下任一条不满足，就不要提交或先回退到更简单的实现。

- [ ] **不为模式引入无关依赖**：不为了套某个模式而拉入额外的复杂框架/库（unnecessary external dependencies）。
- [ ] **不把业务逻辑塞进模式**：模式只承载其核心机制，别让无关业务逻辑污染（distracts from the core mechanism）。
- [ ] **无测试不提交**：新增模式/功能必须配相应的单元测试；没有测试的实现不算完成。
- [ ] **避免巨型包**：每个关注点独立、边界清晰，不把所有东西堆进一个大而全的 package/module。
- [ ] **不为「炫技」加抽象（YAGNI）**：抽象层 / 接口 / 工厂只为「可预见的变化」而建，不为「以后可能」。
- [ ] **不制造上帝类 / 深继承**：优先组合（decorator/strategy）而非继承爆炸；单类职责收敛。
- [ ] **不重复造轮子**：已有框架能力（Spring 事务、Resilience4j、连接池等）优先于手写模式实现。
- [ ] **不引入与团队规模不匹配的分布式复杂度**：微服务 / 事件溯源 / saga 需配套的运维与一致性兜底，规模不够就别上。

### d) Java 示例栈约定（**示例层、非强制**）

> **明确声明：以下是「以 Java 举例」的示例约定，规范表述语言无关。** 参照库保留 Java 示例只为方便照抄；**换 Kotlin / Go / TypeScript 等时只换示例，本规范的条款（原则层 a、决策表 b、警戒 c、边界 e）一律不变。**

- **示例技术栈**：Java 21 / JUnit 5 / Mockito / Lombok / Spotless（Google Java Format）。
- **结构约定**：每个模式独立包/module、有意义命名（类/接口/方法见名知意）、必备单元测试。
- **性质**：这些取自上游仓库 `AGENTS.md` 的 Stack/Structure，仅作「若用 Java 实现，照此示范」；**不是强制技术栈**，不得据此把团队技术选型钉死。

### e) 与 bmad-architecture 的边界（重叠只维护一处）

- **模式「选型 / 架构决策」归 Athena（`bmad-architecture`）**：架构文档回答「**是否**选某模式、**为何**选、边界与取舍」（ADR 级决策）。
- **模式「落地实现」归 Hephaestus（`bmad-build`）**：实现时按本 SKILL 的决策表 + 参照库写代码与测试。
- **重叠处只维护一处**：可操作的「问题→模式→参照路径」决策表 + 硬规则**只写在本 SKILL（`bmad-build/SKILL.md`）**；`bmad-architecture/SKILL.md` 只加一条「模式选型」交叉引用（指向本决策表与 `reference/`），**不复制规则**。这样选型只有一处真相、实现只有一处真相，避免双维护漂移。

## 收尾
- 跑 Gate：按 `bmad-squad-protocol` 阶段门跑校验器。
- 报告 Lead：改了什么、验证命令与结果、剩余风险。
