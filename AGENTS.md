# AGENTS.md

全医慧助（PCIE，Primary Care Intelligent Expert）桌面端工程 `floating-ball` 的协作规则。

本项目是一个 `Tauri 2 + Vue 3 + TypeScript + Rust` 的基层医疗智能专家辅助工作站，当前真实运行形态包含：

1. 完整症状问诊主链路与主问诊内嵌灵活模式（`ConsultationPage.vue`）
2. 独立诊断路径窗口（`DiagnosisPathWindow.vue`）
3. 语音问诊与病历回写链路
4. 本地 HTTP Bridge 与 PHIS 引用回执入口（`src-tauri/src/http_server.rs`）
5. 服务端托管的外部知识库能力（`pmphai.ts` 为主，`KnowledgeBasePanel.vue` 为保留内置面板）

## 必读顺序

1. 先读 [HARNESS.md](./HARNESS.md) 明确项目内执行流程和跨仓升级条件
2. 再读 [CODE_MAP.md](./CODE_MAP.md) 快速定位要改的模块，按需深入
3. 再读 [ARCHITECTURE.md](./ARCHITECTURE.md) 理解整体架构
4. 涉及前端重构、复用、拆分或路径迁移时，先读 [frontend-reuse-architecture.md](./docs/frontend-reuse-architecture.md)，再读 [frontend-file-structure-plan.md](./docs/frontend-file-structure-plan.md)
5. 涉及本地 HIS 联调时再读 [api.md](./api.md)
6. 涉及交互、产品约束时再读 [PRODUCT.md](./PRODUCT.md)
7. 遇到疑似踩过的坑时，先查 [RETRO.md](./RETRO.md) 已有经验
8. 涉及历史上反复摇摆的设计决策时，先查 [DECISION_DRIFT.md](./DECISION_DRIFT.md)
9. 涉及服务端接入、设备签名或 `/v1/*` 契约时，读取 [../development-harness/HARNESS.md](../development-harness/HARNESS.md)、[../floating-ball-server/HARNESS.md](../floating-ball-server/HARNESS.md)、[../floating-ball-server/API.md](../floating-ball-server/API.md)、真实调用代码和 `requestSigner.ts`

## 强制流程

1. 文档先行：架构、窗口形态、事件流、回写行为、模块职责变化，先改文档再改代码。
2. 契约同步：`src-tauri/src/http_server.rs` 或 `complete_consultation` 结果结构变化时，必须同步更新 `api.md`。
3. 规则同步：包管理器、验证命令、目录职责、Review 关注点变化时，必须同步更新本文件。
4. 交付顺序：`HARNESS/ARCHITECTURE/API/PRODUCT/AGENTS -> 代码 -> 构建/测试/手测说明`

## 硬约束（禁止）

以下规则优先级高于一切建议性条款，违反即视为无效交付：

1. **ConsultationPage.vue 冻结堆砌**：该文件已超 1300 行，禁止继续向其中添加新功能或新 UI 区块；新能力必须先拆出独立 composable 或子组件，经人工确认后才可合入。
2. **App.vue 不承接新业务逻辑**：新逻辑必须放入 composable，App.vue 只做编排。
3. **跨层调用禁止**：Service 不能直接操作 UI 状态；Store 只暴露显式 action，外部不得直接 mutate state。
4. **单边契约变更禁止**：修改 `http_server.rs` 接口定义而不同步更新 `api.md`，视为无效交付。修改前端调用而不同步更新后端实现和文档，同理。
5. **盲目新增全局状态禁止**：不得为临时 UI 状态新增 Pinia store；新增 store 必须先说明为什么 ref/reactive 不够用。
6. **锁文件混用禁止**：除非任务明确是"统一包管理器"，否则不得混用 npm/yarn/pnpm 安装或刷新锁文件。
7. **服务端请求签名禁止绕过**：所有 `regionalFetch`、`createRegionalSSE`、`createRegionalWebSocketUrl` 出口必须经过 `requestSigner.ts` 签名；新增 `/v1/*` 请求出口必须集成签名，不得由业务代码直接 fetch。
8. **主窗口几何出口禁止绕过**：业务组件和 feature composable 不得直接调用 Tauri `setSize / setPosition`；主窗口尺寸与位置统一由 `app/shell/useWindowTransitionCoordinator.ts` 编排，并经 `useWindowManagement.ts` 应用，纯 `workArea` / DPI / clamp 规则归 `windowGeometry.ts`。独立原生窗口的创建尺寸仍由各自窗口 service 管理，但必须设置合理 min size 并校验当前工作区。

