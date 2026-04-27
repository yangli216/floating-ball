# MedHermes HIS 接入指南 / 接口说明

> 最后更新: 2026-04-27
>
> 本文档面向准备接入 `MedHermes` 的 HIS / 医生站 / PHIS 项目。
> 当前真实运行契约以 `src-tauri/src/http_server.rs` 与当前前端实现为准；`docs/regionalization/*.md` 仍属于规划文档，不能替代本文档。

## 1. 文档目标

本文档回答 4 件事：

1. HIS 应该按什么顺序接入 `MedHermes`
2. 当前本地 HTTP Bridge 暴露了哪些接口
3. 各接口的请求字段、响应字段、异常场景是什么
4. 推荐诊断 / 用药 / 检查的“引用请求 -> PHIS 保存 -> 回执 MedHermes”闭环应该怎么做

## 2. 当前接入形态

`MedHermes` 当前通过本地 HTTP Bridge 与 HIS 对接：

- 本地服务地址: `http://127.0.0.1:8081`
- 接口前缀: `/api`
- 协议: `HTTP`
- 数据格式: `application/json`
- 编码: `UTF-8`

约束说明：

1. `MedHermes` 必须先在医生本机启动，否则接口不可访问。
2. 当前服务只监听 `127.0.0.1:8081`，默认供本机 HIS / 联调页调用。
3. 当前结果通道是“单槽内存态”而不是结果队列。
   也就是说，`GET /api/consultation/result` 读到的是“当前最新一条结果”，不是历史列表。
4. 当前 `consultationId` 默认直接使用 `idPi / patientId`。
   如果 HIS 存在“同患者多次接诊”场景，必须在 HIS 自己的上下文里再绑定一次“当前就诊”。
5. 当前 Bridge 会为业务接口生成 `traceId` 并写入本地 HIS 集成日志，方便三方 HIS / PHIS 联调时按一次调用链路排查请求、响应和错误。

## 3. 推荐接入顺序

建议分 3 步完成接入。

### 第一步: 打通基础接诊

1. HIS 选择患者后，调用 `POST /api/consultation/start`
2. 调用成功后开始轮询 `GET /api/consultation/result`
3. 收到 `draft` 或 `final-report` 后回填医生站草稿

适用场景：

- 从完整问诊主流程开始
- 主要目标是生成主诉、现病史、初步诊断和建议

### 第二步: 打通灵活模式

1. HIS 在当前患者上下文下调用 `POST /api/consultation/assist`
2. 指定 `action` 为 `record / diagnosis / differential / medication / examination / reminder`
3. 继续轮询 `GET /api/consultation/result`
4. 如果收到 `reference-request`，说明医生在 `MedHermes` 内点击了“引用”

适用场景：

- 医生已经在 HIS 里录入了部分病历，只想快速拿 AI 推荐
- 不希望再开第二套独立问诊窗口

### 第三步: 打通 PHIS 引用闭环

1. HIS / PHIS 轮询到 `reference-request`
2. 读取其中的 `requestId`、`action`、`referenceItems`
3. 在 HIS / PHIS 内完成保存
4. 保存成功或失败后，**必须**调用 `POST /api/consultation/reference-feedback`
5. `MedHermes` 收到回执后会更新当前页面状态，并把最新状态继续暴露到 `GET /result`

这是当前联调最关键的一步，也是推荐诊断 / 用药 / 检查真正写入 HIS 的闭环。

**重要：回执是强制要求的。** 当医生点击"一键回写"时，`MedHermes` 会发出**一条** `reference-request`（`referenceType` 为 `batch`），其 `referenceItems` 包含诊断、药品、检查、检验、处置等所有选中项目。PHIS 收到后应一次性处理全部项目，处理完成后**必须**调用回执接口。

## 4. 标准字段与映射规则

### 4.1 患者上下文字段

以下字段是当前最推荐的标准字段名：

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `idPi` | String | 是 | 患者唯一标识 |
| `naPi` | String | 是 | 患者姓名 |
| `sdSexText` | String | 是 | 性别文本，如 `男性` / `女性` |
| `ageText` | String | 是 | 年龄文本，如 `19岁` |
| `department` | String | 否 | 当前科室 |
| `idCard` | String | 否 | 身份证号 |
| `mobilePhone` | String | 否 | 联系电话 |
| `allergyHistory` | String | 否 | 过敏史 |
| `chiefComplaint` | String | 否 | 主诉 |
| `historyOfPresentIllness` | String | 否 | 现病史 |
| `pastMedicalHistory` | String | 否 | 既往史 |
| `diagnosis` | String | 否 | 当前 HIS 诊断草稿 |
| `vitals` | String | 否 | 体征摘要 |

### 4.2 字段别名兼容

当前本地桥接层兼容以下别名：

| 推荐字段 | 兼容别名 |
| :--- | :--- |
| `idPi` | `patientId` |
| `naPi` | `name` |
| `sdSexText` | `gender` |
| `ageText` | `age` |

建议：

1. 新接入项目统一使用标准字段名，不要长期依赖别名。
2. `consultationId` 当前仍回传 `idPi / patientId`，不是独立的就诊流水号。
3. 如果你们 HIS 已有自己的 `encounterId / visitId`，请在 HIS 本地自行维护映射，不要假设当前接口已经原生支持多次接诊隔离。

