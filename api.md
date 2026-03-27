# floating-ball HIS 接入指南 / 接口说明

> 最后更新: 2026-03-23
>
> 本文档面向准备接入 `floating-ball` 的 HIS / 医生站 / PHIS 项目。
> 当前真实运行契约以 `src-tauri/src/http_server.rs` 与当前前端实现为准；`docs/regionalization/*.md` 仍属于规划文档，不能替代本文档。

## 1. 文档目标

本文档回答 4 件事：

1. HIS 应该按什么顺序接入 `floating-ball`
2. 当前本地 HTTP Bridge 暴露了哪些接口
3. 各接口的请求字段、响应字段、异常场景是什么
4. 推荐诊断 / 用药 / 检查的“引用请求 -> PHIS 保存 -> 回执 floating-ball”闭环应该怎么做

## 2. 当前接入形态

`floating-ball` 当前通过本地 HTTP Bridge 与 HIS 对接：

- 本地服务地址: `http://127.0.0.1:8081`
- 接口前缀: `/api`
- 协议: `HTTP`
- 数据格式: `application/json`
- 编码: `UTF-8`

约束说明：

1. `floating-ball` 必须先在医生本机启动，否则接口不可访问。
2. 当前服务只监听 `127.0.0.1:8081`，默认供本机 HIS / 联调页调用。
3. 当前结果通道是“单槽内存态”而不是结果队列。
   也就是说，`GET /api/consultation/result` 读到的是“当前最新一条结果”，不是历史列表。
4. 当前 `consultationId` 默认直接使用 `idPi / patientId`。
   如果 HIS 存在“同患者多次接诊”场景，必须在 HIS 自己的上下文里再绑定一次“当前就诊”。

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
4. 如果收到 `reference-request`，说明医生在 `floating-ball` 内点击了“引用”

适用场景：

- 医生已经在 HIS 里录入了部分病历，只想快速拿 AI 推荐
- 不希望再开第二套独立问诊窗口

### 第三步: 打通 PHIS 引用闭环

1. HIS / PHIS 轮询到 `reference-request`
2. 读取其中的 `requestId`、`action`、`referenceItems`
3. 在 HIS / PHIS 内完成保存
4. 保存成功或失败后，调用 `POST /api/consultation/reference-feedback`
5. `floating-ball` 收到回执后会更新当前页面状态，并把最新状态继续暴露到 `GET /result`

这是当前联调最关键的一步，也是推荐诊断 / 用药 / 检查真正写入 HIS 的闭环。

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
2. `floating-ball` 置顶并进入完整问诊主流程
3. HIS 轮询 `GET /api/consultation/result`
4. 医生在 `floating-ball` 中完成问诊或草稿回写
5. HIS 收到 `draft` 或 `final-report` 后更新医生站

### 5.2 灵活模式时序

1. HIS 调用 `POST /api/consultation/assist`
2. `floating-ball` 直接进入 `ConsultationPage` 对应阶段
3. 医生在同一问诊页面中继续补充病历、看推荐、发起引用
4. HIS 持续轮询 `GET /api/consultation/result`
5. 如果收到 `reference-request`，进入 PHIS 引用处理

### 5.3 引用闭环时序

1. `floating-ball` 返回 `reference-request`
2. HIS / PHIS 保存诊断、用药或检查
3. PHIS 调用 `POST /api/consultation/reference-feedback`
4. `floating-ball` 页面显示“引用成功”或“引用失败”
5. HIS 再次轮询 `GET /api/consultation/result`，可读到 `reference-feedback`

## 6. 接口清单

### 6.1 `POST /api/consultation/start`

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
3. `floating-ball` 收到后会尝试置顶主窗口并进入完整问诊。

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

用途：获取当前最新一条问诊结果。

完整地址：

```text
http://127.0.0.1:8081/api/consultation/result
```

结果通道说明：

1. 这是当前唯一的结果回传通道。
2. 返回内容可能来自完整问诊、病历草稿回写、推荐项引用请求、PHIS 回执、语音问诊确认。
3. 当前是“最新结果覆盖旧结果”的单槽模型，HIS 必须自己做去重和当前患者校验。

#### 成功响应: 病历草稿或最终报告

