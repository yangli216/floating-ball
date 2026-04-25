# AGENTS.md

`floating-ball` 项目的协作规则。

本项目是一个 `Tauri 2 + Vue 3 + TypeScript + Rust` 的基层医疗桌面工作站，当前真实运行形态包含：

1. 完整症状问诊主链路与主问诊内嵌灵活模式（`ConsultationPage.vue`）
2. 独立诊断路径窗口（`DiagnosisPathWindow.vue`）
3. 语音问诊与病历回写链路
4. 本地 HTTP Bridge 与 PHIS 引用回执入口（`src-tauri/src/http_server.rs`）
5. 本地/外部知识库能力（`pmphai.ts` 为主，`KnowledgeBasePanel.vue` 为保留内置面板）

## 必读顺序

1. 先读 [CODE_MAP.md](./CODE_MAP.md) 快速定位要改的模块，按需深入
2. 再读 [ARCHITECTURE.md](./ARCHITECTURE.md) 理解整体架构
3. 涉及本地 HIS 联调时再读 [api.md](./api.md)
4. 涉及交互、产品约束时再读 [PRODUCT.md](./PRODUCT.md)
5. 遇到疑似踩过的坑时，先查 [RETRO.md](./RETRO.md) 已有经验
6. 只有在做未来区域化改造时，才读取 `docs/regionalization/*.md`

## 强制流程

1. 文档先行：架构、窗口形态、事件流、回写行为、模块职责变化，先改文档再改代码。
2. 契约同步：`src-tauri/src/http_server.rs` 或 `complete_consultation` 结果结构变化时，必须同步更新 `api.md`。
3. 规则同步：包管理器、验证命令、目录职责、Review 关注点变化时，必须同步更新本文件。
4. 交付顺序：`ARCHITECTURE/API/PRODUCT/AGENTS -> 代码 -> 构建/测试/手测说明`

## 硬约束（禁止）

以下规则优先级高于一切建议性条款，违反即视为无效交付：

1. **ConsultationPage.vue 冻结堆砌**：该文件已超 1300 行，禁止继续向其中添加新功能或新 UI 区块；新能力必须先拆出独立 composable 或子组件，经人工确认后才可合入。
2. **App.vue 不承接新业务逻辑**：新逻辑必须放入 composable，App.vue 只做编排。
3. **跨层调用禁止**：Service 不能直接操作 UI 状态；Store 只暴露显式 action，外部不得直接 mutate state。
4. **单边契约变更禁止**：修改 `http_server.rs` 接口定义而不同步更新 `api.md`，视为无效交付。修改前端调用而不同步更新后端实现和文档，同理。
5. **盲目新增全局状态禁止**：不得为临时 UI 状态新增 Pinia store；新增 store 必须先说明为什么 ref/reactive 不够用。
6. **锁文件混用禁止**：除非任务明确是"统一包管理器"，否则不得混用 npm/yarn/pnpm 安装或刷新锁文件。

## 棘轮式治理

以下模块已识别为高风险区域，改动时必须执行对应的额外约束：

| 文件/模块 | 当前风险 | 约束 |
| --- | --- | --- |
| `ConsultationPage.vue` | 1300+ 行，职责过重 | 只允许拆分和缩减，不允许净增行数 |
| `useEventListeners.ts` | 475 行，监听器集中 | 新增监听器必须说明为什么不能放在更局部的 composable |
| `useWindowManagement.ts` | 422 行 | 窗口尺寸/位置改动必须同步校验多显示器边界 |
| `http_server.rs` 接口定义 | 共享契约 | 任何字段变更必须同步 api.md + 前端调用方 |

治理原则：每轮迭代只允许往"更好"的方向变化。如果一次改动会让上述文件变得更大或职责更模糊，必须先拆解再继续。

## 当前架构基线

-> 见 [ARCHITECTURE.md](./ARCHITECTURE.md)，该文件是架构的唯一真实来源。

以下仅列出 AGENTS.md 层面需要额外强调的架构约束（不重复 ARCHITECTURE.md 已有内容）：

1. `ConsultationPage.vue` 是完整问诊 + 灵活模式的唯一落点，不允许维护第二套推荐口径。
2. Pinia 当前只有 `consultationConfig` 和 `diagnosisPath` 两个权威 store，新增需人工审批。
3. 知识库入口主次关系：`pmphai.ts` 为主，`KnowledgeBasePanel.vue` 为保留备选。

## 工程复盘

-> 见 [RETRO.md](./RETRO.md)，记录开发过程中反复出现的错误和 vibe coding 典型困难。