## 棘轮式治理

以下模块已识别为高风险区域，改动时必须执行对应的额外约束：

| 文件/模块 | 当前风险 | 约束 |
| --- | --- | --- |
| `ConsultationPage.vue` | 1300+ 行，职责过重 | 只允许拆分和缩减，不允许净增行数 |
| `useEventListeners.ts` | 约 575 行，仍集中 App 级事件入口 | 新增 App 级 Tauri `listen` 默认复用 `shared/composables/useTauriEventListener.ts`；接诊 / 患者补全 / 风险胶囊状态机默认进入 `app/events/useReceptionController.ts`；SDK handshake 初始化默认进入 `app/events/useSdkHandshakeController.ts`；并说明为什么不能放在更局部的 composable |
| `useWindowManagement.ts` | 422 行 | 窗口尺寸/位置改动必须同步校验多显示器 `workArea` 与混合 DPI；纯计算下沉 `windowGeometry.ts`，内容/视图时序进入 `useWindowTransitionCoordinator.ts`，不得继续扩大职责 |
| `http_server.rs` 接口定义 | 共享契约 | 任何字段变更必须同步 api.md + 前端调用方 |

治理原则：每轮迭代只允许往"更好"的方向变化。如果一次改动会让上述文件变得更大或职责更模糊，必须先拆解再继续。

## 当前架构基线

-> 见 [ARCHITECTURE.md](./ARCHITECTURE.md)，该文件是架构的唯一真实来源。

以下仅列出 AGENTS.md 层面需要额外强调的架构约束（不重复 ARCHITECTURE.md 已有内容）：

1. `ConsultationPage.vue` 是完整问诊 + 灵活模式的唯一落点，不允许维护第二套推荐口径。
2. Pinia 当前只有 `consultationConfig` 和 `diagnosisPath` 两个权威 store，新增需人工审批。
3. 知识库入口主次关系：`pmphai.ts` 为主，`KnowledgeBasePanel.vue` 为保留备选。
4. 前端复用治理以 `docs/frontend-reuse-architecture.md` 为准，文件结构迁移以 `docs/frontend-file-structure-plan.md` 为目标路线图；新增业务组件 / composable / mapper 默认进入对应 `features/<feature>/ui|model|api|lib`，通用 UI / 工具进入 `shared/*`，稳定实体进入 `entities/*`，根级 `components/`、`composables/`、`services/` 不再作为新增默认落点，只保留历史入口或兼容 facade。
5. 后续重构不能只追求大文件行数下降；必须说明沉淀了哪类能力（Adapter / Builder / Strategy / Composable Controller / Headless UI / domain lib），以及是否减少重复规则或可删除旧入口。
6. 客户端只保留服务端托管运行形态，不再提供本地/区域模式开关；LLM、语音、PMPHAI/知识库、Prompt/模板同步、反馈和审计统一经签名 `/v1/*` 接口。不得重新引入客户端第三方密钥、供应商直连或本地 Tauri AI 代理。HIS Bridge、HIS Adapter、目录缓存、窗口/音频采集和确定性规则属于桌面基础设施，不等同于本地模式。

## 工程复盘与决策摇摆

-> 见 [RETRO.md](./RETRO.md)，记录开发过程中反复出现的错误和 vibe coding 典型困难。
-> 见 [DECISION_DRIFT.md](./DECISION_DRIFT.md)，记录历史上反复变更、撤回、合并、拆分或默认值来回调整的设计决策。

1. 遇到似曾相识的问题时，先查 RETRO.md 是否已有记录和解决方案。
2. 新发现的典型错误或反复踩坑，必须追加到 RETRO.md（使用文件末尾的模板）。
3. 遇到同一设计点被反复推翻、重做、拆分又合并、默认值来回切换时，必须追加到 DECISION_DRIFT.md。
4. 如果某条经验足够通用且反复触发，应升级为本文件的硬约束或棘轮条目。
5. 如果某个摇摆决策已经收敛为产品或架构立场，必须同步更新 PRODUCT.md / ARCHITECTURE.md / AGENTS.md，并在 DECISION_DRIFT.md 标注收敛位置。

