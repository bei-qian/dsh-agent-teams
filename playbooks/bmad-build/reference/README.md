# bmad-build/reference — Amelia 后端模式参照库（vendored 快照）

本目录是 BMad 小队开发者（Amelia）的**后端设计模式参照库**，按方案③「混合」从 `java-design-patterns` 原样快照（vendoring）而来。Amelia 实现 story 时按需深读全文，日常用本索引速查「这问题该不该用该模式」。

- **来源仓库**：[`iluwatar/java-design-patterns`](https://github.com/iluwatar/java-design-patterns)（本地只读副本 `./java-design-patterns`）
- **快照 commit**：`4cabb204f240240bea319605a5ffa46ded728001`
- **快照日期**：2026-11-22　**许可**：MIT（© 2014-2024 Ilkka Seppälä）
- **性质**：原样快照，**正文未改写**（README 顶部 YAML frontmatter 一并保留）。归属与许可见 [ATTRIBUTION.md](ATTRIBUTION.md)。

> **图片链说明**：vendored 正文里指向 `./etc/*.png` 等相对图片的链接会因**只收正文、不复制图**而失效——**这是可接受的快照取舍**（本库只收正文，图片/图示链回上游 `java-design-patterns/<pattern>/etc/`）。正文链接未改写。

> **边缘（避免双维护）**：「是否/为何选某模式」的架构决策归 Winston（`bmad-architecture`）；「模式落地实现」归 Amelia（`bmad-build`）。本库只做**实现期参照**，决策表与硬规则在 `bmad-build/SKILL.md`（story-004 蒸馏），此处不重复规则。

**档位说明**：**A 档 = 43 篇**，直接 vendor 全文（后端高频、意图稳定、README 自洽）。**B 档**只在下方索引给一行摘要，**不 vendor 正文**，需要时深读上游 `java-design-patterns/<pattern>/`。**C 档**（前端表现层/游戏/UI 测试）与 `localization/` 译文**不纳入**。

---

## A 档 · 43 篇（按 7 类分表）

### 1. 架构（7）

| 模式 | 意图（1 句） | 何时用 | 何时别用 | 权衡 | 路径 |
|---|---|---|---|---|---|
| Layered Architecture | 按抽象层次分层（表现/应用/领域/基础设施），每层职责单一、可独立开发维护。 | 应用能按职责自然分层；希望改动不跨层扩散、提升可维护性与可测性。 | 层次简单或团队不守边界；无需技术栈隔离的小工具。 | 层间调用有性能开销；层划分与治理复杂。 | [reference/架构/layered-architecture.md](架构/layered-architecture.md) |
| Hexagonal Architecture | 端口与适配器：把核心业务与外部（DB/UI/第三方）解耦，通过端口/适配器隔离。 | 需对接多种外部系统、要求高可测性、外部接口变化不应影响核心逻辑。 | 简单应用易过度设计（平添抽象层）。 | 抽象层增多，设计与理解成本上升。 | [reference/架构/hexagonal-architecture.md](架构/hexagonal-architecture.md) |
| Clean Architecture | 同心圆分层 + 依赖倒置，使核心业务规则独立于 UI/DB/框架。 | 大型应用需高可维护/可测、要求清晰层边界、领域独立于基础设施。 | 小项目引入严格分层是过度设计。 | 初始复杂度高；需团队严格遵守架构纪律。 | [reference/架构/clean-architecture.md](架构/clean-architecture.md) |
| Service Layer | 用独立应用服务层封装业务用例，为表现层提供明确定义的 API 并划分事务边界。 | 需把业务逻辑与表现逻辑分离、业务规则/工作流复杂、需给表现层清晰 API。 | 业务极简（CRUD）时多一层即多一跳；无复杂用例可编排。 | 多一层抽象带来复杂度与性能开销。 | [reference/架构/service-layer.md](架构/service-layer.md) |
| Domain Model | 建立与真实业务对应、数据与行为合一（充血）的富领域对象模型，集中业务逻辑。 | 业务规则复杂、领域复杂度高、有领域专家参与建模。 | 简单 CRUD/以数据为主的应用，富模型是过度设计。 | 建模复杂；富对象行为可能带性能瓶颈；学习曲线陡。 | [reference/架构/domain-model.md](架构/domain-model.md) |
| CQRS | 把写（命令）与读（查询）的操作分离成两套模型，各自按需优化。 | 读写负载/模型差异大、读性能优化关键、可读写用不同模型甚至不同库。 | 简单单体、读写同构时属过度设计（引入同步复杂度）。 | 读写模型同步/一致性维护复杂；学习曲线高。 | [reference/架构/command-query-responsibility-segregation.md](架构/command-query-responsibility-segregation.md) |
| Event Sourcing | 以事件序列而非当前状态存储全部变更，重放事件可重建任意时点状态。 | 需完整审计/历史回放、复杂领域状态由一系列变更推导、需高可用可扩展。 | 无审计/回溯需求、团队无事件建模与版本治理能力时慎用。 | 实现维护复杂；事件存储体积大；事件版本演进难。 | [reference/架构/event-sourcing.md](架构/event-sourcing.md) |

### 2. 并发（5）

| 模式 | 意图（1 句） | 何时用 | 何时别用 | 权衡 | 路径 |
|---|---|---|---|---|---|
| Thread Pool Executor | 维护固定工作线程池复用线程执行任务，限制并发度、避免频繁建销线程。 | 需限制同时线程数防资源耗尽、大量短时独立任务、需复用降开销、服务端并发请求。 | 任务极长且数量少、或任务间强依赖时，线程池无益甚至饥饿。 | 配置不当会线程饥饿或资源闲置；需处理优雅关闭。 | [reference/并发/thread-pool-executor.md](并发/thread-pool-executor.md) |
| Producer-Consumer | 用共享队列解耦生产者与消费者，使两者以不同速率并发运转。 | 生产与消费速率不匹配需缓冲、需解耦二者、需同步访问共享资源。 | 单线程或读写本就同步的简单流程，引入队列徒增同步复杂度。 | 需谨慎处理同步与死锁；缓冲区大小管理。 | [reference/并发/producer-consumer.md](并发/producer-consumer.md) |
| Async Method Invocation | 让方法异步调用（返回 Future 等），调用方无需阻塞等待即可继续。 | 任务无需立即完成、IO/网络/重计算耗时、GUI 防冻结、Web 非阻塞 IO。 | 后续步骤强依赖该结果（必须同步）、错误处理与资源管理难驾驭时。 | 异步使代码更复杂；线程/上下文管理开销；异常处理分散。 | [reference/并发/async-method-invocation.md](并发/async-method-invocation.md) |
| Active Object | 把方法调用与执行解耦——每个对象自带线程与消息队列，异步处理请求。 | 需异步处理且不阻塞主线程、需异步访问外部资源、需模块化并发管理。 | 简单并发问题（线程池/异步调用即可），消息传递开销得不偿失。 | 消息传递与线程管理带来额外开销；非万能并发方案。 | [reference/并发/active-object.md](并发/active-object.md) |
| Backpressure | 控制数据生产速率，避免下游消费者被过量负载压垮。 | 数据高速产生且消费者有过载风险、响应式/事件驱动架构需在变负载下保稳定。 | 生产速率本就可控、消费者无过载风险时无需引入流控复杂度。 | 生产需减速时引入延迟；多数据源并发时编排复杂。 | [reference/并发/backpressure.md](并发/backpressure.md) |

### 3. 数据访问（6）

| 模式 | 意图（1 句） | 何时用 | 何时别用 | 权衡 | 路径 |
|---|---|---|---|---|---|
| Repository | 集中管理数据访问逻辑，以集合式接口向领域屏蔽存储/检索细节。 | 需解耦业务与数据访问、可能多数据源且业务不应感知、需 mock 便于测试。 | 简单 CRUD/报表查询，直接 DAO/查询即可（多一层抽象）。 | 增加抽象层复杂度；抽象带来性能开销。 | [reference/数据访问/repository.md](数据访问/repository.md) |
| Data Mapper | 在 DB 与业务逻辑间加映射层，双向映射对象↔记录，使二者独立演进。 | 需解耦内存对象与库表（SRP/关注点分离）、用 ORM、库表复杂直接操作易错。 | 领域对象与表结构几乎同构、简单场景，映射层纯属负担。 | 抽象层复杂；大库/复杂查询有性能开销；需额外学习映射层。 | [reference/数据访问/data-mapper.md](数据访问/data-mapper.md) |
| Unit of Work | 跟踪一次业务事务内所有受影响对象，协调并在同一事务内批量提交变更。 | 多次 DB 操作须作单事务保证一致性、需跟踪并协调保存对象变更、配合 ORM。 | 单表单写，事务注解足够，无需工作单元。 | 对象生命周期管理复杂；大数据集下管理不当有性能开销。 | [reference/数据访问/unit-of-work.md](数据访问/unit-of-work.md) |
| Data Transfer Object | 用聚合数据的可序列化对象在层/进程间传输，减少调用次数。 | 需减少网络调用（客户端-服务端）、需批量处理、远程接口需封装传输数据。 | 同进程紧耦合的简单传参，额外 DTO 只会冗余、易致贫血模型。 | 增加类与冗余结构；易产生同步问题；可能诱发贫血模型。 | [reference/数据访问/data-transfer-object.md](数据访问/data-transfer-object.md) |
| Optimistic Offline Lock | 用版本号等乐观并发控制管理并发修改，避免长时间数据库锁。 | 多事务并发改同一数据但冲突概率低、需避免长锁保性能与扩展。 | 高冲突、频繁碰撞场景（乐观锁会大量重试），应改悲观锁/队列。 | 需版本、回滚/重试等额外逻辑；冲突多时重试频繁。 | [reference/数据访问/optimistic-offline-lock.md](数据访问/optimistic-offline-lock.md) |
| Sharding | 按分片键水平分区，把数据/负载分散到多个库以突破单库容量与吞吐上限。 | 单库容量/吞吐成瓶颈、需水平扩展、需高可用容错、读写可跨分片并行。 | 数据量未超单库、跨分片查询多、无运维能力时，分片反而复杂。 | 多分片管理复杂；再均衡难；跨分片查询延迟高。 | [reference/数据访问/sharding.md](数据访问/sharding.md) |

### 4. 韧性（6）

| 模式 | 意图（1 句） | 何时用 | 何时别用 | 权衡 | 路径 |
|---|---|---|---|---|---|
| Circuit Breaker | 当下游故障时快速失败并熔断，防止反复执行注定失败的操作与级联雪崩。 | 分布式/微服务中单点故障会级联、依赖第三方服务或 DB 可能变慢无响应。 | 单体内无远程调用、故障非瞬时（应先修根因）时，熔断无意义。 | 需额外检测/状态机逻辑；配置不当会误拦正常请求；阈值需调优。 | [reference/韧性/circuit-breaker.md](韧性/circuit-breaker.md) |
| Retry | 透明地对涉及外部通信的操作做有限次重试，隔离调用方与重试细节。 | 操作可能瞬时失败（网络/连接/外部服务）、瞬时失败概率高但重试成本低。 | 非幂等操作盲目重试（应先做幂等/补偿）、失败持续性而非瞬时。 | 重试增加延迟；管理不当致资源耗尽；参数需谨慎配置。 | [reference/韧性/retry.md](韧性/retry.md) |
| Fallback | 服务不可用/失败/超时时降级到兜底响应（默认/空/缓存值），保可用性。 | 微服务依赖经网络易故障、返回默认值优于整体失败、用户界面需可用（可降级）。 | 兜底数据不可接受（强一致/强正确性场景）时，降级会误导用户。 | 缓存兜底可能过期；需编写并测试替代流程增加复杂度。 | [reference/韧性/fallback.md](韧性/fallback.md) |
| Bulkhead | 把服务的线程/连接等资源分区隔离，单一下游故障/过载不会耗尽其他依赖所需资源。 | 服务调用多个下游、需保护关键请求容量、线程/连接共享怕被拖垮、宁可快速拒绝而非无限排队。 | 下游单一且无隔离诉求、资源紧张时，隔离会让整体利用率下降。 | 各舱位需分别定容调优；整体利用率可能降低；多线程跳增延迟；被拒请求仍需兜底策略。 | [reference/韧性/microservices-bulkhead.md](韧性/microservices-bulkhead.md) |
| Load Shedding | 过载时度量自身负载并立即拒绝超额请求，保住被接纳请求的正常延迟。 | 服务容量可测但流量会超限（大促/重试风暴/下游变慢）、延迟比吞吐更重要、需保护关键流程。 | 流量稳定不超容量、调用方无法处理拒绝（不能重试/降级）时不宜。 | 需按测量定容量/阈值；静态阈值不随硬件变化；被拒方立即重试会变重试风暴（需退避）。 | [reference/韧性/microservices-load-shedding.md](韧性/microservices-load-shedding.md) |
| Saga | 用一系列本地事务 + 补偿动作协调跨服务长事务，避免分布式强事务。 | 事务跨多个微服务、需跨服务数据一致但不用 2PC、长事务需异步处理。 | 可接受最终一致且无跨服务事务、或事务范围本可收敛到单服务时不必引入。 | 补偿事务处理复杂；需应对部分失败/回滚；异步带来延迟。 | [reference/韧性/saga.md](韧性/saga.md) |

### 5. 集成（4）

| 模式 | 意图（1 句） | 何时用 | 何时别用 | 权衡 | 路径 |
|---|---|---|---|---|---|
| API Gateway | 为微服务群提供统一入口，路由请求、聚合结果，简化客户端。 | 微服务架构需对客户端屏蔽复杂度、一次请求需聚合多服务、需集中鉴权/安全、云端优化通信。 | 服务很少/简单直连即可，网关反成单点与额外跳；无需跨切面集中。 | 引入单点故障（需高可用）；扩展不当成瓶颈；部署管理更复杂。 | [reference/集成/microservices-api-gateway.md](集成/microservices-api-gateway.md) |
| Ambassador | 在本地为远端服务放一个代理实例，代处理监控/日志/路由/重试等旁路逻辑。 | 云原生/微服务需监控日志安全、集成遗留系统需处理非核心功能、需缓存/压缩优化通信。 | 简单直连、无跨切面旁路需求时，多一跳多一层只增开销。 | 多一层架构更复杂；额外网络跳增延迟；部署运维开销。 | [reference/集成/ambassador.md](集成/ambassador.md) |
| Anti-Corruption Layer | 在不共享语义的子系统间加防腐层（外观/适配器）双向翻译，隔离外部模型保护本域。 | 多阶段迁移新旧系统需并存、子系统语义不同需通信、集成遗留/外部系统怕污染领域、需松耦合。 | 一次性小对接、语义本可对齐时，薄适配器足够，完整防腐层过重。 | 翻译带来复杂度与性能开销；设计不当成瓶颈；模型易重复。 | [reference/集成/anti-corruption-layer.md](集成/anti-corruption-layer.md) |
| Backends for Frontends | 为每类客户端（移动/Web/桌面/语音）各配专属后端，API 按各自需求量身定制。 | 不同客户端对同一数据需不同形状/粒度/聚合、共享 API 堆满客户端分支、各端需独立迭代、移动端需裁剪载荷。 | 客户端类型单一、需求一致时，多套 BFF 只会重复建设与多跳。 | 需多建多部署多运维；共享逻辑易在 BFF 间重复；多一跳延迟。 | [reference/集成/backends-for-frontends.md](集成/backends-for-frontends.md) |

### 6. 消息（5）

| 模式 | 意图（1 句） | 何时用 | 何时别用 | 权衡 | 路径 |
|---|---|---|---|---|---|
| Publish-Subscribe | 定义一对多依赖，发布者状态变化/事件发生时自动通知所有订阅者。 | 需生产者与消费者松耦合、多订阅者独立响应同一事件、需可扩展异步消息（微服务）。 | 只有单一消费者、需强同步强一致且基础设施不可靠时，pub/sub 延迟与一致性难保。 | 异步消息处理与调试复杂；基础设施不可靠致延迟/不一致；有消息泛滥风险。 | [reference/消息/publish-subscribe.md](消息/publish-subscribe.md) |
| Event Aggregator | 集中收集多来源事件并路由到相应处理器，解耦事件产生与处理。 | 多事件源与处理器、需解耦产生与处理逻辑、需集中式事件管理。 | 事件源/处理器少且简单直连即可，聚合器反成复杂中心节点。 | 聚合器本身可能变复杂难维护；扩展不当成性能瓶颈。 | [reference/消息/event-aggregator.md](消息/event-aggregator.md) |
| Data Bus | 提供集中通信总线，让各组件无需直接连接即可交换数据/事件，促进松耦合。 | 多组件需共享数据但不宜直接耦合、事件驱动信息流动态、分布式/跨环境部署、微服务互通信。 | 组件少且关系固定、可用直接调用时，数据总线徒增复杂度与延迟。 | 增加架构复杂度；额外通信层延迟；经总线追踪数据流调试困难。 | [reference/消息/data-bus.md](消息/data-bus.md) |
| Idempotent Consumer | 保证同一消息被重复消费也不产生非预期副作用（消费幂等）。 | 消息可能因网络/重试重复到达、需保证状态一致、容错事件驱动关键、水平扩展需无状态消费。 | 消费端天然幂等（如置位操作）、且无重复投递风险时，无需去重表等额外开销。 | 需设计已处理消息跟踪；幂等 token/状态有开销；可能需额外存储或事务。 | [reference/消息/microservices-idempotent-consumer.md](消息/microservices-idempotent-consumer.md) |
| Transactional Outbox | 在同一 DB 事务内同时持久化业务数据与事件（outbox 表），保证「落库+发消息」一致，免除分布式事务。 | 需更新库并可靠发消息无丢失/无双写不一致、不支持或不愿用 XA/2PC、需至少一次投递的事件驱动微服务。 | 可容忍最终一致且允许丢消息、或无需可靠发事件时，简化即可。 | 轮询致近实时延迟；消费者须幂等处理重复；outbox 表需定期清理。 | [reference/消息/transactional-outbox.md](消息/transactional-outbox.md) |

### 7. GoF 核心（10）

| 模式 | 意图（1 句） | 何时用 | 何时别用 | 权衡 | 路径 |
|---|---|---|---|---|---|
| Factory Method | 定义创建对象的接口，由子类决定实例化哪个具体类，把实例化推迟到子类。 | 类无法预知要创建的对象类、希望子类指定创建对象、需把选择哪个辅助子类的知识局部化。 | 产品类型固定单一、无需延迟到子类决定时，直接用构造器/静态工厂即可。 | 扩展需新增子类实现工厂方法，可能使代码更复杂。 | [reference/gof/factory-method.md](gof/factory-method.md) |
| Abstract Factory | 提供创建一系列相关/依赖对象族的接口，不指定具体类。 | 系统应独立于产品创建方式、需可切换多产品族、相关产品须配套使用、只暴露接口、运行期选族。 | 只有单一产品族、未来不预期增加族时，抽象工厂是过度设计。 | 定义抽象接口与具体工厂有初始开销；间接调用降低透明度。 | [reference/gof/abstract-factory.md](gof/abstract-factory.md) |
| Builder | 分步构建复杂对象，把构造过程与表示分离，同一过程可产出不同表示。 | 构造参数多/步骤多、构造算法应独立于部件与装配、需不同表示、步骤需按序执行。 | 参数少（<4）且不常变，构造器/静态工厂足够，builder 徒增类与内存。 | 需新建多个类增加复杂度；多个 builder 对象增加内存。 | [reference/gof/builder.md](gof/builder.md) |
| Singleton | 保证类只有一个实例并提供全局访问点。 | 确需全类唯一实例（配置/连接池）且需众所周知访问点、唯一实例需可被扩展。 | 能用依赖注入/容器托管时优先 DI，别用单例（全局状态难测）。 | 全局状态难测试；生命周期管理复杂；并发下同步不当成瓶颈。 | [reference/gof/singleton.md](gof/singleton.md) |
| Adapter | 把类的接口转换为客户端期望的另一接口，使不兼容接口协同。 | 想复用接口不匹配的现有类、需与未预见的类协作、需适配多个已有子类、用第三方库做中间层解耦。 | 接口本可对齐/可改源码时，直接改比套适配器更简单。 | 类适配器受限于单继承；对象适配器多一层间接；可能过度包装。 | [reference/gof/adapter.md](gof/adapter.md) |
| Decorator | 用同接口对象「包裹」对象，在不改原类的前提下动态叠加职责。 | 需动态透明地为单个对象加职责、职责可撤销、因继承爆炸不宜扩展、类被隐藏不可继承。 | 职责固定、一次装配即可时，用继承/组合更直观，滥用生大量小类。 | 装饰器与组件非同一类型（类型判断失败）；大量相似小对象难配置；过度使用复杂化结构。 | [reference/gof/decorator.md](gof/decorator.md) |
| Facade | 为子系统的一组接口提供统一简化接口，降低使用与依赖复杂度。 | 需给复杂子系统简单入口、客户端只需部分功能、需分层为各子系统设入口、需降低依赖提升可读性。 | 子系统本就简单、或门面会膨胀成耦合所有类的上帝对象时不宜。 | 实现不当门面会变成耦合全部类的上帝对象。 | [reference/gof/facade.md](gof/facade.md) |
| Strategy | 定义一族可互换算法、各自封装，使算法独立于使用它的客户端变化。 | 需在运行时切换算法变体、多个类仅行为不同、算法用到客户端不该知道的数据、大量条件分支选行为。 | 只有一种实现、未来不预期扩展时，直接写死即可（策略是过度设计）。 | 客户端须了解不同策略；对象数量增加。 | [reference/gof/strategy.md](gof/strategy.md) |
| Observer | 定义一对多依赖，主题状态更新时自动通知并更新所有观察者。 | 抽象有两面且一面依赖另一面需独立复用、一处变化需联动多处且数量未知、需通知而不假设订阅者是谁（松耦合）。 | 订阅关系固定、通知强顺序/强一致要求时，观察者顺序不确定易出问题。 | 观察者未注销易内存泄漏；通知顺序未定义；大量观察者有性能问题。 | [reference/gof/observer.md](gof/observer.md) |
| Command | 把请求封装成对象，可参数化客户端、排队/记录/撤销请求。 | 需以动作参数化对象、需排队/延迟执行、需撤销/重做、需日志重放恢复、需围绕高层操作组织系统。 | 简单直接调用即可、无排队/撤销/记录需求时，为每个命令建类徒增类数。 | 每个命令增加类；发送者与接收者间多层可能复杂化设计。 | [reference/gof/command.md](gof/command.md) |

---

## B 档 · 摘要行（只进索引，不 vendor 正文）

> 需要时深读上游 `java-design-patterns/<pattern>/README.md`；本次**未复制**这些正文。

### 架构 / 集成 / 韧性补充

| 模式 | 一句话 | 深读见上游 |
|---|---|---|
| Onion Architecture | 以领域为中心的同心圆分层，依赖只指向内层，强调领域模型纯净。 | `java-design-patterns/onion-architecture/` |
| Strangler | 用新实现逐步「绞杀」替换遗留系统，增量迁移而非一次性重写。 | `java-design-patterns/strangler/` |
| Intercepting Filter | 在请求处理链前插入可插拔过滤器，统一处理鉴权/日志等预处理。 | `java-design-patterns/intercepting-filter/` |
| Service to Worker | 把请求分发与业务处理分层，控制器协调视图与命令。 | `java-design-patterns/service-to-worker/` |
| Event-Driven Architecture | 以事件生产/消费组织系统，异步解耦、松耦合扩展。 | `java-design-patterns/event-driven-architecture/` |
| Monolithic Architecture | 单一部署单元的传统架构，简单直接、适合早期产品。 | `java-design-patterns/monolithic-architecture/` |
| Polling Publisher | 轮询数据库变更表再发布事件，常与 Outbox 配合。 | `java-design-patterns/polling-publisher/` |
| Gateway | 封装对子系统/外部资源的访问，收敛访问入口。 | `java-design-patterns/gateway/` |
| Microservices Messaging | 微服务间异步消息通信的通用做法。 | `java-design-patterns/microservices-messaging/` |
| Microservices Log Aggregation | 集中收集/聚合各服务日志便于观测。 | `java-design-patterns/microservices-log-aggregation/` |
| Queue-based Load Leveling | 用队列削峰填谷，平滑突发负载。 | `java-design-patterns/queue-based-load-leveling/` |
| Tolerant Reader | 消费端对消息变更尽量宽容，增强演进兼容性。 | `java-design-patterns/tolerant-reader/` |

### 结构性 / 行为型补充（GoF 其余）

| 模式 | 一句话 | 深读见上游 |
|---|---|---|
| Proxy | 为对象提供代理以控制访问（延迟、权限、远程）。 | `java-design-patterns/proxy/` |
| Dynamic Proxy | 运行时生成代理，动态拦截方法调用。 | `java-design-patterns/dynamic-proxy/` |
| Bridge | 抽象与实现分离，各自独立扩展。 | `java-design-patterns/bridge/` |
| Composite | 以树形结构统一处理整体与部分。 | `java-design-patterns/composite/` |
| Flyweight | 共享细粒度对象以节省内存。 | `java-design-patterns/flyweight/` |
| Converter | 在对象表示之间双向转换。 | `java-design-patterns/converter/` |
| Business Delegate | 在表现层与业务层间加代理，降低耦合。 | `java-design-patterns/business-delegate/` |
| Value Object | 以不可变值语义对象表达概念，按值相等。 | `java-design-patterns/value-object/` |
| Parameter Object | 把一组参数聚合为对象，简化签名。 | `java-design-patterns/parameter-object/` |
| Template Method | 父类定算法骨架，子类实现可变步骤。 | `java-design-patterns/template-method/` |
| Chain of Responsibility | 请求沿处理器链传递直到被处理。 | `java-design-patterns/chain-of-responsibility/` |
| State | 以状态对象表达状态机，行为随状态切换。 | `java-design-patterns/state/` |
| Visitor | 在不改元素类的前提下对结构增补操作。 | `java-design-patterns/visitor/` |
| Mediator | 以中介者集中协调对象间交互，降低耦合。 | `java-design-patterns/mediator/` |
| Null Object | 用空对象代替 null，简化空判断。 | `java-design-patterns/null-object/` |
| Specification | 把业务规则封装成可组合的规格对象。 | `java-design-patterns/specification/` |
| Filterer | 以过滤器组合筛选集合元素。 | `java-design-patterns/filterer/` |
| Pipeline | 以流水线串联处理阶段。 | `java-design-patterns/pipeline/` |
| Rule Engine | 以规则引擎解耦规则与执行。 | `java-design-patterns/rule-engine/` |
| Feature Toggle | 以开关控制功能灰度/回滚。 | `java-design-patterns/feature-toggle/` |

### 并发 / 数据访问 / 创建型 / 性能 / 资源 / 其他补充

| 模式 | 一句话 | 深读见上游 |
|---|---|---|
| Guarded Suspension | 在条件不满足时挂起等待，条件满足再继续。 | `java-design-patterns/guarded-suspension/` |
| Monitor | 用互斥 + 条件变量封装共享资源同步。 | `java-design-patterns/monitor/` |
| Balking | 状态不满足时直接放弃执行。 | `java-design-patterns/balking/` |
| Leader Election | 多实例中选主以协调工作。 | `java-design-patterns/leader-election/` |
| Reactor | 事件驱动 I/O 的事件分发模型。 | `java-design-patterns/reactor/` |
| Actor Model | 以独立 actor 与消息传递构建并发。 | `java-design-patterns/actor-model/` |
| Fork-Join | 分治任务并行拆分与合并。 | `java-design-patterns/fork-join/` |
| Promise | 用可组合的 future 表达异步结果。 | `java-design-patterns/promise/` |
| Poison Pill | 用特殊消息优雅终止消费循环。 | `java-design-patterns/poison-pill/` |
| Data Access Object | 封装数据源的访问细节。 | `java-design-patterns/data-access-object/` |
| Transaction Script | 以过程式脚本组织单次业务事务。 | `java-design-patterns/transaction-script/` |
| Table Module | 以表为单位组织领域逻辑。 | `java-design-patterns/table-module/` |
| Table Inheritance | 以表结构映射继承关系。 | `java-design-patterns/table-inheritance/` |
| Version Number | 用版本号做并发/一致控制。 | `java-design-patterns/version-number/` |
| Write-Ahead Log | 先写日志再改状态以保崩溃恢复。 | `java-design-patterns/write-ahead-log/` |
| Prototype | 通过克隆原型创建新对象。 | `java-design-patterns/prototype/` |
| Factory | 静态工厂方法集中创建逻辑。 | `java-design-patterns/factory/` |
| Factory Kit | 以注册表+构建器实现可扩展工厂。 | `java-design-patterns/factory-kit/` |
| Dependency Injection | 以依赖注入实现控制反转。 | `java-design-patterns/dependency-injection/` |
| Registry | 以注册表集中查找实例/服务。 | `java-design-patterns/registry/` |
| Object Pool | 复用昂贵对象以降低创建开销。 | `java-design-patterns/object-pool/` |
| Multiton | 同一键保证唯一实例的受控多例。 | `java-design-patterns/multiton/` |
| Monostate | 以共享静态状态实现「多实例同一状态」。 | `java-design-patterns/monostate/` |
| Immutable | 以不可变对象保证线程安全与可推理。 | `java-design-patterns/immutable/` |
| Caching | 缓存昂贵计算结果以提速。 | `java-design-patterns/caching/` |
| Lazy Loading | 延迟加载以省资源、缩短启动。 | `java-design-patterns/lazy-loading/` |
| Data Locality | 优化数据布局提升访问局部性。 | `java-design-patterns/data-locality/` |
| Resource Acquisition Is Initialization | 以作用域生命周期管理资源释放。 | `java-design-patterns/resource-acquisition-is-initialization/` |
| Server Session | 以服务端会话保存跨请求状态。 | `java-design-patterns/server-session/` |
| Throttling | 限制请求速率以保护系统。 | `java-design-patterns/throttling/` |
| Arrange-Act-Assert | 测试三段式结构（测试组织）。 | `java-design-patterns/arrange-act-assert/` |
| Object Mother | 用工厂方法构造测试对象（测试组织）。 | `java-design-patterns/object-mother/` |
| Service Stub | 以桩替代真实服务做测试。 | `java-design-patterns/service-stub/` |
| Microservices Self-Registration | 服务自行向注册中心登记。 | `java-design-patterns/microservices-self-registration/` |

> Functional 全部（如 `functional-*` 系列）与其余少数模式未逐条列入，需要时按上游目录深读。

---

## 统计

- **A 档 vendored 正文**：**43** 篇（架构 7 + 并发 5 + 数据访问 6 + 韧性 6 + 集成 4 + 消息 5 + gof 10）= 43 个 `reference/<类别>/<pattern>.md`。
- **B 档摘要行**：上表逐条列出（只进索引、不 vendor 正文）。
- **未纳入**：C 档前端表现层/游戏/UI 测试模式、`localization/` 译文。
- **体积**：约见 `du -sh reference`（≈ 43 篇 README 合计数百 KB）。
