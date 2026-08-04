# 工程复盘日志 (RETRO.md)

> **用途**: 记录开发过程中反复出现的错误、vibe coding 中遇到的典型困难、以及解决方案。
> 当类似问题再次出现时，先来这里查询，避免重复踩坑。
>
> **维护规则**:
> 1. 每条记录必须包含：现象、根因、是否已解决、解决方案（或规避方式）。
> 2. 未解决的问题必须标注 `[未解决]`，已解决的标注 `[已解决]`。
> 3. 新条目追加在对应分类末尾，不要打乱已有顺序。
> 4. 如果某条经验已经固化为 AGENTS.md 的硬约束或棘轮条目，在此标注"已升级为规则"并注明位置。

---

## 架构与模块边界

### RETRO-001: App.vue 膨胀为上帝类 [已解决]

- **现象**: App.vue 曾达到 1548 行，所有窗口管理、导航、语音、事件监听逻辑堆在一个文件里，改动互相干扰。
- **根因**: 早期 vibe coding 阶段没有模块边界约束，AI 默认把新逻辑加到最近的入口文件。
- **解决方案**: 2026-02-10 大规模重构，拆出 5 个 composable + 2 个常量文件 + 3 个样式模块，App.vue 降至 ~723 行。
- **后续防护**: 已升级为规则 -> `AGENTS.md` 硬约束第 2 条"App.vue 不承接新业务逻辑"。

### RETRO-002: ConsultationPage.vue 持续膨胀 [未解决]

- **现象**: 该文件当前 1300+ 行，承载完整问诊 + 灵活模式 + 诊断推荐 + 用药推荐 + 引用闭环，职责过重。
- **根因**: 灵活模式设计要求"不开第二套窗口"，所有 AI 模块的落点收敛到同一个组件，导致功能不断堆砌。
- **当前状态**: 已在 `AGENTS.md` 棘轮表中冻结（禁止净增行数），但尚未启动实际拆分。
- **待办**: 需要规划 composable 拆分方案，将诊断推荐、用药推荐、检查推荐各自抽离为独立逻辑单元。

---

## AI 生成质量

### RETRO-003: AI 重复造轮子而非复用已有代码 [未解决]

- **现象**: AI 在实现新功能时，经常重新编写已存在的逻辑（如医疗数据匹配、窗口尺寸计算），导致多处重复实现。
- **根因**: 上下文窗口有限，AI 未充分检索已有 service/composable 就开始编码。
- **规避方式**: 在任务描述中主动指定"先检查 services/ 和 composables/ 目录是否已有可复用实现"。

### RETRO-004: AI 对契约逐渐失焦 [未解决]

- **现象**: 长 session 后期，AI 对 api.md 定义的字段名、类型、可选性记忆模糊，生成的代码与契约不一致。
- **根因**: 上下文累积过多后，早期读取的契约信息被压缩或丢失。
- **规避方式**: 在涉及契约的任务中，要求 AI 在编码前重新读取 `api.md` 相关章节；已在 AGENTS.md "单边契约变更禁止"中做了制度约束。

---

## 状态与数据流

### RETRO-015: Windows 启动/设置页弹出 cmd 窗口 [已解决]

- **现象**: Windows 下应用启动、切换到通用设置页时，会短暂弹出多个 cmd 命令窗口；macOS 未复现。
- **根因**: 区域化设备编码首次会通过 `get_device_mac_address` 读取设备 MAC；旧实现会在 Windows 下启动 `getmac` / `ipconfig` 控制台程序，即使设置 `CREATE_NO_WINDOW`，部分环境仍会闪出子进程窗口。
- **解决方案**: Windows 分支改用 Win32 `GetAdaptersAddresses` 直接读取网卡物理地址，不再执行外部命令；macOS/Linux 仍保留原有系统命令/文件系统 fallback。
- **后续防护**: Windows 桌面端凡是启动期、设置页、更新检查等高频路径需要系统信息时，优先使用 API/库，不要调用 `cmd`、`powershell`、`getmac`、`ipconfig` 等外部控制台程序。

### RETRO-005: consultationId 与旧结果污染 [已解决]

- **现象**: HIS 轮询 `/api/consultation/events/poll` 时读到上一位患者的结果。
- **根因**: `consultationId` 未在每次新接诊时正确重置，或前端页面状态残留。
- **解决方案**: 严格在 `start-consultation` 事件处理中重置所有关联状态；`/api/consultation/events/poll` 返回时校验 `consultationId` 一致性。
- **后续防护**: 已升级为规则 -> `AGENTS.md` Review 门禁第 2 条。

### RETRO-006: 内存保活误当作持久化恢复 [已解决]

- **现象**: `emit('minimize')` 后的窗口状态在应用重启后丢失，但代码注释和变量命名暗示这是"持久化"。
- **根因**: AI 在实现收起逻辑时，没有区分"同一运行期内保留现场"和"落盘后跨重启恢复"。
- **解决方案**: 明确文档和代码注释中标注"当前实现为内存保活，非持久化"；重启后回到初始球形态。
- **后续防护**: 已升级为规则 -> `AGENTS.md` Review 门禁第 5 条。

### RETRO-009: 语音取消后未清理会话状态导致二次启动污染 [已解决]

- **现象**: 语音接诊在录音完成后点击取消重录，或在 HTTP / Deep Link 触发的中止后再次启动时，界面没有回到初始状态，计时器和处理中状态可能异常。
- **根因**: `VoiceCapsule.vue` 的取消路径直接重启录音，没有复用关闭路径里的计时器、动画循环、语音监听清理；`useVoiceConsultation.ts` 也缺少统一 reset，导致旧的 processing 状态和异步结果可能污染下一次会话。
- **解决方案**: 抽出统一的录音资源清理和状态重置逻辑；在语音启动、取消、stop-consultation、deep link 入口统一执行 reset；对语音处理异步结果增加 token 失效保护，避免取消后的旧结果回写当前 UI。
- **后续防护**: 尚未升级为 AGENTS.md 规则，后续涉及可重入会话组件时应默认先补统一 reset 和异步失效保护。

---

## 包管理与构建

### RETRO-007: 多锁文件共存导致依赖混乱 [已解决]

- **现象**: 仓库中同时存在 `yarn.lock`、`package-lock.json`、`pnpm-lock.yaml`，不同 session 的 AI 用不同包管理器安装依赖，导致 node_modules 状态不一致。
- **根因**: 早期未约定唯一包管理器，多次 vibe coding session 各自选用了不同工具。
- **解决方案**: 2026-05-20 专项清理确认 `yarn` 为唯一包管理器；`package.json` 增加 `packageManager: yarn@1.22.22`，根目录仅保留 `yarn.lock`，删除历史 `package-lock.json` 与 `pnpm-lock.yaml`。
- **后续防护**: 已升级为规则 -> `AGENTS.md` 硬约束第 6 条与“包管理与命令约束”；`.gitignore` 忽略根目录 `package-lock.json` / `pnpm-lock.yaml`，避免后续误生成并提交。

---

## 窗口与 UI

### RETRO-008: 多显示器下窗口位置越界 [已解决]

- **现象**: macOS 多显示器场景下，窗口展开后超出当前显示器可视范围。
- **根因**: `smartExpand` 未正确获取当前显示器边界，或显示器信息缓存过期。
- **解决方案**: `useWindowManagement.ts` 增加显示器信息缓存和边界校验逻辑，展开前先 `updateCurrentMonitor()`。
- **后续防护**: 已升级为规则 -> `AGENTS.md` 棘轮表中 `useWindowManagement.ts` 条目。

### RETRO-010: 设置页首次枚举麦克风列表不完整 [已解决]

