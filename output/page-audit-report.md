# PCIE 页面实现审查与截图

审查日期：2026-07-22

## 结论

已覆盖当前 `ViewType` 的 17 个视图、2 个独立窗口，以及悬浮球、强制升级门禁和问题反馈，共 22 个界面状态。所有截图均由生产 Vue 组件直接构建，并注入脱敏模拟数据；没有接入真实患者、HIS 或远端 AI。

总体视觉完成度较高，报告解读、患者画像、复诊配药、HIS 日志等复杂工作台已经具备清晰的信息层级。审查发现的 3 组 P1 问题及“多个核心入口不能完整键盘操作”P2 问题已于 2026-07-22 修复：外部 HTML 在解析/渲染前统一白名单净化并启用 Tauri CSP，强制升级门禁与更新检查共用策略状态，鉴别诊断的系统异常与临床风险分离；悬浮球、问诊选择、接诊胶囊和设置入口改用原生按钮语义，并新增统一、可配置的应用内快捷键。

验证结果：

- `yarn test:unit`：66 个测试文件、231 个测试全部通过。
- `yarn type-check`、`yarn build`、`cargo check`：通过。
- `yarn tauri dev`：当前源码编译并启动成功，160×160 悬浮球在 CSP 下正常渲染，启动日志未发现 CSP/脚本加载错误。
- 独立页面审查构建：通过；22 个目标尺寸页面已完成浏览器渲染与截图。
- P1 状态回归：鉴别诊断系统错误态、强制升级无安装包态均已用生产 Vue 组件重新构建并截图。
- P2 键盘回归：浏览器可访问性树确认问诊分类/症状与接诊胶囊动作均为按钮；实测快捷键重新录入、重复冲突提示、保存后重载恢复均通过。
- 未接入真实患者、HIS 或远端 AI；院端知识正文、病历长表格与图片仍需在真实数据联调中持续观察 CSP/净化兼容性。

## 优先问题

| 优先级 | 问题 | 影响与证据 |
| --- | --- | --- |
| P1 · 已修复 | 住院病历与知识详情存在 WebView 内容注入面 | 新增共享 HTML 白名单净化：阻断脚本、事件属性、危险 URL/CSS 与主动内容，同时保留病历模板的结构、样式和 `data-*` 字段；住院模板在解析、填充、编辑预览和 HIS 正文展示前均净化。知识详情复用同一边界，知识 iframe 增加空权限 `sandbox` 与 `no-referrer`，Tauri 启用 CSP。自动化测试覆盖恶意模板与 CSP 配置。 |
| P1 · 已修复 | 强制升级门禁可能给出相互矛盾的状态 | `ForceUpdateGate` 将策略状态传给 `UpdateChecker`；只要强更策略仍生效，updater 返回空值就显示版本差距、更新源/管理员处置和重试动作，不再进入“当前已是最新版本”。单元测试与页面截图均已验证。 |
| P1 · 已修复 | 鉴别诊断把技术异常伪装成临床高风险 | 新增独立的 `systemError` 和临床风险模型；网络、模型和 JS 运行时异常使用中性系统错误态与重试动作，只有成功解析出的诊断不匹配才进入“发现 N 个问题”及临床风险列表。原始 JS TypeError 不再暴露给医生。 |
| P2 | 患者画像多处交互是视觉按钮但没有行为 | “依据：N 条关键证据”和时间线“查看证据”按钮没有点击处理；“已完成”与自定义关注只保存在组件局部状态，离开页面即丢失。 |
| P2 · 已修复 | 多个核心入口不能完整键盘操作 | 悬浮球、问诊分类/症状、人体部位/系统选项、接诊胶囊关闭/风险展开、缓存与 HIS 日志入口已改为原生按钮或补齐 SVG 按钮语义、Enter/Space 与可见焦点。新增本地快捷键模型和唯一 App 级监听器；默认 `Cmd/Ctrl+Shift+Space` 切换悬浮球/工作区、`Cmd/Ctrl+Shift+C` 打开对话、`Cmd/Ctrl+,` 打开设置，可在通用设置重新录入、清除、恢复默认。输入框、输入法组合态、模态框、强更门禁与窗口切换过程不会被截获；重复及系统/编辑保留组合会当场拒绝。 |
| P2 | 页面级组件继续过度集中 | `ConsultationPage.vue` 2433 行、`VoiceConsultationNew.vue` 2798 行、`InpatientEmrPage.vue` 2021 行、`PatientMemoryWorkspace.vue` 1530 行。问诊页已超过项目规则中的冻结阈值，后续改动回归面很大。 |
| P3 | 378×449 设置窗口的固定保存栏占用过多首屏 | 即使没有未保存修改，底部仍展示状态和整宽禁用“已保存”按钮，压缩了通用设置的首屏，第二个设置卡片只露出顶部。 |
| 待产品确认 | 非关键风险 10 秒后自动关闭 | `RiskAlertPanel` 对仅有 level 3 风险的情况自动关闭。临床风险提示是否允许无确认消失，需要明确产品/安全规则。 |