## 5. 典型业务时序

### 5.1 完整问诊时序

1. HIS 调用 `POST /api/consultation/start`
2. `MedHermes` 置顶并进入完整问诊主流程
3. HIS 轮询 `GET /api/consultation/result`
4. 医生在 `MedHermes` 中完成问诊或草稿回写
5. HIS 收到 `draft` 或 `final-report` 后更新医生站

### 5.2 灵活模式时序

1. HIS 调用 `POST /api/consultation/assist`
2. `MedHermes` 直接进入 `ConsultationPage` 对应阶段
3. 医生在同一问诊页面中继续补充病历、看推荐、发起引用
4. HIS 持续轮询 `GET /api/consultation/result`
5. 如果收到 `reference-request`，进入 PHIS 引用处理

### 5.3 引用闭环时序（一键回写）

医生点击”一键回写”后，`MedHermes` 会发出**一条** `reference-request`，`referenceType` 为 `batch`，`referenceItems` 包含所有选中项目（诊断 + 药品 + 检查 + 检验 + 处置）：

1. `MedHermes` 发出 `reference-request`（`referenceType: “batch”`），`referenceItems` 包含全部选中项
2. PHIS 轮询到该请求，遍历 `referenceItems`，按每项的 `type` 字段分类处理并保存
3. PHIS **必须**调用 `POST /api/consultation/reference-feedback` 回执
4. `MedHermes` 收到回执，页面更新全部项目状态

每个 `referenceItems` 条目自带 `type` 字段（`diagnosis` / `medication` / `examination` / `lab_test` / `procedure`），PHIS 据此判断每项应写入哪个业务模块。

```text
PHIS                                MedHermes
 |                                       |
 |  <-- GET /result (reference-request, batch)
 |  遍历 referenceItems 按 type 分类保存   |
 |  POST /reference-feedback (success) -->|
 |                                       |  回写完成
```

### 5.4 联调日志与 traceId

1. `POST /api/handshake`、`POST /api/consultation/start`、`POST /api/consultation/assist`、`POST /api/consultation/start-voice`、`POST /api/consultation/stop`、`GET /api/consultation/result`、`POST /api/consultation/reference-feedback`、`POST /api/patient/risks` 会写入本地 HIS 集成日志。
2. 上述业务响应会额外返回 `traceId` 字段。三方联调时请把该值提供给桌面端开发或从“设置 -> HIS 联调日志”入口中筛选查看。
3. 日志会记录接口方向、路径、请求摘要、响应摘要、HTTP 状态、业务 `code/msg`、耗时、患者 / 问诊 / 回执标识和错误摘要；`Cookie`、`Authorization`、`token`、手机号、身份证号等敏感字段会默认脱敏。
4. 桌面端主动调用 PHIS 的字典、药品详情、库存校验等出站接口也写入同一日志文件，便于用一次 `traceId` 串联 Bridge 入站与 PHIS 出站排查。
5. 日志仅保存在医生本机本地数据目录，可在日志面板中刷新、筛选、复制、导出或清空。

## 6. 接口清单

### 基础可用性探测 `GET /api/health`

用途：仅检测本地桌面桥接服务是否在线。该接口不写入浏览器上下文，也不做授权握手校验，供 loader / SDK 的 `ping()` 用于避免误判“应用离线”。

完整地址：

```text
http://127.0.0.1:8081/api/health
```

成功响应：

```json
{
  "status": "success",
  "version": "1.2.8",
  "timestamp": 1704355200100
}
```

说明：

1. 该接口只表示“桥接服务在线”，不表示当前 HIS 已完成授权握手。
2. 业务调用前仍需执行 `POST /api/handshake` 并携带有效的 `extra.emrAccessToken`。

### 6.1 `POST /api/handshake`

用途：SDK 初始化握手，将浏览器上下文（域名、Cookie、UA 等）传递给桌面端，同时完成桌面端服务授权检测。握手必须携带有效的 `emrAccessToken`，否则桌面端服务不可调用。

完整地址：

```text
http://127.0.0.1:8081/api/handshake
```

请求字段：

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `origin` | String | 否 | 浏览器 `location.origin`，如 `https://his.hospital.com` |
| `href` | String | 否 | 浏览器 `location.href`（完整 URL） |
| `cookie` | String | 否 | 浏览器 `document.cookie`，桌面端可借此调用 HIS 后端服务 |
| `userAgent` | String | 否 | 浏览器 `navigator.userAgent` |
| `timestamp` | Number | 否 | 初始化时间戳 |
| `sdkVersion` | String | 否 | SDK 版本号 |
| `extra` | Object | 否 | HIS 自定义扩展字段，必须包含有效的 `emrAccessToken`；可附带 `{ hospitalCode: "H001", userId: "doc-123" }` 等额外字段 |

请求示例：

```json
{
  "origin": "https://his.hospital.com",
  "href": "https://his.hospital.com/doctor/outpatient",
  "cookie": "SESSION=abc123; JSESSIONID=xyz789",
  "userAgent": "Mozilla/5.0 ...",
  "timestamp": 1704355200000,
  "sdkVersion": "1.0.0",
  "extra": {
    "emrAccessToken": "valid-token-from-his-sdk",
    "hospitalCode": "H001",
    "userId": "doc-123"
  }
}
```

成功响应：