- **现象**: 通用设置中的“输入设备”首次打开时只显示部分麦克风，医生需要手动点一次刷新后才会出现完整列表。
- **根因**: WebView 在未做 `getUserMedia()` 预热时，`enumerateDevices()` 可能只返回部分设备或不返回稳定标签；原实现首次挂载只做了无权限探测，手动刷新才触发权限预热。
- **解决方案**: 设置页首次加载时先做一次快速枚举，再根据麦克风权限状态自动补做一次设备列表预热；对 `prompt` 状态仅在单次会话内自动尝试一次，避免反复弹权限。
- **后续防护**: 后续凡是依赖 `enumerateDevices()` 的设置页首屏展示，都要先确认是否需要权限预热或二次枚举，不能默认首次结果稳定可靠。

### RETRO-011: 语音设置字段和真实运行链路脱节 [已解决]

- **现象**: 设置页里的 `Audio Base URL / Audio Model` 会影响聊天录音转写，但不会影响 `VoiceCapsule` 的实时语音识别；医生误以为改了 Audio 配置就能切换所有语音链路。
- **根因**: 语音能力被拆成 `llm.ts/transcribeAudio` 和 `aliyunSpeech.ts` 两条链路，前者读取 OpenAI 兼容 Audio 配置，后者直接读取 `DASHSCOPE_API_KEY`，配置域没有统一。
- **解决方案**: 抽出统一 speech config，`ChatPanel` 与 `VoiceCapsule` 共用同一套 provider / key / baseUrl / model 解析逻辑；设置页将“通用 LLM”和“语音转写”分开展示。
- **后续防护**: 后续新增 provider 或修改语音链路时，必须先检查两个入口（聊天录音、语音接诊）是否仍读取同一配置域，不能只改一侧 UI 或一侧 service。

### RETRO-012: 多药房 storeId 被拼成单个 org_code 写入药品缓存 [已解决]

- **现象**: 药品基础数据同步后，`medicine_catalog.org_code` 出现 `storeA,storeB,storeC` 这种逗号拼接值，导致单个药房维度的数据难以排查和清理。
- **根因**: 运行时为了给“当前可见药房集合”生成缓存键，直接把多个 `storeId` 排序后拼成字符串，并把这个组合键原样传给 SQLite 落库命令；落库层没有把多 scope 拆开处理。
- **解决方案**: 药品目录改为按独立药房 `storeId` 分 scope 落库；多药房场景读取时对多个 scope 做并集聚合；清理缓存时也同步支持逗号分隔 scope，并删除历史遗留的组合键行。
- **后续防护**: 之后凡是"组合缓存键"要落库到具名维度字段（如 `org_code`、`dept_id`、`store_id`）时，必须先确认该字段表达的是单实体还是 scope 集合，不能把集合键直接当实体主键写入。

### RETRO-013: 药品匹配 / 单药品发药药房候选不受 scope 约束 [已解决]

- **现象**: 把药品目录按 storeId 分 scope 写入后，仍出现两个症状：(1) LLM 推荐的药品在某些药房并不存在，但仍被匹配并展示；(2) 匹配后单条药品的"发药药房"下拉里出现并不实际拥有该药品的药房，医生误选后开方失败。
- **根因**: 之前匹配端只看"全院药品 union"和"全部有效药房 union"两个集合，没有把"药品 ↔ 药房"的多对多关系带到前端：合并 catalog 时丢掉了 storeId，候选药房则只看用户角色科室过滤，没有按药品维度收窄。
- **解决方案**: 在 `MedicineCatalogEntry` / `MedicineItem` 中新增 `storeIds`，HIS catalog 合并时按 storeId 维度 union；SQLite 写入按 `item.storeIds ∩ scope_codes` 落库，读取时聚合每个药品所在的 storeId 集合；`medicalDataService.setActivePharmacyStoreIds` 把当前可用药房注入匹配端，匹配只在交集内进行；`VoiceConsultationNew` 的单药品默认药房 / 候选药房 / 详情轮询都按 `matchedItem.storeIds ∩ pharmacyOptions` 收窄。
- **后续防护**: 后续新增"机构 → 药房 → 药品"类多对多关系字段时，前端中性 DTO 必须显式带上反向引用（如 `storeIds` / `deptIds`）；任何"按 scope 集合的缓存"读出来后，匹配端不能默认全集，必须再做一次 active scope ∩ entry scope 的过滤。

### RETRO-014: 可用药房与药品目录药房口径不一致导致标准库为空 [已解决]

- **现象**: `Pharmacy filter summary` 已能看到有效药房，但治疗方案药品医嘱无法切换发药药房，手动标准库匹配也没有可用药品；控制台出现 active storeIds 已设置但 `medicineCount: 0`。
- **根因**: UI 可用药房走 `fetchAvailablePharmacies()`，会按 `sdDisp/sdUse/用户角色科室/idSto` 过滤；药品目录同步却另走 `fetchMedicineStoreIds()`，只按 `sdDisp` 取药房，导致 active store scope、缓存 key、药品 `storeIds` 三者口径不一致。进一步排查发现，语音问诊结果页只设置了 active storeIds，没有在治疗推荐匹配前显式按这些 `idSto` 从 SQLite/HIS 加载药品目录；当 SDK 握手缺少机构 `orgCode`、机构同步尚未完成，或区域化开关导致局部同步早退时，即使 SQLite 的 `63e0...` 药房下有阿莫西林，前端内存药品目录仍为 0。再次调试发现 `HisService` 已生成顶层 `storeIds`，但 `PhisHisAdapter.mapMedicineCatalog()` 映射中性 DTO 时丢失了该字段，导致 `getMatchableMedicines()` 只能看到 `raw.idSto` 而看不到顶层 `storeIds`。若再允许 CSV/无 scope 药品兜底，会让医生匹配到并不属于任何可用发药药房的目录项。
- **解决方案**: `fetchMedicineStoreIds()` 改为先复用 `fetchAvailablePharmacies()` 的有效药房；若该列表为空，再从药房目录取 `idSto` 作为下拉和目录同步兜底。药品标准库匹配只使用带 `storeIds` 的 HIS 药品目录，并按 active store scope 过滤；`VoiceConsultationNew` 拿到药房列表后调用 `ensureMedicineCatalogForStoreIds()`，先按 active `idSto` 读取 SQLite 聚合缓存，必要时再刷新 HIS 目录，治疗推荐解析和语音意图药品初始化都等待该加载完成；`PhisHisAdapter` 必须透传 `storeIds`，`normalizeMedicineItems()` 还要从 `raw.storeIds/raw.storeId/raw.idSto` 做兼容提取；匹配结果保留 `storeIds`，药房候选严格按 `matchedItem.storeIds ∩ pharmacyOptions` 收窄，不再回退到 CSV 或不限 scope 药品。
- **后续防护**: UI 选项、目录同步、缓存 key、匹配过滤必须共用同一组 scope 解析函数；不要为同一业务维度维护两套过滤逻辑。看到 `activeStoreIds` 非空但 `medicineCount: 0` 时，优先检查是否已按 active storeIds 加载药品目录，而不是先查匹配算法。

### RETRO-016: 基础数据缓存缺少租户维度且药品表复用 org_code 承载药房 scope [已解决]

- **现象**: 同一机构下多药房、多租户场景中，诊疗项目和药品缓存会出现命中不稳定；调试面板只能看到一个 `org_code`，无法判断当前缓存到底属于机构、租户还是药房。
- **根因**: SDK handshake 只把 `orgCode` 传给 `medicalDataService.setCatalogContext()`，`idTet` 没进入缓存上下文；Rust SQLite 表又把药房 scope 继续复用在 `org_code` 单字段上，导致“机构实体”和“药房 scope”语义混在一起，跨租户缓存也无法隔离。
- **解决方案**: 握手阶段单独解析 `tenantId(idTet)`，基础数据上下文改为显式传递 `orgCode + tenantId`；Rust 侧将 `medical_item_catalog` 升级为 `org_code + tenant_id` 主键，将 `medicine_catalog` / `catalog_sync_state` 升级为 `org_code + tenant_id + store_id` 复合主键；调试与清理面板同步展示机构/租户/药房三列。旧药品缓存因历史上无法可靠还原机构维度，迁移时不再保留，按新 schema 重新同步。
- **后续防护**: 之后凡是基础数据、字典或缓存表里同时存在“机构实体”和“scope 集合”两种概念时，必须显式建列，不允许再把 scope 借道 `org_code`、`dept_id` 之类的单实体字段落库；若握手里还有 `idTet`、`idOrg` 等上下文字段，先做维度建模再决定哪些字段进入缓存 key。