1. 遇到似曾相识的问题时，先查 RETRO.md 是否已有记录和解决方案。
2. 新发现的典型错误或反复踩坑，必须追加到 RETRO.md（使用文件末尾的模板）。
3. 如果某条经验足够通用且反复触发，应升级为本文件的硬约束或棘轮条目。

## 文档更新矩阵

1. 组件、composable、store、service 职责变化：更新 `ARCHITECTURE.md`
2. 本地 HTTP Bridge 接口、字段、回写结果变化：更新 `api.md`
3. 医生交互约束、灵活模式门禁、引用闭环变化：更新 `PRODUCT.md`
4. 协作流程、验证命令、Review 热点变化：更新 `AGENTS.md`
5. 开发错误、踩坑经验、反复出现的困难：更新 `RETRO.md`
6. 模块新增/删除/重命名、文件职责迁移、依赖关系/数据流变更：更新 `CODE_MAP.md`

## 包管理与命令约束

1. 默认使用 `yarn`：
   - `yarn install`
   - `yarn build`
   - `yarn tauri dev`
2. 仓库当前同时存在 `yarn.lock`、`package-lock.json`、`pnpm-lock.yaml` 的历史痕迹。
3. 除非任务明确是“统一包管理器”，否则不要顺手刷新或新增另一套锁文件。
4. 遇到依赖损坏时，先在交付说明中记录现状；不要无理由混用 `npm`/`yarn`/`pnpm` 重新安装。

## 最小质量门禁

1. 前端至少执行 `yarn build`
2. Tauri/Rust 侧至少执行 `cargo check`
3. 若无法完成构建，必须说明阻塞原因，并补充关键路径手测或静态审查结论

## 关键手测清单

1. `start-consultation` 能正确唤起完整问诊主流程
2. `/api/consultation/assist`（内部仍复用 `start-consultation-session` 事件名）会打开 `ConsultationPage` 灵活模式，并且每次只消费一个目标动作
3. 病历详情里的“回写病历”会写入 `draft` 结果；“引用诊断/用药/检查”会写入 `reference-request`
4. `POST /api/consultation/reference-feedback` 返回后，当前页面和 `/api/consultation/result` 都能看到最新 `referenceStatus`
5. `consultationId` 与当前患者/当前就诊上下文匹配，不读到旧结果
6. 诊断保持单选并引用当前选中项；推荐用药、检查检验支持多选后按分组一次引入所选项
7. 点击“引用诊断/用药/检查”后窗口不会自动收起，医生仍可继续当前问诊；PHIS 回执返回后当前页面状态会即时更新
8. 语音问诊确认后能写回同一条本地结果通道
9. 诊断路径窗口能够正确复用缓存并在超时/失败时显示明确状态

## Review 门禁

以下改动模式已反复出现问题，必须在提交前逐条核对（不是建议，是门禁）：

1. `currentPatient` 的标识字段映射必须优先考虑 `idPi / patientId`，不能只依赖宽泛的 `id`
2. 任何写回本地结果通道的代码都要核对 `consultationId`、`resultType`、`requestId`、`referenceStatus`、可选字段和 HIS 轮询行为
3. `ConsultationPage` 灵活模式不能重新引入一套独立于完整问诊的诊断/用药/检查推荐规则
4. 诊断路径缓存相关改动，必须评估“同患者重复接诊”污染风险与缓存误命中风险
5. 涉及 `emit('minimize')`、`exitWork()`、`handleCollapse()` 的改动，必须区分“同一运行期内保留现场”和“真正持久化恢复”，不要把内存保活误写成已落盘
6. 修改 `windowSizes.ts`、`useWorkMode.ts`、`useWindowManagement.ts` 时，必须同步校验窗口尺寸、显示器边界和动画原点
7. `DiagnosisPathWindow.vue`、`diagnosisPath.ts`、`stores/diagnosisPath.ts` 的改动必须同时检查窗口生命周期、渲染就绪事件和缓存 key 策略
8. 知识库相关改动要明确是走 `pmphai.ts` 主链路，还是启用内置 `KnowledgeBasePanel.vue`，避免双轨长期漂移
9. **HIS 调用边界**：业务代码（`components/` / `composables/` / `services/` 中除 `services/his/*` 之外）禁止直接 `import ... from 'services/hisService'`。必须经 `services/his` 入口：业务调用走 `getHisAdapter()`，仅 SDK handshake / 区域化 bootstrap 等认证场景允许使用 `services/his` 重导出的 `getHisService` / `resetHisService`。新增 PHIS 私有字段读取必须通过 `entry.raw.xxx` 透传，不允许在中性 DTO 上加 PHIS 命名字段。

## 推荐提交流程

1. 先更新文档
2. 再改代码
3. 最后附上验证结果：
   - `yarn build` / 阻塞原因
   - `cargo check`
   - 必要的手测结论