```json
{
  "status": "success",
  "version": "1.2.8",
  "timestamp": 1704355200100
}
```

失败响应（缺少或无效 `emrAccessToken`）：

```json
{
  "status": "error",
  "message": "SDK 握手失败：缺少有效的 emrAccessToken，桌面应用服务调用已被拒绝"
}
```

实现说明：

1. 桌面端会校验 `extra.emrAccessToken`；仅在 token 有效且非空时才会将浏览器上下文存入 `AppState`。
2. 授权握手成功后，桌面端收到握手会向前端发出 `sdk-handshake` 事件，前端可据此感知 HIS SDK 已连接。
3. 如果握手失败，桌面端会清空已缓存的浏览器上下文，并拒绝后续桌面应用服务调用。
4. 此接口支持重复调用，每次成功调用都会更新存储的浏览器上下文。
5. 推荐 HIS 在页面加载时调用一次，在用户重新登录、刷新 token 或切换组织后再调用一次以刷新授权上下文。

授权门禁说明：

1. 除 `POST /api/handshake` 与 `/sdk/*` 静态文件接口外，其余本地桌面服务接口都要求先完成一次成功握手。
2. 若未握手，或握手中未携带有效的 `extra.emrAccessToken`，桌面端将统一返回 `401 Unauthorized`。
3. 推荐 HIS 仅在收到握手成功响应后，再调用完整问诊、灵活问诊、语音问诊、结果轮询、风险提示及知识代理等桌面服务接口。

### 6.2 `POST /api/consultation/start`

用途：启动完整问诊，并同步当前患者上下文。

完整地址：

```text
http://127.0.0.1:8081/api/consultation/start
```

请求示例：

```json
{
  "idPi": "766842939207974912",
  "naPi": "张虎",
  "sdSexText": "男性",
  "ageText": "19岁",
  "department": "呼吸内科",
  "idCard": "360731200607117442",
  "mobilePhone": "13800138000",
  "allergyHistory": "青霉素过敏",
  "chiefComplaint": "咳嗽三天"
}
```

成功响应：

```json
{
  "status": "success",
  "consultationId": "766842939207974912"
}
```

实现说明：

1. 此接口会刷新当前患者上下文。
2. 此接口会清空上一条本地结果，避免直接读到旧结果。
3. `MedHermes` 收到后会尝试置顶主窗口并进入完整问诊。

### 6.2 `POST /api/consultation/assist`

用途：在当前患者上下文里，直接进入灵活模式中的某个动作。

完整地址：

```text
http://127.0.0.1:8081/api/consultation/assist
```

请求字段：

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `action` | String | 是 | 支持 `record`(病历记录) / `diagnosis`(诊断推荐) / `differential`(鉴别诊断) / `medication`(用药方案) / `examination`(检查推荐) / `lab_test`(检验推荐) / `procedure`(处置推荐) / `reminder`(智能提醒) |
| `idPi` | String | 是 | 患者唯一标识 |
| `naPi` | String | 是 | 患者姓名 |
| `sdSexText` | String | 是 | 性别文本 |
| `ageText` | String | 是 | 年龄文本 |
| 其他患者上下文字段 | Mixed | 否 | 参考第 4 节 |

请求示例：

```json
{
  "action": "diagnosis",
  "idPi": "766842939207974912",
  "naPi": "张虎",
  "sdSexText": "男性",
  "ageText": "19岁",
  "department": "呼吸内科",
  "chiefComplaint": "咳嗽三天",
  "historyOfPresentIllness": "受凉后出现咳嗽、咳痰",
  "pastMedicalHistory": "高血压10年",
  "diagnosis": "急性支气管炎",
  "vitals": "T 37.8℃，P 92次/分",
  "allergyHistory": "青霉素过敏"
}
```

成功响应：

```json
{
  "status": "success",
  "consultationId": "766842939207974912",
  "action": "diagnosis"
}
```

实现说明：

1. 当前接口底层仍发出历史事件名 `start-consultation-session`，但前端唯一落点已经是 `ConsultationPage` 灵活模式。
2. 每次 `assist` 调用都会先清空本地结果通道。
3. 如果已经提供 `chiefComplaint + historyOfPresentIllness`，桌面端通常会直接跳过症状采集。
4. 如果触发 `differential / medication / examination / lab_test / procedure`，但当前诊断不足，前端会提示医生先补全诊断。
5. 当前一个 `action` 只负责自动触发一个目标模块，不代表本次问诊到此结束。
6. `examination`、`lab_test`、`procedure` 三路推荐独立加载，各自有独立的 loading 状态和引用闭环。

### 6.3 `POST /api/consultation/start-voice`

用途：启动语音接诊胶囊，并可选同步当前患者上下文。

完整地址：

```text
http://127.0.0.1:8081/api/consultation/start-voice
```

请求说明：

1. 请求体可以为空。
2. 如果请求体不为空，字段结构与 `/start` 基本一致，推荐至少传入患者基础信息。

请求示例：

```json
{
  "idPi": "766842939207974912",
  "naPi": "张虎",
  "sdSexText": "男性",
  "ageText": "19岁",
  "department": "呼吸内科",
  "chiefComplaint": "咳嗽三天",
  "historyOfPresentIllness": "受凉后出现咳嗽、咳痰",
  "pastMedicalHistory": "高血压10年",
  "diagnosis": "急性支气管炎"
}
```

