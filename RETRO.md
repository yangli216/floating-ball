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

- **现象**: HIS 轮询 `/api/consultation/result` 时读到上一位患者的结果。
- **根因**: `consultationId` 未在每次新接诊时正确重置，或前端页面状态残留。
- **解决方案**: 严格在 `start-consultation` 事件处理中重置所有关联状态；`/api/consultation/result` 返回时校验 `consultationId` 一致性。
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

### RETRO-007: 多锁文件共存导致依赖混乱 [未解决]

- **现象**: 仓库中同时存在 `yarn.lock`、`package-lock.json`、`pnpm-lock.yaml`，不同 session 的 AI 用不同包管理器安装依赖，导致 node_modules 状态不一致。
- **根因**: 早期未约定唯一包管理器，多次 vibe coding session 各自选用了不同工具。
- **当前状态**: 已在 AGENTS.md 硬约束中禁止混用，但历史锁文件尚未清理。
- **待办**: 需要一次专项清理，确认 yarn 为唯一包管理器后删除多余锁文件。

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


---

## 模板

> 新增条目请复制以下模板：

```markdown
### RETRO-XXX: 简短标题 [已解决/未解决]

- **现象**: 具体的错误表现或困难描述。
- **根因**: 为什么会出现这个问题。
- **解决方案**: 怎么修复的，或者当前的规避方式。
- **后续防护**: 是否已升级为 AGENTS.md 规则，如果是注明具体条目。
```
