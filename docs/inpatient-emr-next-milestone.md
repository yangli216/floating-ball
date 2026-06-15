# 住院病历生成下一里程碑

> 目标：在初稿可用基础上，把入院记录生成从“能跑通”推进到“可维护、可回归、可联调排障”。

## 当前基线

1. 入口仍为 `POST /api/inpatient/emr/generate` / `sdk.generateInpatientEmr(...)`，打开 `features/inpatient-emr` 独立工作视图。
2. HIS 住院上下文统一走 `HisAdapter.fetchInpatientEmrContext`，PHIS 实现只调用 `api/phis.aiInpatientEmrContextService/buildContext`，不再维护登记 / 医嘱 / 体温单分散 RPC 回退。
3. 入院记录可引用门诊就诊历史：先拉 `getLookMedList` 文书列表，再按 `idMedrecdoc` 拉 `getMedContentLook` HTML 正文。
4. 门诊病历正文与医生补充要点不是二选一，两者可以共同作为入院记录书写依据。
5. 模板解析优先使用区域化后端 `templates/resolve` 缓存命中结果，未命中或不可用时才走本地解析兜底。
6. 病历预览中 AI 字段可编辑，非 AI 字段只读并保留 HIS 模板默认值；回写只提交 AI 字段级 `fieldValues`。

## 本轮走查清理结果

1. 删除了非流式 `generateInpatientEmrPreview` 旧入口，当前 UI 只保留流式生成链路。
2. 删除了重复的 `formatOutpatientRecordForAi`，保留 `inpatientEmrPrompts.ts` 中的唯一提示词格式化实现。
3. 删除了未使用的 `generateFieldValuesWithAi`、`getLatestTemperatureRecord` 等过程 helper。
4. 收缩 `HisAdapter` 住院上下文契约，移除废弃的诊断 / 医嘱 / 体温单 / 登记分散方法。
5. 删除 `PhisHisAdapter` 与 `hisService.ts` 中旧分散 PHIS 住院接口映射，只保留 `buildContext` 聚合入口。
6. 将 Mock 适配器里的分散住院方法改为内部 helper，避免误作为厂商适配契约。

## 主要风险

1. `InpatientEmrPage.vue` 仍承担页面布局、门诊引用、补充弹窗、预览编辑、回写状态等多类职责，后续需求继续加在该文件会迅速失控。
2. `inpatientEmrService.ts` 同时负责 HIS 上下文整理、模板解析兜底、提示词调用、字段合并和 fallback 文案，领域边界仍偏宽。
3. `PhisHisAdapter.ts` 仍包含目录、详情、患者、门诊历史、门诊病历正文等多组映射逻辑，PHIS 联调问题定位成本偏高。
4. 入院记录生成策略高度依赖 prompt 约束，缺少针对“门诊病历 + 补充要点共同归纳，而非原样搬运”的自动化回归样例。
5. 模板缓存命中、门诊正文获取、AI 流式解析、医生手动编辑与回写回执之间缺少统一 trace，联调时难以快速判断慢在哪里、错在哪一层。

## M2 迭代范围

### 1. 前端结构收敛

目标：让 `InpatientEmrPage.vue` 回到编排层，页面复杂度可继续下降。

建议拆分：

1. `InpatientProgressPanel.vue`：步骤条与生成字段状态。
2. `OutpatientRecordReferencePanel.vue`：门诊就诊卡片、引用状态、查看入口。
3. `OutpatientRecordPreviewDialog.vue`：门诊 HTML 正文预览。
4. `InpatientSupplementDialog.vue`：补充要点、语音转写、重新生成入口。
5. `InpatientEmrPreviewEditor.vue`：只读模板预览、AI 字段高亮编辑、分页 / 缩放容器。
6. `useInpatientOutpatientReference.ts`：门诊历史与正文选择状态。
7. `useInpatientSupplementCapture.ts`：补充要点、语音录入和等待生成门禁。
8. `useInpatientWriteback.ts`：字段确认、结果事件、回执状态。

验收：

1. `InpatientEmrPage.vue` 净行数下降 35% 以上，且不再承接新增业务逻辑。
2. 门诊引用、补充要点、预览编辑、回写状态各自可独立阅读和测试。
3. 现有截图中的弹窗宽度、按钮禁用态、模板标题保留、门诊卡片不显示主诉均无回归。

### 2. 生成引擎可回归

目标：把“入院记录书写策略”固化成可测试的规则。

建议工作：