### RETRO-018: 区域化 delta 接口带 query 后稳定验签失败 [已解决]

- **现象**: 后台安全拦截列表持续出现 `/v1/client/prompts/delta`、`/v1/client/templates/delta`、`/v1/client/mappings/delta` 的“签名无效”，并且记录显示请求已携带签名。
- **根因**: 前端把带 `?version=...` 的完整 path 传入签名模块，服务端和契约文档则只使用不含 query 的 `requestURI` 作为签名 `PATH`；同一个请求实际发送成功，但签名原文两端不一致。
- **解决方案**: `requestSigner.ts` 在生成 HTTP / WebSocket 签名前统一归一化签名路径，只保留 pathname，不把 query/hash 放进签名原文。
- **后续防护**: 排查“签名=有但签名验证失败”时，先同时核对 `PATH` 口径、body hash、时间戳窗口和 nonce；新增带 query 的 `/v1/*` 请求不得绕过 `requestSigner.ts` 的路径归一化。

### RETRO-019: HIS 事件 WebSocket 页面刷新断开被误报为 receive error [已解决]

- **现象**: 问诊结果已保存、回执也成功后，日志仍出现 `Consultation WebSocket receive error: I/O error: payload reached EOF before completing: None`，容易误判为回写失败。
- **根因**: HIS 页面刷新、关闭或重连时可能不发送标准 WebSocket Close 帧，Actix 会把底层 payload EOF 暴露为 `ProtocolError::Io`；旧代码把所有接收错误都按异常输出。
- **解决方案**: `/api/consultation/events/ws` 读循环识别 EOF 类对端断开，将其降级为普通断连日志；真正的协议错误仍保留 `receive error`。
- **后续防护**: 排查事件流问题时先看是否已经出现 `Consultation completed` / `reference feedback success`；如果业务结果已落队列，单独的 EOF 断连通常只是 HIS 页面生命周期噪声。

### RETRO-020: 区域化实时语音 WebSocket 签名参数被二次编码 [已解决]

- **现象**: 后台安全拦截列表出现 `/v1/ai/speech/realtime/ws` 的 `WS签名无效`，记录显示已携带签名参数。
- **根因**: `signWebSocketParams()` 先对 base64 签名执行 `encodeURIComponent`，`createRegionalWebSocketUrl()` 又用 `URLSearchParams.set()` 再编码一次；服务端只解码一次，收到的 `sig` 仍含 `%2B/%2F/%3D` 片段，导致 base64 签名验不过。
- **解决方案**: WebSocket 签名模块返回原始 base64 签名，只由 `URLSearchParams` 负责 URL 编码。
- **后续防护**: 任何传给 `URLSearchParams.set()` 的 query value 都应是未手工编码的原始值；排查 WebSocket `sig` 时优先检查是否出现 `%252B`、`%252F`、`%253D` 这类二次编码痕迹。

### RETRO-021: 共享结果页 wrapper 与真实语音直挂路径混淆 [已解决]

- **现象**: 在 `ConsultationResultPage.vue` 里补语音诊断鉴别按钮后，真实语音问诊结果页仍看不到入口；同时点击已选诊断或内部按钮时，可能因为父层重新传入等价 `intentResult` 而重置结果页并刷新治疗方案。
- **根因**: 当前 `App.vue` 的语音问诊直接渲染 `VoiceConsultationNew.vue`，症状问诊才经 `SymptomResultEntry.vue -> ConsultationResultPage.vue -> VoiceConsultationNew.vue`；只改薄 wrapper 不会命中语音真实路径。共享结果页 watcher 之前只看对象引用，没有对语义相同的结果输入做去重。
- **解决方案**: 将“诊断鉴别”入口挂到共享 `DiagnosisRecommendationCard` 的可选按钮，由共享结果页主体 `VoiceConsultationNew.vue` 统一处理语音问诊和智能问诊的 checklist 弹窗；`SymptomResultEntry.vue` 不再注入独立鉴别按钮，`ConsultationPage.vue` 不再维护旧调试弹框；`intentResult` watcher 增加语义 key，等价输入不再重复 reset；诊断选择状态对当前主诊断重复点击直接 no-op。
- **后续防护**: 处理共享结果页问题时，先确认真实渲染链路是否经过 wrapper；涉及 `intentResult` / props watcher 的刷新问题时，优先判断是否是等价对象引用抖动，而不是直接禁止业务上的真实切换。

### RETRO-022: 区域化设备编码只依赖 localStorage 导致同机重复注册 [已解决]

- **现象**: 同一台电脑反复出现在后台设备列表中，设备编码持续新增为不同的 `FB-*`，医生姓名、机构和区域相同，但咨询次数被拆散统计。
- **根因**: MAC 不可读时前端使用 `Date.now + Math.random` 生成兜底设备编码，且设备编码与 `deviceToken / idDevice` 主要保存在 WebView `localStorage`。当 WebView 存储域变化、localStorage 被清理、设置页切换接入参数触发注册缓存清理，或服务端拒绝同编码匿名注册时，客户端会生成新的 `FB-*` 并注册成新设备。
- **解决方案**: `REGIONAL_DEVICE_CODE` 同步镜像到 Tauri Store；注册成功后按 `baseUrl + orgCode + deviceCode` 缓存 `deviceToken / idDevice / heartbeatInterval`，启动、HTTP、SSE、WebSocket 出口在重新注册前先恢复同 scope 的注册缓存。切换后端地址或机构只清理当前运行态令牌，不删除其它 scope 的 Tauri Store 缓存；只有本地令牌/密钥确实不可恢复且服务端明确拒绝同编码注册时，才迁移到新的兜底设备编码。
- **后续防护**: 设备身份、签名密钥、注册令牌这类长期身份凭据不能只依赖 WebView `localStorage`；新增区域化身份字段时，应同时评估 Tauri Store 持久化和按后端/机构/deviceCode 分 scope 的恢复路径。

### RETRO-023: Windows 无边框窗口按钮点击被标题栏拖拽抢占 [已解决]

- **现象**: Windows 版检验检查报告解读窗口点击右上角关闭按钮中心无法关闭，只有把鼠标放到按钮边缘才会触发关闭；macOS 下表现正常。
- **根因**: 报告解读窗口使用 `decorations: false` 自定义标题栏，标题栏 `mousedown` 会调用 `appWindow.startDragging()`。旧判断只在 `event.target instanceof HTMLElement` 时排除 `.window-action-btn`，点击按钮中心时 target 可能是 Iconify 生成的 `svg/path`，属于 `SVGElement`，没有被识别为按钮区域，Windows WebView2 随即进入窗口拖拽并抢占后续 click。
- **解决方案**: 拖拽排除判断改为基于 `Element.closest()`，覆盖 SVG 子节点；右上角操作区在 `mousedown` 阶段停止冒泡，避免窗口控制按钮触发标题栏拖拽。
- **后续防护**: 自定义标题栏中判断点击目标时不能只检查 `HTMLElement`；涉及 icon/svg 的按钮应按 `Element.closest()` 或容器级 `mousedown.stop` 排除拖拽区域，并优先在 Windows WebView2 下回归。

### RETRO-024: Release workflow 使用浮动 action tag 被上游 Node runtime 升级影响 [已解决]