成功响应：

```json
{
  "status": "success",
  "consultationId": "766842939207974912"
}
```

实现说明：

1. 如果请求体为空，则沿用桌面端当前内存中的患者上下文。
2. 如果当前桌面端没有患者上下文，前端会提示先接诊患者。
3. 语音结果最终仍通过 `GET /api/consultation/result` 返回。

### 6.4 `GET /api/consultation/result`

用途：获取当前问诊结果。**此接口采用长轮询（Long Polling）方案。**

完整地址：

```text
http://127.0.0.1:8081/api/consultation/result
```

实现逻辑：

1. 如果当前已有最新结果，立即返回。
2. 如果当前无结果（如问诊正在进行中），服务器会挂起请求。
3. 当结果生成或发生变更时，立即返回结果。
4. 如果挂起超过 `30 秒` 仍无结果，返回 `200 OK`，状态为 `pending`。

结果通道说明：

1. 这是当前唯一的结果回传通道。
2. 返回内容可能来自完整问诊、病历草稿回写、推荐项引用请求、PHIS 回执、语音问诊确认。
3. 当前是“最新结果覆盖旧结果”的单槽模型，HIS 必须自己做去重和当前患者校验。

#### 尚未就绪响应 (超时)

```json
{
  "status": "pending",
  "message": "Consultation result not available",
  "timestamp": 1704355200000
}
```

#### 成功响应: 病历草稿回写

当前 `draft` 类型仅包含主诉和现病史，不含诊断和治疗方案。

```json
{
  "consultationId": "766842939207974912",
  "timestamp": 1704355200000,
  "resultType": "draft",
  "requestId": "draft-record-1704355200000",
  "chiefComplaint": "咳嗽三天",
  "historyOfPresentIllness": "受凉后出现咳嗽、咳痰，无明显呼吸困难。",
  "pastMedicalHistory": "否认高血压、糖尿病病史。",
  "diagnosisList": [],
  "medications": [],
  "examinations": [],
  "labTests": [],
  "procedures": [],
  "treatmentPlan": "建议结合医生站规则完成最终确认。",
  "medicalSummary": "主诉：咳嗽三天\n现病史：受凉后出现咳嗽、咳痰，无明显呼吸困难。"
}
```

#### 成功响应: 最终报告

`final-report` 类型包含完整结构化数据。

```json
{
  "consultationId": "766842939207974912",
  "timestamp": 1704355200000,
  "resultType": "final-report",
  "requestId": "final-report-1704355200000",
  "chiefComplaint": "咳嗽三天",
  "historyOfPresentIllness": "受凉后出现咳嗽、咳痰，无明显呼吸困难。",
  "pastMedicalHistory": "否认高血压、糖尿病病史。",
  "diagnosisList": [
    {
      "name": "急性支气管炎",
      "code": "J20.900",
      "isTCM": false
    }
  ],
  "medications": [
    {
      "name": "氨溴索",
      "spec": "30mg*20片",
      "usage": "30mg，口服，每日3次"
    }
  ],
  "examinations": [
    {
      "name": "血常规"
    }
  ],
  "labTests": [
    {
      "name": "血常规"
    }
  ],
  "procedures": [
    {
      "name": "雾化吸入治疗"
    }
  ],
  "treatmentPlan": "建议用药：氨溴索；建议检查：血常规",
  "medicalSummary": "主诉：咳嗽三天\n现病史：受凉后出现咳嗽、咳痰，无明显呼吸困难。"
}
```

#### 成功响应: 问诊一键确认回写（record-confirmed）

`record-confirmed` 类型来自问诊最终确认提交（如语音问诊确认页或表单问诊的一键回写）。与 `reference-request` 不同，这是医生在结果页直接确认后一次性提交的完整数据，不走引用闭环，PHIS 可直接用于调入确认。

```json
{
  "consultationId": "766842939207974912",
  "timestamp": 1704355201000,
  "resultType": "record-confirmed",
  "requestId": "record-confirmed-1704355201000",
  "chiefComplaint": "咳嗽三天",
  "historyOfPresentIllness": "受凉后出现咳嗽、咳痰，无明显呼吸困难。",
  "pastMedicalHistory": "否认高血压、糖尿病病史。",
  "diagList": [
    {
      "idTet": "test",
      "idDiag": "69e83103fad30474c84dd19c",
      "naDiag": "急性上呼吸道感染",
      "sdDiag": "1",
      "cdIcd10": "J06.900",
      "naIcd10": "急性上呼吸道感染",
      "fgMain": "1",
      "sdDiagText": "西医诊断"
    }
  ],
  "orderList": [
    {
      "doseOnce": "1",
      "unitDose": "粒",
      "idFreq": "ST",
      "idUsge": "405",
      "takeDays": 1,
      "amount": 1,
      "fgSkintest": "0",
      "idDeptExec": "63e0bd493c6f495f34444b69",
      "fgCheckOrd": "1",
      "sdSrv": "11",
      "naSrv": "感冒灵颗粒",
      "idSrv": "65b8a81c3c6f492a8908d8d2"
    }
    {
      "amount": 1,
      "fgCheckOrd": "1",
      "sdSrv": "41",
      "naSrv": "尿常规",
      "idSrv": "642546e0fc69e81ae058f3ad",
      "idDeptExec": "63e0bd493c6f495f34444b69",
      "jsonField": "{\"idLisCategory\":\"63e1e5f362f1a02fb8e76ad8\",\"fgCombination\":\"1\"}"
    }
    {
      "amount": 1,
      "fgCheckOrd": "1",
      "sdSrv": "31",
      "naSrv": "心电图",
      "idPart": "66c59143eda5140001f17fc1",
      "idDeptExec": "63e0bd493c6f495f34444b69"
    }
  ],
  "treatmentPlan": "用药：对乙酰氨基酚缓释片。检查：深部X线照射。检验：血常规（五分类）。处置：拔罐疗法(火罐)"
}
```