## 文档更新矩阵

1. 组件、composable、store、service 职责变化：更新 `ARCHITECTURE.md`
2. 本地 HTTP Bridge 接口、字段、回写结果变化：更新 `api.md`
3. 医生交互约束、灵活模式门禁、引用闭环变化：更新 `PRODUCT.md`
4. 协作流程、验证命令、Review 热点变化：更新 `AGENTS.md`
5. 开发错误、踩坑经验、反复出现的困难：更新 `RETRO.md`
6. 设计决策反复推翻、拆分合并、默认值来回切换或当前立场不稳定：更新 `DECISION_DRIFT.md`
7. 模块新增/删除/重命名、文件职责迁移、依赖关系/数据流变更：更新 `CODE_MAP.md`

## 包管理与命令约束

1. 默认使用 `yarn`：
   - `yarn install`
   - `yarn type-check`
   - `yarn test:unit`
   - `yarn build`
   - `yarn tauri dev`
2. `package.json` 通过 `packageManager` 固定到 `yarn@1.22.22`，仓库根目录只保留 `yarn.lock`。
3. 根目录不得新增或提交 `package-lock.json`、`pnpm-lock.yaml`；若误生成，必须删除后再交付。
4. 除非任务明确是“统一包管理器”，否则不要顺手刷新或新增另一套锁文件。
5. 遇到依赖损坏时，先在交付说明中记录现状；不要无理由混用 `npm`/`yarn`/`pnpm` 重新安装。

## 最小质量门禁

1. 前端至少执行 `yarn type-check` 与 `yarn build`
2. Tauri/Rust 侧至少执行 `cargo check`
3. 新增生产代码默认同步新增或更新单元测试；确实不适合自动化覆盖时，交付说明必须写明原因和替代验证方式
4. Vitest 单元测试通过 `yarn test:unit` 执行；修改已覆盖的 service/composable/lib 必须执行该命令
5. 修改关键路径或本地/远端契约时，必须按工作区 [TESTING_STRATEGY.md](../TESTING_STRATEGY.md) 补充对应单元测试、集成测试或关键手测记录
6. 若无法完成构建或测试，必须说明阻塞原因，并补充关键路径手测或静态审查结论

## 关键手测清单

1. `start-consultation` 能正确唤起完整问诊主流程
2. `/api/consultation/assist`（内部仍复用 `start-consultation-session` 事件名）会打开 `ConsultationPage` 灵活模式，并且每次只消费一个目标动作
3. 病历详情里的“回写病历”会写入 `draft` 结果；“引用诊断/用药/检查”会写入 `reference-request`
4. `POST /api/consultation/reference-feedback` 返回后，当前页面和 `/api/consultation/events/ws` 订阅方都能看到最新 `referenceStatus`
5. `consultationId` 与当前患者/当前就诊上下文匹配，不读到旧结果
6. 诊断保持单选并引用当前选中项；推荐用药、检查检验支持多选后按分组一次引入所选项
7. 点击“引用诊断/用药/检查”后窗口不会自动收起，医生仍可继续当前问诊；PHIS 回执返回后当前页面状态会即时更新
8. 语音问诊确认后能写回同一条本地结果通道
9. 诊断路径窗口能够正确复用缓存并在超时/失败时显示明确状态

## Review 门禁

以下改动模式已反复出现问题，必须在提交前逐条核对（不是建议，是门禁）：