- **现象**: GitHub Actions 发布任务在 macOS / Windows 矩阵中报 `Unable to locate executable file: undefined`，任务尚未进入应用构建逻辑就失败。
- **根因**: `.github/workflows/release.yml` 使用 `tauri-apps/tauri-action@v0` 浮动 tag；上游 `v0` 已解析到 `runs.using: node24`，部分 runner 尚未提供该 action runtime，导致 runner 启动 action 时找不到可执行文件。
- **解决方案**: 将 Tauri 发布 action 固定到 `tauri-apps/tauri-action@v0.5.22`，该版本仍使用 `node20` 且与现有 `tagName/releaseName/args` 输入兼容。
- **后续防护**: Release / CI 中对关键构建 action 尽量固定到具体版本；升级 action runtime 前先确认 GitHub runner 支持矩阵，避免浮动 tag 在无代码改动时改变发布行为。

### RETRO-025: 报告解读独立窗口未等待 ready 导致卡在准备态 [已解决]

- **现象**: 触发检验/检查报告解读时窗口先白屏，随后 DevTools 出现 `css2 ERR_CONNECTION_REFUSED`，页面停在“正在准备报告解读 / 正在连接主窗口与独立结果页”不再进入生成中或结果页。
- **根因**: `tauri://created` 只表示 WebView 容器创建成功，不代表 Vue 组件已经完成挂载和 `report-interpretation:status/update` listener 注册。主窗口在 `tauri://created` 后立即投递 status，遇到 WebView2 加载慢、外部字体请求失败或机器较慢时，事件可能早于 listener 注册而丢失；子窗口虽然随后发出 `report-interpretation:ready`，但主窗口此前没有等待该握手。
- **解决方案**: 创建报告解读窗口前先注册 main 侧 ready 监听，子窗口 listener 注册完成后发出 `report-interpretation:ready`，主窗口确认 ready 后再投递 status/update 事件；同时移除桌面端对 Google Fonts `css2` 的运行期依赖，避免内网环境持续报字体连接失败。
- **后续防护**: 新建独立窗口时不能把 `tauri://created` 当成业务 listener 就绪信号；跨窗口首包事件必须有显式 ready/ack 或可补发的状态源。

### RETRO-026: 完整问诊遗留回写路径漏接检查部位门禁 [已解决]

- **现象**: 检查推荐在共享结果页和独立诊疗方案页会校验检查部位，但 `ConsultationPage.vue` 遗留的勾选 / `submitToHIS` 路径只校验发药药房、执行科室、药品详情和库存，检查项目缺少部位时仍可能被选中或提交。
- **根因**: 2026-05-21 结果页重构后，症状问诊主路径迁到 `SymptomResultEntry -> ConsultationResultPage -> VoiceConsultationNew`，新的共享 preflight 已包含 `hasRequiredBodySite`；但 `ConsultationPage.vue` 为兼容旧 `final_report` / 直接回写仍保留一套旧门禁，未同步接入 `useBodySiteOptions` 和检查部位校验。
- **解决方案**: `ConsultationPage.vue` 复用共享 `useBodySiteOptions`，在旧路径 hydrate 检查项目明细时落地部位候选；勾选检查项和旧提交前均先 hydrate 检查明细，再用 `hasRequiredBodySite` 阻止缺少部位的检查项目。
- **后续防护**: 治疗推荐门禁新增字段时，必须同时核对共享结果页、完整问诊遗留路径和独立诊疗方案页；不能只在当前主入口补 preflight。

### RETRO-027: Windows WebView2 自绘下拉点击后立即失焦关闭 [已解决]

- **现象**: 药品核心字段里的“频次 / 用法”自绘搜索下拉在 macOS 正常，Windows 下点击后看起来没有反应，控制台也没有报错。
- **根因**: 触发按钮点击后会被 `v-if` 替换成输入框，Windows WebView2 在按钮被移除时可能先触发 `focusout` 且 `relatedTarget` 为空；旧实现立即按失焦收口，导致刚打开的下拉被同步关闭。
- **解决方案**: 下拉触发改在 `mousedown` 阶段打开并阻止按钮抢焦点；失焦处理延后一拍，再用 `document.activeElement` 判断焦点是否实际留在组件内，避免按钮替换造成的误关闭。
- **后续防护**: Windows 桌面端自绘下拉、popover、图标按钮不要只依赖 `click` 后的同步 `focusout.relatedTarget`；涉及按钮替换输入框或 SVG/icon 子节点时，应优先用早期鼠标事件和延迟后的真实焦点状态做收口判断。


---

### RETRO-013: 大型 Vue SFC 跨双侧"卡片级"组件抽取的会话内极限 [部分解决]

- **现象**: 计划把 `VoiceConsultationNew.vue` 与 `ConsultationPage.vue` 的诊断/治疗推荐卡片收敛为共享子组件（语音作为标准 UX）；执行时发现 voice 端单张治疗 `<article>` 卡片就有 ~570 行模板，依赖 setup script 中 30+ 局部 handler/状态（`openExecDeptQuickSelector`、`activeReasonTooltipKey`、`isEditableFieldActive`、`isManualMatchOpen`、`getTreatmentSpec`、`isTreatmentEditorExpanded` 等），强行抽取需要把它们逐一作为 props/事件穿透或通过 provide/inject 暴露。
- **根因**: 卡片不是"纯渲染组件"，而是一个集成多个子状态机（编辑字段聚焦、二级下拉、库存校验、反馈 popover、手动匹配、提示 tooltip）的复合体；这些状态对父级 setup script 重度耦合。一次性抽出会同时改动两个高风险文件 + 上千行模板，缺少回归保护时容易引入运行期错误。
- **解决方案**: 把可独立、低耦合的部分先抽成共享 composable / 子组件并落 build：`useSecondarySelector`（药房/执行科室/部位/医保 二级下拉状态）、`useBodySiteOptions`（exam 部位选项落地）、`useTreatmentHydration`（药品详情轮询 + 库存校验，voice 已迁移）。卡片级组件抽取（`TreatmentRecommendationCard` / `DiagnosisRecommendationCard`）以及"症状侧采用 voice 卡片 UX + feedback popover"延后到独立专题轮，需先做：①先把 voice 卡片相关的 30+ 局部 handler 收敛到一个 composable（如 `useTreatmentRecommendationCardState`）；②再以该 composable 为接口抽出 `<article>` 模板。
- **后续防护**: 跨双侧的"卡片级"组件抽取，在 SFC 单卡片超过 ~300 行模板或依赖 ≥10 个 setup 局部状态时，必须先做"setup 状态收敛"专题轮（拆 composable）再做"模板抽取"专题轮，不要把两者放在同一次提交里。新增 PR 若同时触及 `VoiceConsultationNew.vue` 模板与 `ConsultationPage.vue` 模板，且不带"setup 状态收敛"前置改动，应判为高风险，要求拆分。


---

## 模板

### RETRO-017: 症状问诊一键回写丢失标准诊断 ID [已解决]

- **现象**: 智能问诊一键回写诊断时 PHIS 报 `ORA-01400: 无法将 NULL 插入 HI_ODS_DIAG.ID_DIE`，语音问诊同类操作正常。
- **根因**: 症状问诊切入共享结果页时把 `Diagnosis.id` 当作普通展示字段传入，结果页初始化只读取 `matchedItem.id`，导致已匹配的标准诊断 ID 在适配层丢失；同时智能问诊曾为未匹配诊断生成 `diag_*` / `phis-diagnosis-*` 这类前端临时 ID，容易被误当成可回写诊断主键。
- **解决方案**: 症状问诊适配共享结果页时显式透传标准诊断 ID；最终回写前统一校验 `diagList.idDiag` 来源，未匹配标准诊断库时拦截提交；智能问诊不再为未匹配诊断生成可混淆的临时主键。
- **后续防护**: 任何进入 `record-confirmed.diagList.idDiag` 的值都必须来自 PHIS 标准诊断库，展示 key 和保存主键不得复用同一字段语义。

---

### RETRO-028: 住院病历生成中“查房记录”字段未被识别为 AI 自动生成，且正文包含重复基本信息 [已解决]

- **现象**: 
  1. 查房记录模板中的“查房记录文本”未能被前端识别为 AI 自动生成字段，无法进行高亮和生成；
  2. 生成的主诉、既往史、查房记录等描述文本中，经常会冗余地包含患者的姓名、年龄、住院号等基本身份信息描述。