## 逐页审查

### 01 悬浮球

结论：视觉简洁，初始球态与 160×160 原生窗口一致。P2 已修复：悬浮球使用原生按钮，Enter/Space 等同于双击唤起或恢复，并提供清晰的 `:focus-visible`；环形菜单仍遵守产品约束，只随鼠标悬停展开，键盘用户通过统一快捷键进入对话和设置。

![悬浮球](/Users/das/SourceCode/regional-ai-workspace/pcie/output/playwright/01-floating-ball-code.png)

真实 Tauri WebView 启动冒烟：

![真实 Tauri 悬浮球](/Users/das/SourceCode/regional-ai-workspace/pcie/output/playwright/01-floating-ball-tauri-runtime.png)

### 02 全医慧助聊天

结论：420×620 窄高布局合理，欢迎区、消息区、输入区层级清楚；输入框和图标按钮已有可访问名称，Markdown 禁用了原始 HTML。实现文件仍偏大（842 行），但本轮未发现阻断问题。

![聊天页](/Users/das/SourceCode/regional-ai-workspace/pcie/output/playwright/02-chat.png)

### 03 系统设置

结论：主题选择清楚，页签结构稳定。P2 已修复：通用设置首屏新增快捷键卡片，可重新录入、单项清除、恢复默认，并与原设置保存栏共用未保存/保存状态；重复或保留键会即时提示，缓存管理和 HIS 日志入口已改为原生按钮。固定保存栏在“已保存”状态仍占用约两行高度，继续作为 P3 观察项。

![系统设置与默认快捷键](/Users/das/SourceCode/regional-ai-workspace/pcie/output/playwright/03-settings-keyboard-shortcuts.png)

### 04 智能问诊

结论：患者上下文与左右分区明确，但初始态主内容区留白偏大，底部主动作离当前选择区域较远。P2 已修复：常用症状分类、症状列表、按系统卡片与人体 SVG 部位均能通过 Tab 定位并用 Enter/Space 操作，选中态通过 `aria-pressed` 暴露；`ConsultationPage.vue` 本次保持净零行增长，页面整体 2433 行的拆分风险仍存在。

![智能问诊](/Users/das/SourceCode/regional-ai-workspace/pcie/output/playwright/04-consultation.png)

### 05 风险提示

结论：风险颜色、内容和“我已知悉”动作清楚，关键风险不会自动关闭；仅 level 3 风险会在 10 秒后自动关闭，需产品确认。建议容器增加 `role="alert"` 或可访问的优先级文本。

![风险提示](/Users/das/SourceCode/regional-ai-workspace/pcie/output/playwright/05-risk-alert.png)

### 06 语音采集胶囊

结论：360×80 录音态非常紧凑，计时和暂停/结束/收起动作一眼可见。图标按钮主要依赖 `title`，建议补 `aria-label`；停录预览行使用点击容器，也需键盘等价操作。

![语音采集胶囊](/Users/das/SourceCode/regional-ai-workspace/pcie/output/playwright/06-voice-capsule.png)

### 07 接诊风险胶囊

结论：患者、风险、报告助手、复诊配药在 280×200 内仍能形成清楚顺序。P2 已修复：关闭和风险展开均为原生按钮，风险按钮提供动态可访问名称、`aria-expanded` 与详情关联，并具备可见键盘焦点。

![接诊风险胶囊](/Users/das/SourceCode/regional-ai-workspace/pcie/output/playwright/07-reception-capsule.png)

### 08 复诊配药确认

结论：本轮完成度最好的页面之一。事实依据、确认项、补充说明和最终动作层级清晰，主按钮也明确表达“确认并生成病历”。模拟环境没有真实生成服务，但静态交互结构成立。

![复诊配药确认](/Users/das/SourceCode/regional-ai-workspace/pcie/output/playwright/08-chronic-refill.png)

### 09 问诊结果 / 语音问诊

结论：病历与诊疗建议双栏编辑结构完整，必填、匹配状态和底部动作可识别；信息密度高但可滚动。截图中的目录未匹配是模拟环境限制。主实现 `VoiceConsultationNew.vue` 达 2798 行，建议按病历编辑、推荐编辑、反馈与提交状态拆分。

![问诊结果](/Users/das/SourceCode/regional-ai-workspace/pcie/output/playwright/09-clinical-result.png)

### 10 独立诊疗方案

结论：药品、检查、检验、处置按类分区，失败状态局部化且保留其他内容，底部回写动作结构清楚。截图中的四类生成失败由审查构建未接远端服务造成，不作为生产缺陷；当前仅提供全局刷新，后续可考虑分区重试。

![独立诊疗方案](/Users/das/SourceCode/regional-ai-workspace/pcie/output/playwright/10-treatment-plan.png)

### 11 门诊复诊工作台

结论：左侧复诊依据、右侧方案的空间关系合理，医生能同时核对原病历/报告与后续处置。模拟环境中的生成失败不计入生产缺陷；真实联调时应重点验证四类推荐的部分成功和回写门禁。