```json
{
  "consultationId": "766842939207974912",
  "timestamp": 1704355200000,
  "resultType": "draft",
  "chiefComplaint": "咳嗽三天",
  "historyOfPresentIllness": "受凉后出现咳嗽、咳痰，无明显呼吸困难。",
  "pastMedicalHistory": "否认高血压、糖尿病病史。",
  "diagnosisList": [
    {
      "name": "急性支气管炎",
      "code": "J20.900"
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
  "reminders": [
    {
      "level": "urgent",
      "content": "存在明确药物过敏史，相关推荐用药必须由医生再次确认。"
    }
  ],
  "treatmentPlan": "按时服药，症状加重及时复诊。",
  "medicalSummary": "主诉：咳嗽三天\n现病史：受凉后出现咳嗽、咳痰，无明显呼吸困难。"
}
```

#### 成功响应: 引用请求

```json
{
  "consultationId": "766842939207974912",
  "timestamp": 1704355203000,
  "resultType": "reference-request",
  "requestId": "ref-diagnosis-1704355203000",
  "referenceType": "diagnosis",
  "action": "diagnosis",
  "referenceStatus": "pending",
  "referenceMessage": "等待 PHIS 保存引用结果",
  "referenceItems": [
    {
      "name": "急性支气管炎",
      "code": "J20.900",
      "type": "diagnosis"
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

#### 成功响应: 引用回执结果

```json
{
  "consultationId": "766842939207974912",
  "timestamp": 1704355205000,
  "resultType": "reference-feedback",
  "requestId": "ref-diagnosis-1704355203000",
  "referenceType": "diagnosis",
  "action": "diagnosis",
  "referenceStatus": "success",
  "referenceMessage": "PHIS 已成功保存诊断",
  "referenceItems": [
    {
      "name": "急性支气管炎",
      "code": "J20.900",
      "type": "diagnosis"
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
| `resultType` | 当前可能为 `draft` / `reference-request` / `reference-feedback` / `final-report` |
| `requestId` | 引用闭环请求 ID，仅引用相关结果存在 |
| `referenceType` | 当前引用对象类型，支持 `diagnosis` / `medication` / `examination` / `lab_test` / `procedure`；HIS 应优先用它判断这是一条什么回执 |
| `action` | 兼容旧版联调字段，语义与 `referenceType` 相同，建议新接入只把它当兼容字段使用 |
| `referenceStatus` | 引用状态，常见值 `pending` / `success` / `failed` |
| `referenceMessage` | 当前状态说明或失败原因 |
| `referenceItems` | 当前引用闭环中的结构化条目 |

HIS 处理建议：

1. 必须先校验 `consultationId` 是否匹配当前患者。
2. 建议按 `consultationId + requestId + resultType + timestamp` 做去重。
3. 判断“这是一条什么回执”时，建议优先看 `resultType + referenceType`：
   - `reference-request + diagnosis` = 请求 PHIS 保存诊断
   - `reference-feedback + diagnosis` = 诊断保存回执
   - `reference-feedback + medication` = 用药保存回执
   - `reference-feedback + examination` = 检查保存回执
   - `reference-feedback + lab_test` = 检验保存回执
   - `reference-feedback + procedure` = 处置保存回执
4. 收到 `reference-request` 后不要立刻停止轮询；应在 PHIS 回执完成后继续取到 `reference-feedback`。

### 6.5 `POST /api/consultation/reference-feedback`

用途：PHIS 在保存推荐诊断 / 用药 / 检查后，将成功或失败结果回执给 `floating-ball`。

完整地址：

```text
http://127.0.0.1:8081/api/consultation/reference-feedback
```

请求字段：

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `consultationId` | String | 是 | 当前患者 / 当前问诊标识 |
| `requestId` | String | 是 | 对应 `reference-request` 中的请求 ID |
| `referenceType` | String | 否 | 建议新接入显式传入的引用对象类型，支持 `diagnosis` / `medication` / `examination` / `lab_test` / `procedure` |
| `action` | String | 否 | 兼容旧版字段，语义与 `referenceType` 相同；`referenceType` 与 `action` 至少要传一个 |
| `status` | String | 是 | `success` / `failed` |
| `message` | String | 否 | 成功说明或失败原因 |
| `items` | Array | 否 | 本次实际保存的项目列表 |

请求示例：

```json
{
  "consultationId": "766842939207974912",
  "requestId": "ref-diagnosis-1704355203000",
  "referenceType": "diagnosis",
  "action": "diagnosis",
  "status": "success",
  "message": "PHIS 已成功保存诊断",
  "items": [
    {
      "name": "急性支气管炎",
      "code": "J20.900",
      "type": "diagnosis"
    }
  ]
}
```

成功响应：

```json
{
  "status": "success",
  "consultationId": "766842939207974912",
  "requestId": "ref-diagnosis-1704355203000",
  "referenceType": "diagnosis",
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
4. 建议 `status = failed` 时，把失败原因写进 `message`，便于医生在 `floating-ball` 里理解失败原因。
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

用途：把 HIS 当前患者的风险信息推送到 `floating-ball`，用于风险提醒展示。

完整地址：

```text
http://127.0.0.1:8081/api/patient/risks
```

请求示例：

```json
{
  "patientId": "766842939207974912",
  "patientName": "张虎",
  "gender": "M",
  "age": 19,
  "chiefComplaint": "咳嗽三天",
  "historyOfPresentIllness": "受凉后出现咳嗽、咳痰",
  "pastMedicalHistory": "高血压10年",
  "diagnosis": "急性支气管炎",
  "allergyHistory": "青霉素过敏"
}
```

成功响应：

```json
{
  "status": "success",
  "patientId": "766842939207974912"
}
```

该接口不是问诊主链路必需项，可以后补。

## 7. `resultType` 处理约定

HIS 侧至少要识别以下 4 类结果：

| `resultType` | 含义 | HIS 建议动作 |
| :--- | :--- | :--- |
| `draft` | 病历草稿回写 | 回填主诉、现病史、诊断和建议 |
| `final-report` | 完整问诊最终报告 | 作为完整结构化结果回写 |
| `reference-request` | `floating-ball` 请求 PHIS 保存引用 | 调用 PHIS 保存，并准备回执 |
| `reference-feedback` | PHIS 回执后的最新状态 | 更新医生站状态，提示成功或失败 |

补充说明：

1. `draft` 与 `final-report` 都可能携带结构化诊断、用药、检查列表。
2. `reference-request` 和 `reference-feedback` 都可能附带同一份病历上下文，便于 HIS 在当前界面直接处理。
3. 对引用闭环结果，HIS 应继续结合 `referenceType` 判断具体业务对象，不建议只看 `resultType`。
4. 当前推荐诊断为单选引用；推荐用药、推荐检查、推荐检验、推荐处置支持多选后按分组一次引用。

## 8. 推荐轮询与去重策略

推荐策略：

1. 调用 `/start`、`/assist`、`/start-voice` 成功后，立即开始轮询 `/result`
2. 轮询间隔建议 `1~2 秒`
3. `404 RESULT_NOT_READY` 视为正常等待，不应报错中断
4. 收到非当前患者 `consultationId` 的结果时直接忽略
5. 收到 `reference-request` 后继续轮询，直到拿到 `reference-feedback`
6. 收到同一条结果时按唯一键去重，避免重复回填

推荐唯一键：

```text
consultationId + resultType + requestId + timestamp
```

## 9. 联调注意事项

1. 当前真实联调参考页是 `floating-ball/mock_his.html`。
2. `consultationId` 当前不是独立就诊流水，因此 HIS 侧必须防止“同患者旧结果误命中当前就诊”。
3. `/assist` 每次调用都会清空上一次结果通道；不要在旧轮询结果未消费完成时复用旧状态。
4. `reference-feedback` 只接受与“当前最新待处理引用请求”匹配的回执。
5. 当前页面恢复依赖同一运行期内的前端内存状态；如果 `floating-ball` 进程已经退出或重启，不保证还能恢复到回执前页面。
6. `floating-ball` 内所有推荐结果本质上都是医生确认前的草稿，HIS / PHIS 仍应保留最终校验与保存逻辑。

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

### 10.3 回执引用结果

```bash
curl -X POST 'http://127.0.0.1:8081/api/consultation/reference-feedback' \
  -H 'Content-Type: application/json' \
  -d '{
    "consultationId": "766842939207974912",
    "requestId": "ref-diagnosis-1704355203000",
    "referenceType": "diagnosis",
    "action": "diagnosis",
    "status": "success",
    "message": "PHIS 已成功保存诊断",
    "items": [
      {
        "name": "急性支气管炎",
        "code": "J20.900",
        "type": "diagnosis"
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
6. 切换患者后不会把上一位患者的结果误回填到当前医生站
7. 语音接诊结果也能走同一条 `/result` 通道回写

如果你们 HIS 需要，我建议下一步可以再按这份文档继续拆一版“给后端开发直接对接的字段清单”和“一版给联调测试直接执行的验收用例”。