- **根因**: 
  1. `inpatientEmrTemplate.ts` 的默认匹配配置 `defaultMatcherConfig.aiSuitableKeywords` 缺少 “查房” 和 “查房记录” 相关识别词；
  2. 尽管大模型理解上下文需要 `PATIENT_INFO` 数据，但 Prompt 的 Constraints 约束中没有明确禁止在正文中重复输出这部分页眉已有的患者身份信息。
- **解决方案**: 
  1. 在 `defaultMatcherConfig.aiSuitableKeywords` 中添加了 `"查房"`、`"查房记录"`、`"查房正文"` 和拼音缩写 `'cf'`, `'cfjl'`，并在 `inferFieldMeaning` 补充其字段含义；
  2. 在 `buildInpatientEmrGeneratePrompt` 的 Constraints 约束中，新增第 16 条约束，明确要求在生成主诉、现病史、既往史、查房记录等正文时，禁止输出姓名、性别、年龄、住院号等已在病历页眉展示的基本信息。
- **后续防护**: 后续新增/解析病历文书字段或有新文书类型加入时，必须同步核对 `inpatientEmrTemplate.ts` 中的匹配词以及 `inpatientEmrPrompts.ts` 的负向约束描述。

### RETRO-029: 同设备码升级后密钥重建被误要求人工处理 [已解决]

- **现象**: 新版本升级或 WebView 存储变化后，桌面端仍使用同一个设备码，但本地 ECDSA 密钥可能重建；旧后台在注册接口看到同机构同 `cdDevice` 已绑定公钥时直接拒绝，最终表现为医生端提示需要重新连接或更新密钥。
- **根因**: 旧契约把“已绑定公钥的激活设备再次注册”视为匿名接管风险，只允许没有公钥的历史占位补录公钥；这和升级后同终端密钥轮换的真实运行场景冲突。
- **解决方案**: 后台注册接口改为同机构同 `cdDevice` 激活设备在携带匹配原 `deviceToken` 时可自动刷新 `device_public_key`、客户端版本、系统信息和来源 IP，并复用原设备令牌返回；停用记录仍作为封禁记录拒绝重新注册。
- **后续防护**: 区域化设备身份以 `cdDevice + idOrg` 为稳定终端锚点；版本升级、本地密钥重建和 WebView 存储变化不应要求医生手工更新密钥，注册接管边界以原令牌证明与后台停用/删除语义控制。

### RETRO-030: 入院类模板字段被宽泛排除词挡住导致右侧无生成内容 [已解决]

- **现象**: 入院记录或首次病程录在无门诊病历、无补充要点时点击“直接重新生成”，左侧步骤条显示“病历草稿已生成”，但右侧病历正文没有填入新内容。
- **根因**: 住院病历模板字段识别先匹配排除词再匹配 AI 字段词；排除词中的“入院 / ry”过于宽泛，会把“入院情况”“入院记录-主诉”“ryqk”等本应由 AI 生成的字段先判为非 AI 字段，导致生成流程完成后没有可写入的 AI 字段。
- **解决方案**: `getPresetFieldStatus` 改为日期、时间、诊断、操作人员等强排除词仍优先，仅让“入院 / ry”这类文书类型宽泛排除词排在明确 AI 字段关键词之后；“入院情况 / ryqk”可识别为 AI 字段，“入院日期 / 入院诊断 / 病程记录操作时间”仍会被排除。

### RETRO-031: 慢病续方模型只返回药名导致处方字段被固定默认值伪装完整 [已解决]

- **现象**: 慢病复诊推荐虽然已把有效库存药品名称和规格发送给模型，结果页仍出现所有药品单次剂量均为 `1`，并伴随剂量单位、频次和总量不符合实际规格的问题。
- **根因**: 慢病续方模型输出契约只有 `recommendedMedicines: string[]`，没有接收结构化剂量、频次和用法；后处理在历史文本缺少明确用法时以固定 `1`、固定 `14天` 和库存销售单位兜底，形成了看似完整但没有临床依据的处方字段。
- **解决方案**: 将慢病续方药品输出升级为结构化对象，按“历史处方明确值 → 模型结合库存规格生成值 → HIS 药品默认值”合并；移除固定剂量和固定疗程兜底，核心用法仍不完整时不默认选中。
- **后续防护**: 任何模型输入新增库存、目录或规格信息时，都要同步核对输出 schema 是否真正承接对应业务字段；禁止用非空占位默认值绕过处方必填门禁。

### RETRO-032: 复诊配药空治疗清单触发通用四路推荐 [已解决]

- **现象**: 复诊配药草稿能够打开共享临床结果页，但治疗方案仍出现无库存药品和不需要的检查、检验；主诉/现病史退化为“未提供新发不适信息”等占位表达。
- **根因**: 复诊配药生成结果返回空 `treatments`，共享结果页按普通语音问诊语义自动补拉药品、检查、检验、处置四路推荐；历史查询也未把当前 `idVis` 传给 `queryVisitHistory`，导致本次诊中记录可能混入历史依据。
- **解决方案**: 历史查询通过 `HisPatientHistoryQuery.currentVisitId` 下传当前 `idVis`；复诊配药按“库存同品 → 库存等效药 → 规范通用名兜底”生成药品项，其中无库存标准名保持未选中，并通过 `ClinicalResultInput.recommendationPolicy` 禁止自动生成和刷新通用治疗方案；病历兜底文案改为具体慢病复诊续方及待核实事项。
- **后续防护**: 任何复用共享结果页的专属场景，只要“空推荐”不等于“请自动生成通用推荐”，就必须显式携带 recommendation policy；场景专属治疗范围必须在数据契约和 UI 自动行为两层同时约束。
- **后续防护**: 调整住院病历模板字段关键词时，必须同时验证“宽泛排除词”和“明确 AI 字段词”的优先级，尤其关注入院、首次、ry 等会同时出现在文书类型和正文字段名中的词。

### RETRO-031: 一键回写被非关键埋点和 WebSocket 兜底缺口阻断 [历史方案，已由 RETRO-050 收敛]

- **现象**: 打包安装包中医生点击“一键回写”后，HIS 页面控制台反复出现 `WebSocket connection to ws://127.0.0.1:8081/api/consultation/events/ws failed`，并且 HIS 侧收不到 `record-confirmed`。
- **根因**: SDK 声明了 `auto/websocket/polling` 事件通道策略，但实现未真正按 `eventTransport` 切换，且 `_startLongPollingEvents()` 缺失，WebSocket 失败后没有可靠进入 `/events/poll` 兜底。同时新增推荐偏好记录在回写前同步调用 `crypto.randomUUID()`，旧版 HIS 内嵌浏览器不支持时会在 `complete_consultation` 之前抛错，导致回写事件根本没有写入 Bridge。
- **解决方案**: SDK 补齐 `eventTransport` 行为与长轮询循环，`auto` 模式下 WebSocket 失败立即启用 poll 兜底并后台继续重连；推荐偏好记录改为兼容 ID 生成，并把所有偏好埋点调用包进非阻断保护，确保 `complete_consultation` 是一键回写主链路的优先动作。
- **后续防护**: 一键回写路径上的日志、偏好学习、用户行为追踪等非关键副作用必须 `try/catch` 隔离，不允许阻断 `complete_consultation`；SDK 文档声明的 fallback 行为必须有真实实现。

### RETRO-032: 患者切换时旧治疗推荐 loading 挡住新患者方案生成 [已解决]