![门诊复诊](/Users/das/SourceCode/regional-ai-workspace/pcie/output/playwright/11-outpatient-follow-up.png)

### 12 报告助手工作台

结论：近 14 天时间轴和原始报告/AI 解读切换清晰。在只有报告摘要、没有正文时，页面会明确禁用 AI 解读，没有把摘要冒充完整报告，这一安全边界是正确的；空白区域可以再增强下一步说明。

![报告助手工作台](/Users/das/SourceCode/regional-ai-workspace/pcie/output/playwright/12-report-workspace.png)

### 13 患者健康画像

结论：三栏结构、冲突警示、纵向时间线、风险与趋势形成了很强的临床概览。当前“依据”和“查看证据”是无行为按钮；行动勾选与医生备注也只存在本地组件状态。页面 1530 行，建议先补行为契约再拆分。

![患者健康画像](/Users/das/SourceCode/regional-ai-workspace/pcie/output/playwright/13-patient-memory.png)

### 14 住院病历生成

结论：生成前补充要点的弹窗流程清楚，时间范围、字段快捷补充和主动作合理。P1 已修复：模板/HIS HTML 在解析和渲染前统一经过白名单净化，Tauri 已启用 CSP；仍需用院端真实长病历、图片和复杂表格验证兼容性。

![住院病历生成](/Users/das/SourceCode/regional-ai-workspace/pcie/output/playwright/14-inpatient-emr.png)

### 15 鉴别诊断

结论：360×640 小窗可以承载鉴别清单。P1 已修复并重拍：系统生成失败现在显示为中性“鉴别诊断生成失败”，提供重试动作，不再出现临床高风险徽标或原始 JS 错误；成功解析出的诊断不匹配仍保留原临床风险表达。

![鉴别诊断](/Users/das/SourceCode/regional-ai-workspace/pcie/output/playwright/15-differential-diagnosis.png)

### 16 知识库检索

结论：未配置状态的说明直接、没有伪造检索能力。P1 已修复：服务端知识正文改用共享白名单净化，外部知识页使用空权限 `sandbox` 与 `no-referrer`，并由 Tauri CSP 提供第二层限制。

![知识库检索](/Users/das/SourceCode/regional-ai-workspace/pcie/output/playwright/16-knowledge-base.png)

### 17 HIS 联调日志

结论：主从列表、traceId、方向/状态、请求/响应摘要都适合排障，清空前已有系统确认。筛选输入与下拉缺少显式 label/aria-label，键盘和读屏体验可补齐；真实联调还需复核脱敏字段覆盖。

![HIS 联调日志](/Users/das/SourceCode/regional-ai-workspace/pcie/output/playwright/17-his-log.png)

### 18 基础数据缓存

结论：目录数量、总缓存、最近同步、数据库位置和同步动作一屏可见，结构清晰。清理/强制同步属于高影响动作，真实手测需覆盖确认、失败恢复和机构/租户范围，当前截图未执行这些写操作。

![基础数据缓存](/Users/das/SourceCode/regional-ai-workspace/pcie/output/playwright/18-medical-cache.png)

### 19 诊断推理路径

结论：右侧结论、证据与鉴别点便于解释模型结果；Sankey 初始视图上半区留白较多、主要节点集中在下方，建议按节点数量自适应垂直分布。缩放/拖动/重置入口清楚。

![诊断推理路径](/Users/das/SourceCode/regional-ai-workspace/pcie/output/playwright/19-diagnosis-path.png)

### 20 单报告 AI 解读

结论：患者/门诊/报告元数据、异常项、综合判断和临床意义层级完整，异常数值与解释关系清楚；下载与关闭动作位置合理。仍需在真实报告数据上验证长表格、超长单位和打印/导出分页。

![单报告 AI 解读](/Users/das/SourceCode/regional-ai-workspace/pcie/output/playwright/20-report-window.png)

### 21 强制升级

结论：版本三元组和阻断原因表达清楚。P1 已修复并重拍：内层更新检查消费外层强更策略；当未获取到安装包时，页面明确说明当前版本仍低于最低要求，并给出检查更新源、联系管理员和重试动作，不再展示“当前已是最新版本”。

![强制升级](/Users/das/SourceCode/regional-ai-workspace/pcie/output/playwright/21-force-update.png)

### 22 问题反馈

结论：评分、问题类型、补充说明、字符计数和可选截图组成完整反馈表单，未填写时禁用提交符合预期。截图入口默认折叠，减少视觉负担；真实 Tauri 中仍需验证屏幕捕获权限、拒绝授权和图片大小限制。

![问题反馈](/Users/das/SourceCode/regional-ai-workspace/pcie/output/playwright/22-feedback.png)

## 建议处理顺序

1. 在真实 Tauri WebView 中用院端病历模板、知识正文与图片做 CSP/净化兼容回归，禁止为兼容内容重新放开脚本或主动内容。
2. 补齐患者画像证据行为与状态持久化，并继续抽查语音采集等次级入口的键盘可访问性。
3. 按现有项目规则逐步拆分问诊、语音结果、住院病历、患者画像等超大页面组件。