##### record-confirmed 字段说明

`record-confirmed` 现在将诊断收敛到 `diagList`，将药品、检查、检验、处置统一收敛到 `orderList`。PHIS 不再按 `diagnosisList / medications / examinations / labTests / procedures` 这套旧结构解析。

**diagList 字段：**

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `idTet` | String | 透传当前患者上下文中的 `idTet`；若当前上下文缺失则为空字符串 |
| `idDiag` | String | 诊断目录 ID |
| `naDiag` | String | 诊断名称 |
| `sdDiag` | String | 诊断类型编码，当前西医诊断为 `1`，中医诊断为 `2` |
| `cdIcd10` | String | ICD-10 或诊断编码 |
| `naIcd10` | String | ICD-10 对应名称，当前默认与诊断名称一致 |
| `fgMain` | String | 主诊断标识，主诊断为 `1`，其余诊断为 `0` |
| `sdDiagText` | String | 诊断类型文本，如 `西医诊断`、`中医诊断` |

**orderList 通用字段：**

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `amount` | Number | 开立数量，默认取推荐项总量，缺省时为 `1` |
| `fgCheckOrd` | String | 是否检查医嘱，当前固定回写 `1` |
| `sdSrv` | String | 服务分类编码；药品默认 `11`，检查默认 `31`，检验默认 `41`，处置默认 `21` |
| `naSrv` | String | 标准服务名称 |
| `idSrv` | String | 标准服务 ID；若当前目录未返回则可能缺省 |
| `idDeptExec` | String | 执行位置 ID；药品默认取发药药房查询返回的药房 `idSto`，其他项目优先取目录元数据，其次回退握手科室默认值 |

**药品附加字段：**

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `doseOnce` | String | 一次剂量 |
| `unitDose` | String | 剂量单位 |
| `idFreq` | String | 频次 key |
| `idUsge` | String | 用法 key |
| `takeDays` | Number | 用药天数，缺省时为 `1` |
| `fgSkintest` | String | 皮试标志，默认 `0` |

**检查 / 检验 / 处置附加字段：**

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `idPart` | String | 部位 ID，仅目录有该元数据时返回 |
| `jsonField` | String | 检验附加 JSON，常见为 `idLisCategory`、`fgCombination` 等组合信息 |

#### 成功响应: 引用请求（一键回写 batch）

```json
{
  "consultationId": "766842939207974912",
  "timestamp": 1704355203000,
  "resultType": "reference-request",
  "requestId": "ref-batch-1704355203000",
  "referenceType": "batch",
  "action": "batch",
  "referenceStatus": "pending",
  "referenceMessage": "等待 PHIS 保存引用结果",
  "referenceItems": [
    {
      "name": "急性支气管炎",
      "code": "J20.900",
      "type": "diagnosis",
      "isTCM": false
    },
    {
      "name": "阿莫西林胶囊",
      "code": null,
      "type": "medication",
      "idCli": "10023"
    },
    {
      "name": "布洛芬缓释胶囊",
      "code": null,
      "type": "medication",
      "idCli": "10056"
    },
    {
      "name": "血常规",
      "code": null,
      "type": "lab_test",
      "idCli": "20045"
    },
    {
      "name": "胸部X线",
      "code": null,
      "type": "examination",
      "idCli": "30012"
    }
  ],
  "chiefComplaint": "咳嗽三天",
  "historyOfPresentIllness": "受凉后出现咳嗽、咳痰，无明显呼吸困难。",
  "diagnosisList": [
    {
      "name": "急性支气管炎",
      "code": "J20.900"
    }
  ],
  "medications": [
    {
      "name": "阿莫西林胶囊",
      "spec": "0.25g*24粒",
      "usage": "口服，每日3次，每次1粒",
      "idMedPro": "10023"
    },
    {
      "name": "布洛芬缓释胶囊",
      "spec": "0.3g*20粒",
      "usage": "口服，每日2次，每次1粒",
      "idMedPro": "10056"
    }
  ],
  "examinations": [
    {
      "name": "胸部X线",
      "idCli": "30012"
    }
  ],
  "labTests": [
    {
      "name": "血常规",
      "idCli": "20045"
    }
  ]
}
```

> **注意：** `reference-request` 来自 ConsultationPage（表单问诊），其 `medications` / `examinations` / `labTests` / `procedures` 仍是按业务类型拆分的基础字段，不含 PHIS 调入确认扩展字段。而 `record-confirmed` 类型结果已统一收敛为 `orderList`，详见上方字段说明表。

#### 成功响应: 引用回执结果