- **现象**: 第一个智能问诊未一键回写或放弃时直接调入第二个患者，第二个患者诊断建议已生成并选中主诊断，但治疗方案区域停在“当前诊断暂无已加载的治疗方案，请点击上方刷新方案”，没有自动生成有效方案。
- **根因**: 共享结果页的 `fetchAITreatment` 只有一个全局 `treatmentLoading`。患者 / intent 重置会清空诊断和治疗方案，但没有废弃上一患者仍在途的治疗推荐请求；新患者诊断落地后的自动治疗请求因 `treatmentLoading === true` 早退，旧请求随后被诊断防串线逻辑丢弃并关闭 loading，页面不会再次补发新患者请求。
- **解决方案**: 给共享结果页治疗推荐请求增加序号和患者锚点校验；患者 / intent 重置或诊断清空时废弃旧请求并释放 loading。旧请求返回或失败时若已过期，不再覆盖治疗方案、不关闭新请求 loading，也不弹出旧错误；新患者诊断落地后可立即自动拉取治疗方案。
- **后续防护**: 共享结果页里“发起前用 loading 早退、返回后靠上下文防串线丢弃”的异步请求，遇到患者 / 就诊锚点硬切换时必须同步失效旧请求并释放新上下文可用的 loading，否则容易形成“旧请求被丢弃、新请求没发出”的空态。

### RETRO-033: 智能问诊结果页初始化抑制吞掉治疗方案自动触发 [已解决]

- **现象**: 语音问诊结果页能正常展示诊疗方案，但智能问诊在诊断建议已生成、主诊断已选中后，治疗方案仍停在“当前诊断暂无已加载的治疗方案，请点击上方刷新方案”。
- **根因**: 智能问诊经 `SymptomResultEntry -> ConsultationResultPage -> VoiceConsultationNew` 适配后，诊断选择发生在 `intentResult` 初始化阶段。此阶段会打开 `suppressDiagnosisTreatmentRefetch`，诊断选择 watcher 被正确抑制以避免旧方案误刷新；但旧自动触发逻辑主要依赖这次诊断变化，抑制结束后没有独立状态 watcher 补发治疗方案请求。语音问诊常带有 `treatments` 或缓存快照，因此不容易暴露这个空态。
- **解决方案**: 在共享结果页新增“当前诊断已有、治疗方案为空、无已加载诊断 key、未处于 suppress/loading”的后置自动补发守卫，按患者锚点 + 诊断 identity 只自动尝试一次；`intentResult` 初始化完成和相关状态变化后都会调用该守卫，失败时不循环重试，医生仍可手动点“刷新方案”。
- **后续防护**: 结果页初始化若用 suppress 屏蔽 watcher 副作用，必须在 suppress 关闭后用显式状态守卫补齐应该发生的副作用；不能只依赖被 suppress 期间的那一次 ref 变化。

### RETRO-034: 慢病分类组覆盖具体历史诊断导致初始诊断降级 [已解决]

- **现象**: 历史病历、主诉和现病史均明确为“2型糖尿病”，慢病复诊结果首次打开却推荐“糖尿病”并匹配未特指编码；手动刷新诊断后才恢复为“2型糖尿病”。
- **根因**: 慢病候选识别把原始诊断映射成“糖尿病”等分类组，并将同一字段继续用于结果页初始诊断和标准库匹配；刷新诊断则根据保留原文的病历正文重新推断，形成两条诊断口径。
- **解决方案**: 慢病候选显式拆分分类组与临床诊断；分类组只负责候选识别，临床诊断保留历史原始名称，同组内优先有分型的历史诊断、同等具体程度下采用最近一次，并统一用于初始病历、诊断卡和标准库匹配。
- **后续防护**: 归一化标签、疾病分组和路由类别不得复用为临床事实或回写值；任何分类器输出进入病历、诊断或处方契约前，必须验证原始临床粒度是否仍然保留。

### RETRO-035: 结构化处方总量正确但模型推荐依据算术错误 [已解决]

- **现象**: 二甲双胍单次2片、每日3次、30天的结构化总量已正确显示为3瓶（每瓶60片），推荐依据却写成“共需90片”。
- **根因**: 结果页总量由结构字段和 HIS 包装数据自动计算，悬浮推荐依据则原样展示模型自由文本 `reason`；两者没有共享计算函数，模型漏乘单次片数后也没有一致性校验。
- **解决方案**: 模型推荐理由只保留临床与历史依据，含剂量、频次、疗程或包装算术的模型理由不再直接采用；新增共享纯函数按最终可编辑处方字段计算总制剂数和包装数，自动总量与悬浮换算说明复用同一结果。
- **后续防护**: 大模型不得作为剂量、频次、疗程和包装数量的最终计算器；可由结构字段确定的算术必须在程序中计算，并让展示、校验和回写共享同一口径。

### RETRO-036: PHIS通用医嘱列表被当成历史药品导致诊断依据污染 [已解决]

- **现象**: 慢病复诊诊断依据把空腹血糖、糖化血红蛋白、肝肾功能等检验项目描述成“配药记录”，夹杂 `(null 1次)`，并重复展示同一整段历史依据。
- **根因**: PHIS Adapter 未按 `orderList.sdOrd` 区分药品 `11`、检查 `31`、检验 `41`，把所有医嘱映射为 `HisVisitRecord.medications`；慢病诊断又把同一候选文本同时写入 `evidenceText` 和 `rationale`，共享文案二次拼接。
- **解决方案**: Adapter 仅映射明确药品医嘱并清洗字面量空值；慢病候选只依赖历史慢病诊断，历史药品为空时由模型结合诊断和有效库存推荐；候选拆分诊断依据与用药依据，历史明确诊断使用 `explicit/high`，共享诊断文案对依据去重并采用“建议采用”而非“模型初步考虑”。
- **后续防护**: 厂商通用医嘱列表进入中性 DTO 前必须按业务类型拆分，禁止用字段名或列表来源推断其全部是药品；同一事实不得同时写入两个会被串联展示的文案字段。

### RETRO-037: 慢病复诊现病史混入库存与推荐上下文 [已解决]

- **现象**: 无历史用药时，现病史出现“当前可参考药品为暂无可直接沿用的历史药品”等机器化句子，把库存决策过程写进患者病史。
- **根因**: 慢病规则兜底为了说明推荐来源，直接把库存匹配摘要拼进 `historyOfPresentIllness`；模型现病史后处理也只校验长度和禁用占位词，没有校验病历事实与推荐上下文的边界。
- **解决方案**: 现病史只保留诊断、就诊目的、历史用药及待核实的病情事实；库存、可续方药品和推荐方案只进入治疗建议。模型输出命中库存或推荐语义时整段回退到事实型规则草稿。
- **后续防护**: 发送给模型的上下文不等于允许写入病历的事实；任何同时生成病历和推荐的场景都必须在提示词与后处理两层明确字段级来源边界。

### RETRO-038: 检验检查医嘱被兜底判定为已出报告 [已解决]

- **现象**: 当前就诊只有检查/检验医嘱、尚未出具结果时，接诊胶囊仍可能进入报告回诊；历史病历虽然已经包含 `applyList`，风险上下文却无法识别近期已出报告。
- **根因**: 当前就诊判断在 `sdApply = 3` 之外又用 `orderList.sdOrd = 31/41` 兜底，混淆“已申请”和“已出报告”；历史明细虽已由 `fetchPatientHistory` 获取，Adapter 映射却丢弃了 `visitId` 和报告申请状态。
- **解决方案**: 报告状态统一只认 `applyList[].items[].sdApply = 3`；PHIS Adapter 在既有历史查询中提炼 `HisVisitRecord.reportedApplications` 中性摘要并保留 `visitId`，业务层按近 7 个自然日生成报告解读机会，进入工作台后再加载报告正文。
- **后续防护**: 检验检查的申请、执行、出报告是不同业务状态；新增分流规则时必须使用对应状态字段，不能用医嘱类型推断报告结果已经存在。

### RETRO-039: AI 综合判断兜底污染检验异常表 [已解决]

- **现象**: CRP 结果位于参考范围内，报告助手仍把“CRP指标正常”“排除急性重症感染依据不足”等综合判断列入红色异常项目，方向和参考范围同时显示为空。
- **根因**: 结构化异常列表为空时，正文组件把 AI `keyPoints` 强制转换为异常项目；语义结论因此被误当成检验明细，绕过了 HIS 异常标记和参考范围判定。
- **解决方案**: 异常表仅消费结构化 HIS 项目，由明确异常标记、方向或数值越界生成；`keyPoints` 只用于综合判断。工作台在 AI 返回前先显示原始报告，避免用模型文案冒充报告事实。
- **后续防护**: 事实表格不得使用叙述型 AI 输出兜底；模型总结与 HIS 原始事实必须在类型、渲染和测试三层保持独立。

