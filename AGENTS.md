# AGENTS.md

`floating-ball` 项目的协作规则。

本项目是一个 `Tauri 2 + Vue 3 + TypeScript + Rust` 的基层医疗桌面工作站，当前真实运行形态包含：

1. 完整症状问诊主链路与主问诊内嵌灵活模式（`ConsultationPage.vue`）
2. 独立诊断路径窗口（`DiagnosisPathWindow.vue`）
3. 语音问诊与病历回写链路
4. 本地 HTTP Bridge 与 PHIS 引用回执入口（`src-tauri/src/http_server.rs`）
5. 本地/外部知识库能力（`pmphai.ts` 为主，`KnowledgeBasePanel.vue` 为保留内置面板）

## 必读顺序

1. 先读 [ARCHITECTURE.md](./ARCHITECTURE.md)
2. 涉及本地 HIS 联调时再读 [api.md](./api.md)
3. 涉及交互、产品约束时再读 [PRODUCT.md](./PRODUCT.md)
4. 只有在做未来区域化改造时，才读取 `docs/regionalization/*.md`

## 强制流程

1. 文档先行：架构、窗口形态、事件流、回写行为、模块职责变化，先改文档再改代码。
2. 契约同步：`src-tauri/src/http_server.rs` 或 `complete_consultation` 结果结构变化时，必须同步更新 `api.md`。
3. 规则同步：包管理器、验证命令、目录职责、Review 关注点变化时，必须同步更新本文件。
4. 交付顺序：`ARCHITECTURE/API/PRODUCT/AGENTS -> 代码 -> 构建/测试/手测说明`

## 当前架构基线

### 入口编排

1. `src/App.vue` 只负责全局状态编排、窗口视图切换、根组件装配。
2. 窗口/导航/事件/语音逻辑优先放在 composables，而不是继续堆回 `App.vue`。

### 核心视图

1. `ConsultationPage.vue`
   - 仍是完整问诊主流程的权威实现。
   - `/api/consultation/assist`、工具栏灵活模式入口和 PHIS 引用回执后的页面状态恢复，默认都以这里为准。
   - 诊断、用药、检查的候选生成和标准库匹配规则以这里为准。
2. `DiagnosisPathWindow.vue`
   - 只负责解释和可视化，不成为新的诊断真相源。
3. `VoiceConsultationResult.vue`
   - 负责语音病历人工确认后的回传，不直接定义新的本地结果契约。

### 状态层

1. `ref/reactive` 仍是默认状态方案。
2. Pinia 目前只有两类权威共享状态：
   - `stores/consultationConfig.ts`
   - `stores/diagnosisPath.ts`
3. 不要为临时 UI 状态盲目新增 store。

### 服务层

1. `llm.ts`、`aliyunSpeech.ts`、`audioRecorder.ts` 负责模型与语音能力。
2. `diagnosisPath.ts` 负责诊断路径数据装配；`types/consultationAssist.ts` 负责主问诊灵活模式类型定义。
3. `medicalData.ts` 是标准库匹配与诊断章节分组的权威来源。
4. `pmphai.ts` 是当前主用的知识库外部集成入口。
5. `knowledgeBase.ts` / `KnowledgeBasePanel.vue` 目前保留为内置知识库面板能力，若继续演进，必须先明确它和 `pmphai.ts` 的主次关系。

## 文档更新矩阵

1. 组件、composable、store、service 职责变化：更新 `ARCHITECTURE.md`
2. 本地 HTTP Bridge 接口、字段、回写结果变化：更新 `api.md`
3. 医生交互约束、灵活模式门禁、引用闭环变化：更新 `PRODUCT.md`
4. 协作流程、验证命令、Review 热点变化：更新 `AGENTS.md`

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

## Review 重点

1. `currentPatient` 的标识字段映射必须优先考虑 `idPi / patientId`，不能只依赖宽泛的 `id`
2. 任何写回本地结果通道的代码都要核对 `consultationId`、`resultType`、`requestId`、`referenceStatus`、可选字段和 HIS 轮询行为
3. `ConsultationPage` 灵活模式不能重新引入一套独立于完整问诊的诊断/用药/检查推荐规则
4. 诊断路径缓存相关改动，必须评估“同患者重复接诊”污染风险与缓存误命中风险
5. 涉及 `emit('minimize')`、`exitWork()`、`handleCollapse()` 的改动，必须区分“同一运行期内保留现场”和“真正持久化恢复”，不要把内存保活误写成已落盘
6. 修改 `windowSizes.ts`、`useWorkMode.ts`、`useWindowManagement.ts` 时，必须同步校验窗口尺寸、显示器边界和动画原点
7. `DiagnosisPathWindow.vue`、`diagnosisPath.ts`、`stores/diagnosisPath.ts` 的改动必须同时检查窗口生命周期、渲染就绪事件和缓存 key 策略
8. 知识库相关改动要明确是走 `pmphai.ts` 主链路，还是启用内置 `KnowledgeBasePanel.vue`，避免双轨长期漂移

## 推荐提交流程

1. 先更新文档
2. 再改代码
3. 最后附上验证结果：
   - `yarn build` / 阻塞原因
   - `cargo check`
   - 必要的手测结论
