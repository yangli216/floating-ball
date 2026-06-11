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

> 新增条目请复制以下模板：

```markdown
### RETRO-XXX: 简短标题 [已解决/未解决]

- **现象**: 具体的错误表现或困难描述。
- **根因**: 为什么会出现这个问题。
- **解决方案**: 怎么修复的，或者当前的规避方式。
- **后续防护**: 是否已升级为 AGENTS.md 规则，如果是注明具体条目。
```