```json
{
  "consultationId": "766842939207974912",
  "timestamp": 1704355205000,
  "resultType": "reference-feedback",
  "requestId": "ref-batch-1704355203000",
  "referenceType": "batch",
  "action": "batch",
  "referenceStatus": "success",
  "referenceMessage": "PHIS 已成功保存全部引用项目",
  "referenceItems": [
    {
      "name": "急性支气管炎",
      "code": "J20.900",
      "type": "diagnosis",
      "isTCM": false
    },
    {
      "name": "阿莫西林胶囊",
      "code": null,
      "type": "medication",
      "idCli": "10023"
    },
    {
      "name": "布洛芬缓释胶囊",
      "code": null,
      "type": "medication",
      "idCli": "10056"
    },
    {
      "name": "血常规",
      "code": null,
      "type": "lab_test",
      "idCli": "20045"
    },
    {
      "name": "胸部X线",
      "code": null,
      "type": "examination",
      "idCli": "30012"
    }
  ],
  "chiefComplaint": "咳嗽三天",
  "historyOfPresentIllness": "受凉后出现咳嗽、咳痰，无明显呼吸困难。",
  "diagnosisList": [
    {
      "name": "急性支气管炎",
      "code": "J20.900"
    }
  ]
}
```

#### 等待中响应

HTTP 状态码：`404`

```json
{
  "error": "Consultation result not available",
  "code": "RESULT_NOT_READY"
}
```

字段说明：

| 字段名 | 说明 |
| :--- | :--- |
| `consultationId` | 当前患者标识，现阶段默认等于 `idPi / patientId` |
| `timestamp` | 本条结果生成时间戳 |
| `resultType` | 当前可能为 `draft` / `record-confirmed` / `reference-request` / `reference-feedback` / `final-report` |
| `requestId` | 请求 ID，`draft` 类型格式为 `draft-record-{timestamp}`，引用闭环类型格式为 `ref-{action}-{timestamp}` |
| `referenceType` | 当前引用对象类型，支持 `diagnosis` / `medication` / `examination` / `lab_test` / `procedure` / `batch`；一键回写场景下为 `batch`，此时 `referenceItems` 包含所有类型的项目，每项通过 `type` 字段区分 |
| `action` | 兼容旧版联调字段，语义与 `referenceType` 相同，建议新接入只把它当兼容字段使用 |
| `referenceStatus` | 引用状态，常见值 `pending` / `success` / `failed` |
| `referenceMessage` | 当前状态说明或失败原因 |
| `referenceItems` | 当前引用闭环中的结构化条目 |

HIS 处理建议：

1. 必须先校验 `consultationId` 是否匹配当前患者。
2. 建议按 `consultationId + requestId + resultType + timestamp` 做去重。
3. 判断”这是一条什么回执”时，建议优先看 `resultType + referenceType`：
   - `reference-request + batch` = 一键回写请求，`referenceItems` 包含所有类型项目，按每项 `type` 分类处理
   - `reference-request + diagnosis` = 请求 PHIS 保存诊断（单项引用场景）
   - `reference-feedback + batch` = 一键回写回执
   - `reference-feedback + diagnosis` = 诊断保存回执
   - `reference-feedback + medication` = 用药保存回执
   - `reference-feedback + examination` = 检查保存回执
   - `reference-feedback + lab_test` = 检验保存回执
   - `reference-feedback + procedure` = 处置保存回执
4. 收到 `reference-request` 后**必须尽快调用 `/reference-feedback` 回执**。回执完成后继续轮询可取到 `reference-feedback` 确认状态。

### 6.5 `POST /api/consultation/reference-feedback`（必须）

用途：PHIS 在保存推荐诊断 / 用药 / 检查后，**必须**将成功或失败结果回执给 `MedHermes`。

**强制要求：** 每收到一条 `reference-request`，PHIS 都必须调用本接口回执。一键回写场景下只有一条 `batch` 类型请求，PHIS 处理完全部项目后回执一次即可。

完整地址：

```text
http://127.0.0.1:8081/api/consultation/reference-feedback
```

请求字段：

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `consultationId` | String | 是 | 当前患者 / 当前问诊标识 |
| `requestId` | String | 是 | 对应 `reference-request` 中的请求 ID |
| `referenceType` | String | 否 | 建议新接入显式传入的引用对象类型，支持 `diagnosis` / `medication` / `examination` / `lab_test` / `procedure` / `batch` |
| `action` | String | 否 | 兼容旧版字段，语义与 `referenceType` 相同；`referenceType` 与 `action` 至少要传一个 |
| `status` | String | 是 | `success` / `failed` |
| `message` | String | 否 | 成功说明或失败原因 |
| `items` | Array | 否 | 本次实际保存的项目列表 |

请求示例（一键回写 batch 回执）：

```json
{
  "consultationId": "766842939207974912",
  "requestId": "ref-batch-1704355203000",
  "referenceType": "batch",
  "action": "batch",
  "status": "success",
  "message": "PHIS 已成功保存全部引用项目",
  "items": [
    {
      "name": "急性支气管炎",
      "code": "J20.900",
      "type": "diagnosis"
    },
    {
      "name": "阿莫西林胶囊",
      "type": "medication",
      "idCli": "10023"
    },
    {
      "name": "血常规",
      "type": "lab_test",
      "idCli": "20045"
    }
  ]
}
```

成功响应：

```json
{
  "status": "success",
  "consultationId": "766842939207974912",
  "requestId": "ref-batch-1704355203000",
  "referenceType": "batch",
  "timestamp": 1704355205000
}
```