1. `currentPatient` 的标识字段映射必须优先考虑 `idPi / patientId`，不能只依赖宽泛的 `id`
2. 任何写回本地结果通道的代码都要核对 `consultationId`、`resultType`、`requestId`、`referenceStatus`、可选字段和 HIS WebSocket 订阅行为；不得重新引入 `/api/consultation/events/poll` 长轮询出口
3. `ConsultationPage` 灵活模式不能重新引入一套独立于完整问诊的诊断/用药/检查推荐规则
4. 诊断路径缓存相关改动，必须评估“同患者重复接诊”污染风险与缓存误命中风险
5. 涉及 `emit('minimize')`、`exitWork()`、`handleCollapse()` 的改动，必须区分“同一运行期内保留现场”和“真正持久化恢复”，不要把内存保活误写成已落盘；结束就诊收球必须走统一 transition 队列并以完整 `160×160` 球态作为终态，不得被迟到的胶囊/语音 resize 覆盖
6. 修改 `windowSizes.ts`、`useWorkMode.ts`、`useWindowManagement.ts` 时，必须同步校验窗口尺寸、显示器边界和动画原点
7. `DiagnosisPathWindow.vue`、`diagnosisPath.ts`、`stores/diagnosisPath.ts` 的改动必须同时检查窗口生命周期、渲染就绪事件和缓存 key 策略
8. 知识库相关改动要明确是走 `pmphai.ts` 主链路，还是启用内置 `KnowledgeBasePanel.vue`，避免双轨长期漂移
9. **HIS 调用边界**：业务代码（`components/` / `composables/` / `services/` 中除 `services/his/*` 之外）禁止直接 `import ... from 'services/hisService'`。必须经 `services/his` 入口：业务调用走 `getHisAdapter()`，仅 SDK handshake / 服务端 bootstrap 等认证场景允许使用 `services/his` 重导出的 `getHisService` / `resetHisService`。新增 PHIS 私有字段读取必须通过 `entry.raw.xxx` 透传，不允许在中性 DTO 上加 PHIS 命名字段。
10. **药品定稿流水线**：任何 AI 或历史上下文产生的药品，在自动选中、缓存、库存校验和回写前必须调用共享 `finalizeMedicineRecommendation(s)`，依次完成当前库存对齐、药品详情、一次剂量换算、标准频次 / 用法、程序总量和最终库存校验。模型包装总量不得直接进入药品处方；只调用 hydrate、只在展示层 normalize 或只在提交 payload 时补字段均不满足门禁。
11. **Tauri capability 同步**：新增或首次调用 Tauri JS API 时，必须同时核对 `src-tauri/capabilities/*.json` 中对应的 `allow-*` 权限，并执行会真实触发该 API 的 Tauri 运行时冒烟；`type-check`、浏览器单测和 `cargo check` 不能替代 capability 验证。
12. **复诊配药确认事实门禁**：动态确认项可以由模型生成并默认推荐，但推荐值不得在医生点击最终确认前写入现病史；文字/语音补充是医生独立补充说明，不得反向重生成或改写确认项。最终现病史只消费已确认 `recordText`、模型压缩后的医生补充和必要历史事实，禁止直接原样拼接冗余口语、库存、推荐方案或模型未确认推断；药品在正文中只保留规范名称。
13. **PHIS 历史处方属性来源**：药品一次剂量、频次、用法、天数、总量和包装单位优先读取 `loadClinicMedicalRecord.presList[].presSubList[]`，在 `services/his` Adapter 内映射为中性字段；`orderList` 只作医嘱分类、检验检查关联和缺失兜底。不得把 `takeDays` 等 PHIS 命名字段加入中性 DTO，也不得在无法按 `idOrd / idMedPro / 唯一规范药名` 关联时猜测继承。
14. **正式产品辅助文案门禁**：正式业务界面只常驻展示用户完成当前任务所需的信息、状态和操作。不得为了说明实现流程、设计意图或安全立场，在卡片、按钮或区块下方追加“小说明”式辅助文字；安全与流程约束优先由操作状态、确认步骤和程序门禁表达。只有用户必须据此作出决定或处理异常时，才展示简洁、可行动的提示。

## 推荐提交流程

1. 先更新文档
2. 再改代码
3. 最后附上验证结果：
   - `yarn type-check` / 阻塞原因
   - `yarn build` / 阻塞原因
   - `cargo check`
   - `yarn test:unit`（引入 Vitest 且命中已覆盖模块时）
   - 必要的手测结论

## 工具使用
[Calicat MCP 使用说明]

在收到 calicat.cn 域名的连接时，不要直接尝试访问，而是通过 Calicat MCP 相关工具的说明获取数据。
get_meta_data 工具获取到的是大致的图层骨架结构，使用此工具可用较少的 Token 快速浏览页面设计、检索图层。get_meta_data 获取到的数据不能直接用作前端代码生成。
get_design_data 工具用于获取指定图层的详细设计数据，在你开始实际的前端代码生成前，确保你通过 get_design_data 获取到了图层的详细设计数据，并以此为基础进行前端代码生成。