### RETRO-040: 报告摘要重复患者基本信息且缺少总体状态 [已解决]

- **现象**: 报告头部已经展示患者姓名、性别和年龄，摘要仍以“患者某某（某岁男性）”开头；医生需要通读整段文字才能判断总体正常还是存在异常。
- **根因**: 提示词没有限制摘要复述患者基本信息，展示层也只有普通标题和段落，没有基于结构化异常项形成稳定的总体状态视觉语义。
- **解决方案**: 提示词要求摘要和结论直接从报告发现开始；展示层清理患者基本信息前缀，并按结构化异常项和高风险等级生成绿 / 橙 / 红状态带及图标。
- **后续防护**: 报告事实、总体状态和患者背景分别由结构化数据、确定性展示规则和临床解释承载，不允许模型自由文本同时承担三种职责。

### RETRO-041: 报告回诊把制剂比值拼成 PHIS 一次剂量 [已解决]

- **现象**: 后续治疗方案中头孢呋辛酯、对乙酰氨基酚等药品显示为 `1g`，马来酸氯苯那敏显示为 `1mg`，与临床常规一次剂量明显不符。
- **根因**: 共享药品详情 hydrate 用 `targetDose / 每制剂含量` 得到片粒数后，又把该数值与 PHIS `unitDose` 的质量单位拼接；独立方案还允许模型把 mg/g 临床剂量直接放进可编辑 `dosage`，导致目标剂量与 PHIS 一次剂量口径混杂。
- **解决方案**: AI raw 先把 mg/g/ml 剂量归一到 `targetDose/targetDoseUnit`；药品详情加载后优先把目标剂量换算到 PHIS `unitDose`，仅当目标单位本身是片/粒/袋时才使用制剂数，缺少目标剂量时再采用 HIS 默认一次剂量。
- **后续防护**: 临床一次剂量、单制剂含量和总制剂数必须使用不同字段；语音问诊、智能问诊、报告回诊和独立方案统一复用共享归一与 hydrate，不得在页面层自行拼接剂量单位。

### RETRO-042: 药品详情更新后未统一落地总量便执行库存校验 [已解决]

- **现象**: 各场景虽然复用了药品详情 hydrate、总量计算和库存接口，但自动选中药品可能在 hydrate 改写一次剂量后，仍使用模型旧总量或 hydrate 前总量校验库存；语音缓存还可能先于异步 hydrate 完成落盘。
- **根因**: hydrate、normalize、自动总量、库存校验和缓存由页面分段编排，报告回诊等待 hydrate，语音 / 症状部分路径则 fire-and-forget；模型契约仍允许语音意图和慢病复诊返回包装总量。
- **解决方案**: 在共享 `useTreatmentHydration` 中建立药品定稿流水线，药品详情成功后立即重新归一并落地一次剂量、标准频次 / 用法和程序总量，再使用最终包装总量校验库存；所有入口 await 定稿后才能自动选中或缓存，AI raw 包装总量在映射层丢弃。
- **后续防护**: Review 必须检查所有新药品入口是否调用共享 `finalizeMedicineRecommendation(s)`；仅调用 hydrate 或仅在 payload 阶段 normalize 不视为完成药品安全闭环。

### RETRO-043: 主窗口把 CSS 动画误当成原生窗口过渡且忽略 workArea [已解决]

- **现象**: 接诊胶囊进入问诊/报告工作台时，Windows 容易出现窗口硬跳、短暂裁切或任务栏遮挡；语音胶囊阶段切换还可能从屏幕边缘向不可见区域扩展。10ms 几何采样只观察到 `280×360 → 1451×898` 的单次跳变，没有中间原生尺寸。
- **根因**: 旧链路先写 `currentView`、再分别调用 `setPosition / setSize`，随后才播放 Web 内容 morph；`smartExpand` 使用整个 monitor bounds 而不是 `workArea`，历史尺寸没有当前屏幕上限，`VoiceCapsule` 又绕过窗口管理直接改窗。
- **解决方案**: 抽出 `windowGeometry.ts` 统一按实时 `workArea + scaleFactor` 计算安全尺寸/位置；新增 `useWindowTransitionCoordinator.ts` 串行执行“旧内容淡出 → 几何 → 视图提交 → 新内容淡入”，位置与尺寸通过 Rust `apply_main_window_geometry` 单次 IPC 应用，并把语音阶段尺寸上报接入同一出口；胶囊恢复不可缩放，历史尺寸只作为偏好并在每次恢复时重新裁剪。
- **后续防护**: 已升级为 `AGENTS.md` 硬约束 #8 和 `useWindowManagement.ts` 棘轮条目；新增主窗口形态不得在业务 UI 内直接调用 Tauri 窗口几何 API。

### RETRO-044: 新增窗口 API 未同步 Tauri capability 导致接诊事务失败 [已解决]

- **现象**: 接诊、风险胶囊展开和窗口切换统一报错 `window.set_min_size not allowed`，患者接诊流程随窗口几何事务一起中断。
- **根因**: 窗口优化新增 `Window.setMinSize()`，但 `src-tauri/capabilities/default.json` 只授权了 `set-size / set-position / set-resizable`，没有同步加入 `core:window:allow-set-min-size`；类型检查、单元测试、构建和 Rust 编译均不会覆盖运行时 capability 拒绝。
- **解决方案**: 为现有主窗口与两个受控独立窗口的默认 capability 补充 `core:window:allow-set-min-size`，保持权限范围只覆盖已声明窗口，不扩大到全局或其他插件。
- **后续防护**: 新增任何 Tauri JS API 调用时，Review 必须同时核对 `capabilities/*.json` 对应 allow permission，并至少执行一次会真实触发该 API 的 Tauri 运行时冒烟；仅通过 `cargo check` 或浏览器单测不视为权限验证完成。

### RETRO-045: 结束就诊收球被迟到尺寸覆盖导致小球只显示半个 [已解决]

- **现象**: 结束就诊后已经切回悬浮球 DOM，但原生窗口高度停留在接诊胶囊约 92px，球体、左右菜单和底部按钮沿同一水平线被裁掉。
- **根因**: 普通视图/胶囊 resize 由 transition coordinator 串行处理，`exitWork()` 却直接调用窗口管理；在途风险评估、语音阶段或胶囊尺寸请求可能晚于收球落地。与此同时，旧实现遇到 `transitioning` 或 `isMoving` 会直接跳过退出，无法保证球态成为最终几何。
- **解决方案**: 新增 terminal ball transition，让收球与所有窗口几何请求共用同一 latest-wins 队列；应用 `160×160`、最小尺寸和不可缩放后才提交 `isWorking=false`，并在球态或 terminal pending 期间忽略 `resizeCurrentView`。
- **后续防护**: 已同步到 PRODUCT 窗口终态约束、ARCHITECTURE 窗口状态流和 AGENTS Review 门禁；新增任何结束/取消路径必须验证“在途 resize + stop consultation”竞态。

### RETRO-046: 复诊配药把缺失事实写成模板化待核实文案 [已解决]

- **现象**: 生成现病史重复患者年龄/性别和历史日期，以“病情控制、服药依从性及监测结果待医生核实”收尾，信息虽保守但不像医生自然书写；直接套医生案例又会臆造规律服药、病情平稳和阴性症状。
- **根因**: Prompt 和规则 fallback 都强制输出待核实句式，后处理仅检查长度和库存词，没有本次事实确认环节；测试还把“服药依从性”固定为必含文案。
- **解决方案**: 在生成病历前增加模型动态 Confirmation Plan，默认推荐仅作为 UI 初值，医生可通过选项、文字或语音一次确认；最终 Builder 只拼装确认 `recordText` 和历史事实。
- **后续防护**: 已升级为 AGENTS Review 门禁 #12；任何复诊配药文案优化都必须区分历史证据、模型推荐和医生已确认事实。