异常响应：没有匹配到待处理引用请求

HTTP 状态码：`409`

```json
{
  "status": "error",
  "code": "REFERENCE_REQUEST_MISMATCH",
  "message": "No matching pending reference request for current consultation result"
}
```

实现说明：

1. 当前回执必须匹配“最新一条结果”里的 `requestId` 且其 `resultType` 必须还是 `reference-request`。
2. 如果 HIS 传错 `consultationId` 或 `requestId`，会返回 `409 REFERENCE_REQUEST_MISMATCH`。
3. `referenceType` 与 `action` 如果同时传入，语义必须一致；不一致时接口会返回 `400 INVALID_REFERENCE_TYPE`。
4. 建议 `status = failed` 时，把失败原因写进 `message`，便于医生在 `MedHermes` 里理解失败原因。
5. 如果想让页面上的逐项“已引用/引用失败”状态更准确，建议原样回传本次成功或失败的 `items`。

### 6.6 `POST /api/consultation/stop`

用途：通知桌面端结束当前接诊上下文。

完整地址：

```text
http://127.0.0.1:8081/api/consultation/stop
```

请求示例：

```json
{}
```

成功响应：

```json
{
  "status": "success",
  "message": "Consultation stopped"
}
```

实现说明：

1. 此接口会清空当前接诊上下文。
2. 适合在 HIS 切换患者、结束当前接诊、退出本次联调时调用。
3. 它不会回放历史结果，也不是持久化归档接口。

### 6.7 `POST /api/patient/risks`（可选）

用途：把 HIS 当前患者的风险信息推送到 `MedHermes`，触发患者风险评估提醒。

完整地址：

```text
http://127.0.0.1:8081/api/patient/risks
```

请求字段：

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `idPi` | String | 是 | 患者唯一标识 |
| `naPi` | String | 是 | 患者姓名 |
| `sdSexText` | String | 是 | 性别文本，如 `男性` / `女性` |
| `ageText` | String | 是 | 年龄文本，如 `65岁` |
| `chiefComplaint` | String | 否 | 主诉 |
| `historyOfPresentIllness` | String | 否 | 现病史 |
| `pastMedicalHistory` | String | 否 | 既往史 |
| `diagnosis` | String | 否 | 当前诊断 |
| `allergyHistory` | String | 否 | 过敏史 |
| `risks` | RiskItem[] | 否 | 预计算的风险项（若为空数组或不传，则由 LLM 自动分析） |

#### RiskItem 结构

当 HIS 已经有风险评估结果时，可以通过 `risks` 数组直接注入，跳过 LLM 分析：

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `level` | Number | 是 | 风险等级：`1` = 红色（高危），`2` = 橙色（中危），`3` = 黄色（低危） |
| `category` | String | 是 | 风险类别：`allergy`（过敏）/ `chronic`（慢病）/ `medication`（用药）/ `population`（特殊人群）/ `vital`（体征）/ `other`（其他） |
| `content` | String | 是 | 风险描述文本，直接展示给医生 |

#### 两种使用方式

**方式一：HIS 传入患者信息，由 LLM 自动分析风险**

适用于 HIS 没有自己的风险评估引擎的场景。`risks` 传空数组或不传。

```json
{
  "idPi": "766842939207974912",
  "naPi": "张虎",
  "sdSexText": "男性",
  "ageText": "65岁",
  "chiefComplaint": "咳嗽三天",
  "historyOfPresentIllness": "受凉后出现咳嗽、咳痰",
  "pastMedicalHistory": "高血压10年，糖尿病5年",
  "diagnosis": "急性支气管炎",
  "allergyHistory": "青霉素过敏",
  "risks": []
}
```

**方式二：HIS 直接注入预计算的风险项**

适用于 HIS 已有风险评估结果的场景，前端直接展示，不再调用 LLM。

```json
{
  "idPi": "766842939207974912",
  "naPi": "张虎",
  "sdSexText": "男性",
  "ageText": "65岁",
  "allergyHistory": "青霉素过敏",
  "risks": [
    {
      "level": 1,
      "category": "allergy",
      "content": "青霉素过敏，当前处方含阿莫西林，存在交叉过敏风险"
    },
    {
      "level": 2,
      "category": "chronic",
      "content": "高血压合并糖尿病，需关注肾功能指标"
    },
    {
      "level": 3,
      "category": "population",
      "content": "65岁以上老年患者，用药剂量需酌减"
    }
  ]
}
```

成功响应：

```json
{
  "status": "success",
  "idPi": "766842939207974912"
}
```

#### 前端展示行为

1. 收到请求后，`MedHermes` 会置顶窗口并展示风险提醒面板。
2. 风险项按 `level` 排序展示（红色在前，黄色在后）。
3. 如果存在 level 1 或 level 2 的高危/中危风险，医生必须手动点击"我已知悉"才能关闭面板。
4. 如果仅有 level 3 低危风险，面板将在 10 秒后自动关闭。

该接口不是问诊主链路必需项，可以后补。

## 7. `resultType` 处理约定

HIS 侧至少要识别以下 5 类结果：