1. 抽出 `admissionRecordStrategy`，集中处理入院记录字段选择、等待输入条件、fallback 文案和 prompt 规则。
2. 为 `parsePartialJson`、模板字段识别、非 AI 字段保留、区域化模板缓存优先级补单元测试。
3. 增加 prompt 快照样例，覆盖“仅补充要点”“仅门诊正文”“门诊正文 + 补充要点共存”“正文接口失败仅文书列表”的四类输入。
4. 增加生成结果后处理测试，确保门诊主诉 / 现病史不会被无脑复制到入院记录字段。

验收：

1. 有最小单元测试覆盖生成门禁、prompt 构造和字段合并关键路径。
2. AI 失败、返回不完整 JSON、门诊正文不可用时仍能生成可编辑 fallback 预览。
3. 入院记录 prompt 明确要求按住院书写角度重组语言，并能在测试快照中看见门诊和补充要点同时存在。

### 3. HIS/PHIS 适配瘦身

目标：让 PHIS 适配器从“大杂烩 mapper”变成清晰的出站适配层。

建议工作：

1. 将门诊历史、门诊文书列表、门诊正文映射拆到 `services/his/phis/outpatientRecords.ts`。
2. 将通用 PHIS 字段读取 helper 拆到 `services/his/phis/fieldReaders.ts`，避免适配器继续增长。
3. 为门诊正文获取增加同一 `visitId + idMedrecdoc` 的运行期去重和短缓存，避免反复点击导致重复 RPC。
4. 记录 `idTet / idApp / idHospital / idMedrecdoc / courseShow` 这类联调关键参数，但日志中不落病历正文。

验收：

1. `PhisHisAdapter.ts` 继续下降到 600 行以内，新增 PHIS 门诊引用逻辑不直接堆在适配器主文件。
2. 同一门诊文书重复打开不重复请求正文，除非医生显式刷新。
3. HIS 调用边界继续满足：业务代码只经 `getHisAdapter()`，不直接 import `hisService.ts`。

### 4. 联调可观测与回写前质控

目标：让医生和实施都能看懂“生成依据、生成状态、质控提醒和回写结果”。

本轮落地：

1. 生成结果新增结构化 `trace`，覆盖 HIS 聚合上下文、门诊正文、模板解析、AI 首 token / 总耗时、回写发送与回执耗时。
2. 生成结果新增 `evidenceSummary`，并在统一“生成过程”面板中随步骤展示住院上下文、门诊病历、补充要点、模板缓存是否参与生成；耗时统一进入 trace 明细。
3. 一键回写前改为本地轻量质控：无风险项直接发送回写，有风险项才弹出提醒，医生可返回预览修改或确认继续回写。
4. 回写失败回执继续保留当前编辑现场，医生可调整后重试。
5. 生成完成、回写发送、回执到达时写入本地 HIS 集成日志，导出日志可按 traceId 查看各阶段状态与耗时；日志只记录阶段、耗时、计数和标识符，不记录病历正文。

建议工作：

1. 增加住院病历生成 trace：模板缓存命中、HIS 聚合上下文耗时、门诊正文耗时、AI 首 token / 总耗时、回写回执耗时。
2. 在 UI 中把“引用依据摘要”和生成进度合并展示：住院上下文、门诊病历、补充要点分别对应到生成过程中的步骤。
3. 持续完善回写前质控规则，优先覆盖空字段、占位文本、生成兜底、住院上下文缺失和日期类风险。
4. 对失败状态区分：HIS 上下文失败、门诊正文失败、模板解析失败、AI 失败、回写回执失败。

验收：

1. 联调日志能定位一次入院记录生成慢在模板、HIS、门诊正文还是 AI。
2. 医生在预览中确认本次病历使用了哪些依据；只有存在风险项时才需要额外确认。
3. `reference-feedback` 成功后仍收起回小球，失败时保留当前编辑现场并给出可重试入口。

## 暂不纳入 M2

1. 多厂商模板配置后台。
2. 病历全文版本管理与审计归档。
3. 跨应用重启后的住院病历编辑现场恢复。
4. 基于完整 HTML 的服务端病历合成与 PDF 对比。

## 必跑验证

1. `yarn type-check`
2. `yarn build`
3. `cargo check`
4. 命中新增单元测试后补跑对应测试命令。
5. 手测 `/api/inpatient/emr/generate`、门诊病历引用、补充要点重新生成、AI 字段编辑、一键回写和 `reference-feedback` 成功 / 失败两条回执。