### RETRO-047: 医生补充说明回流确认计划造成重复等待与选项漂移 [已解决]

- **现象**: 医生在复诊配药确认页补充文字或语音后，页面再次调用模型重生成确认项；医生需要额外等待，原先已浏览或修改的选项也会被推荐默认值覆盖。
- **根因**: 将“补充病历事实”和“修订确认计划”合并成同一个动作，没有区分动态问项与医生自由补充说明的职责。
- **解决方案**: 确认计划只在进入页面时生成一次；文字和语音只维护独立补充说明，语音转写后直接追加。最终病历调用负责把补充说明压缩为合规临床片段，再与医生确认选项和历史事实共同进入 Builder。
- **后续防护**: 已同步 AGENTS Review 门禁 #12；新增补充入口不得隐式刷新确认项或覆盖医生已有选择。

### RETRO-048: 历史药品只读 orderList 导致用药天数退化为模型猜测 [已解决]

- **现象**: `loadClinicMedicalRecord.orderList` 没有药品天数字段，复诊推荐在历史天数缺失时采信模型生成的 `90天`，随后程序据此正确但不合理地计算出 9 盒、5 瓶。
- **根因**: PHIS 完整处方属性实际位于 `presList[].presSubList[]`，旧 Adapter 只读取 `orderList` 并把药品压成文本，丢失 `takeDays` 以及结构化剂量、频次、用法和总量来源。
- **解决方案**: 将 `presSubList` 映射为中性 `HisHistoricalMedication` 并作为历史药品属性主来源，`orderList` 保留分类与兜底；复诊药品逐项沿用最近一次可靠关联的历史 `days`，无历史依据时不再采信模型天数。
- **后续防护**: 已升级为 AGENTS Review 门禁 #13；历史处方新增字段必须先在 Adapter 做厂商字段隔离和关联唯一性校验。

### RETRO-049: 复诊 healthEducation 未映射导致注意事项落入通用兜底 [已解决]

- **现象**: 复诊模型已经返回慢病健康教育，但结果页显示“注意休息，1周内复诊，必要时上级医院进一步检查治疗”。
- **根因**: `ClinicalResultInput.healthEducation` 没有传给门诊病历 Builder 的 `precautions`，`buildPrecautions()` 因缺少显式内容落入普通场景默认分支。
- **解决方案**: 共享结果页初始化时把 `healthEducation` 作为 `precautions` 的兼容来源；复诊 API 拒收固定一周复诊、无依据上转等泛化文案并使用慢病安全兜底。
- **后续防护**: 临床结果新增或复用病历字段时必须补充“输入契约 → 可编辑字段 → outpatientRecord → 回写 payload”完整映射测试。

### RETRO-050: HIS 长轮询被部分恢复导致契约漂移与退出后请求风暴 [已解决]

- **现象**: 桌面应用退出后，PHIS DevTools 持续出现 `handshake` 与 `poll?after=...` 的 `ERR_CONNECTION_REFUSED`；桌面端在线但 WebSocket 建链失败时，SDK 还会请求一个 Rust Bridge 实际未注册的 `/api/consultation/events/poll`。
- **根因**: 2026-06-12 已同时删除 SDK 长轮询和 Rust poll 路由；2026-06-22 为处理旧 HIS WebSocket 回写漏收，只恢复了 SDK fallback、类型和文档，没有恢复服务端路由，也没有把通道取舍记录为摇摆决策。WebSocket 重连仍使用固定 1 秒握手，桌面端离线后不会进入退避状态。
- **解决方案**: 收敛 `/api/consultation/events/ws` 为唯一 HIS 结果通道，删除 SDK 的 `pollEvent`、长轮询循环和 polling 配置，文档与类型声明同步移除 poll 契约；WebSocket 断线继续携带最后 `event.id` 补发，握手失败按 1/2/4/8/16/30 秒上限指数退避，并只在状态切换时发送 connected/disconnected 事件。
- **后续防护**: 结果通道变更必须同时核对 `http_server.rs + sdk/med-hermes-sdk.js + d.ts + api.md + ARCHITECTURE.md + AGENTS.md + CODE_MAP.md`；不得只恢复客户端 fallback。若 WebSocket 兼容性再出现问题，应修复握手、授权、缓存或重连，不得未经人工确认重新引入第二套事件通道。

### RETRO-051: 定性阳性结果被上游 normal 标记覆盖 [已解决]

- **现象**: 尿常规中尿糖、酮体、维生素 C、胆红素等结果明确为“阳性”，报告工作台的“方向”仍显示绿色“正常”，AI 异常项也可能漏掉这些结果。
- **根因**: PHIS 报告聚合返参把部分定性阳性项目标记为 `abnormal: false + direction: normal`；客户端 `resolveLabItemDirection()` 又在看到任意 `direction` 时直接返回，没有用结果文本、异常标记和参考范围复核冲突字段。
- **解决方案**: 报告展示与异常提炼统一按“非正常 direction → 非正常 abnormalFlag → 阳性/阴性定性结果 → 数值参考范围 → abnormal 布尔值”的确定性顺序复核；阳性结果可以纠正冲突的 normal/false，医生仍可查看 HIS 原始结果文本。
- **后续防护**: 定性检验不能只依赖数值上下限或单个上游布尔值；新增报告项目映射必须覆盖“阳性结果 + normal/false 冲突”和“阴性正常”回归测试。

### RETRO-052: 否定影像关键词被报告解读误判为异常 [已解决]

- **现象**: 检查报告明确写有“未见明显骨折”“骨质结构完整”“未见异常”等正常描述时，报告解读仍可能显示红色“重点异常”，并把整段正常影像描述列为异常项目。
- **根因**: 外部纯文本检查报告缺少结构化异常项时，本地兜底解析只按“骨折、破坏、狭窄”等影像关键词命中异常规则，没有先识别“未见 / 无 / 可排除 / 正常 / 完整”等否定或正常语义；总体状态还允许 AI `keyPoints.urgency = high` 单独染红。
- **解决方案**: 检查报告兜底解析改为按短句识别肯定阳性发现，否定短句不再进入异常项或红旗动作；检验文本同样过滤“未见异常”等否定异常标记；总体“重点异常”只由确定性异常项自身的 high urgency 决定。
- **后续防护**: 影像 / 检验文本解析不能只看异常关键词，必须同时覆盖否定表达回归测试；总体状态不得由模型叙述段落单独决定。

### RETRO-053: 有效库存按产品 ID 保真但直接展开导致 AI 上下文重复 [已解决]

- **现象**: 用药推荐请求的“当前可用发药药房有效库存目录”中出现同名同规格药品；不同院内产品 ID 被逐项展开，增加了无信息增益的 Prompt 内容。
- **根因**: Adapter 和业务库存目录为保证价格、库存校验与回写准确，必须按 `productId` 保留真实品种；Prompt formatter 直接复用了该数组，没有建立仅面向模型的名称规格投影去重层。
- **解决方案**: 真实库存继续逐 `productId` 保留，只在 AI 上下文格式化时按 Unicode 归一、前缀标记清洗后的“药品名称 + 规格”去重；完整目录和精确候选目录共用同一格式化规则。
- **后续防护**: AI 上下文压缩与处方事实必须分层；不得为了缩短 Prompt 合并、截断或覆盖真实库存项，库存对齐、单价、校验和回写仍以具体 `productId + storeId` 为准。

> 新增条目请复制以下模板：

```markdown
### RETRO-XXX: 简短标题 [已解决/未解决]

- **现象**: 具体的错误表现或困难描述。
- **根因**: 为什么会出现这个问题。
- **解决方案**: 怎么修复的，或者当前的规避方式。
- **后续防护**: 是否已升级为 AGENTS.md 规则，如果是注明具体条目。
```