| `resultType` | 含义 | HIS 建议动作 |
| :--- | :--- | :--- |
| `draft` | 病历草稿回写（仅主诉+现病史） | 回填主诉和现病史到医生站草稿 |
| `final-report` | 完整问诊最终报告（含诊断、治疗方案） | 作为完整结构化结果回写 |
| `record-confirmed` | 问诊一键确认回写（`orderList` 统一格式） | 直接用于 PHIS 调入确认弹窗，不走引用闭环 |
| `reference-request` | `MedHermes` 请求 PHIS 保存引用 | 调用 PHIS 保存，并准备回执 |
| `reference-feedback` | PHIS 回执后的最新状态 | 更新医生站状态，提示成功或失败 |

补充说明：

1. `draft` 与 `final-report` 都可能携带结构化诊断、用药、检查列表。
2. `record-confirmed` 来自问诊结果确认提交，其 `diagList` 和 `orderList` 已转换成 PHIS 可直接消费的结构。PHIS 收到后可直接按 `fgMain` 识别主诊断，再按 `sdSrv`、`idSrv`、`idDeptExec`、`doseOnce`、`idFreq`、`idUsge`、`jsonField`、`idPart` 等字段填充调入确认弹窗，无需二次补录。
3. `reference-request` 和 `reference-feedback` 都可能附带同一份病历上下文，便于 HIS 在当前界面直接处理。
4. 对引用闭环结果，HIS 应继续结合 `referenceType` 判断具体业务对象，不建议只看 `resultType`。
5. 一键回写场景下，`referenceType` 为 `batch`，`referenceItems` 包含诊断和所有选中治疗项目，每项通过 `type` 字段区分业务类型。单项引用场景下 `referenceType` 仍为具体类型（如 `diagnosis`）。

## 8. 长轮询与去重策略

推荐策略：

1. 调用 `/start`、`/assist` 或 `/start-voice` 成功后，发起第一个 `/result` 长轮询。
2. 收到结果后，根据 `resultType` 判断是否结束。如果是 `reference-request`，需在回执后立即发起下一个长轮询以等待 `reference-feedback`。
3. 发生 `404` 或 `网络超时` 时，立即发起下一个长轮询。
4. SDK 内部已封装此逻辑，HIS 接入建议直接使用 SDK 的事件监听。

推荐唯一键：

```text
consultationId + resultType + requestId + timestamp
```

## 9. 联调注意事项

1. 当前真实联调参考页是 `MedHermes/mock_his.html`。
2. `consultationId` 当前不是独立就诊流水，因此 HIS 侧必须防止“同患者旧结果误命中当前就诊”。
3. `/assist` 每次调用都会清空上一次结果通道；不要在旧轮询结果未消费完成时复用旧状态。
4. `reference-feedback` 只接受与“当前最新待处理引用请求”匹配的回执。
5. 当前页面恢复依赖同一运行期内的前端内存状态；如果 `MedHermes` 进程已经退出或重启，不保证还能恢复到回执前页面。
6. `MedHermes` 内所有推荐结果本质上都是医生确认前的草稿，HIS / PHIS 仍应保留最终校验与保存逻辑。

## 10. 最小接入示例

### 10.1 启动完整问诊

```bash
curl -X POST 'http://127.0.0.1:8081/api/consultation/start' \
  -H 'Content-Type: application/json' \
  -d '{
    "idPi": "766842939207974912",
    "naPi": "张虎",
    "sdSexText": "男性",
    "ageText": "19岁",
    "department": "呼吸内科",
    "chiefComplaint": "咳嗽三天"
  }'
```

### 10.2 轮询结果

```bash
curl 'http://127.0.0.1:8081/api/consultation/result'
```

### 10.3 回执引用结果（一键回写 batch）

```bash
curl -X POST 'http://127.0.0.1:8081/api/consultation/reference-feedback' \
  -H 'Content-Type: application/json' \
  -d '{
    "consultationId": "766842939207974912",
    "requestId": "ref-batch-1704355203000",
    "referenceType": "batch",
    "action": "batch",
    "status": "success",
    "message": "PHIS 已成功保存全部引用项目",
    "items": [
      {
        "name": "急性支气管炎",
        "code": "J20.900",
        "type": "diagnosis"
      },
      {
        "name": "阿莫西林胶囊",
        "type": "medication",
        "idCli": "10023"
      }
    ]
  }'
```

## 11. 推荐验收清单

HIS 接入完成后，至少验证以下场景：

1. `POST /start` 能唤起完整问诊
2. `POST /assist` 能进入对应灵活模式阶段
3. `/result` 能回收到当前患者的 `draft` 或 `final-report`
4. 推荐诊断引用时能先收到 `reference-request`
5. PHIS 调用 `/reference-feedback` 后，`/result` 能继续返回 `reference-feedback`
6. 一键回写场景：PHIS 收到一条 `batch` 类型 `reference-request`，遍历 `referenceItems` 按 `type` 分类处理，回执后页面显示"一键回写完成"
7. 切换患者后不会把上一位患者的结果误回填到当前医生站
8. 问诊一键确认回写：PHIS 收到 `resultType: "record-confirmed"` 结果后，读取 `orderList` 即可。药品、检查、检验、处置已经统一转换成 PHIS 调入确认格式，可直接用于回填弹窗

如果你们 HIS 需要，我建议下一步可以再按这份文档继续拆一版“给后端开发直接对接的字段清单”和“一版给联调测试直接执行的验收用例”。
