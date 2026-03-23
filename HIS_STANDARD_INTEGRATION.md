# floating-ball 标准接入文档

> 最后更新: 2026-03-23
>
> 本文档用于给 HIS / 医生站 / PHIS 后端开发、联调测试、项目实施直接对接使用。
> 当前详细运行契约仍以 [api.md](./api.md) 与 `src-tauri/src/http_server.rs` 为准；本文档是标准接入口径，不替代底层真实契约。

## 1. 文档目的

本文档回答 5 个问题：

1. HIS 应该按什么顺序接入 `floating-ball`
2. 接入时最少需要准备哪些患者字段
3. 本地 HTTP Bridge 暴露了哪些标准接口
4. 推荐诊断 / 用药 / 检查的引用闭环怎么做
5. 联调完成后应该如何验收

## 2. 接入概览

### 2.1 当前对接方式

`floating-ball` 当前通过本地 HTTP Bridge 与 HIS 对接：

- 服务地址：`http://127.0.0.1:8081`
- 接口前缀：`/api`
- 协议：`HTTP`
- 数据格式：`application/json`
- 编码：`UTF-8`

### 2.2 接入前提

1. 医生本机必须先启动 `floating-ball`，否则本地接口不可访问。
2. 当前服务只监听 `127.0.0.1`，默认只供本机 HIS / 联调页调用。
3. 当前结果回传通道是单槽内存态，不是历史队列。
4. 当前 `consultationId` 默认直接使用 `idPi / patientId`，不是独立就诊流水号。

### 2.3 标准接入建议

建议按以下 3 步推进：

1. 先接 `POST /api/consultation/start` + `GET /api/consultation/result`
2. 再接 `POST /api/consultation/assist`，打通灵活模式
3. 最后接 `POST /api/consultation/reference-feedback`，完成 PHIS 引用闭环

## 3. 标准字段

### 3.1 患者上下文标准字段

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

### 3.2 兼容字段别名

当前桥接层兼容以下别名：

| 推荐字段 | 兼容别名 |
| :--- | :--- |
| `idPi` | `patientId` |
| `naPi` | `name` |
| `sdSexText` | `gender` |
| `ageText` | `age` |

建议：

1. 新接入统一使用标准字段名。
2. HIS 如果已有 `encounterId / visitId`，需要在 HIS 本地自行维护与 `consultationId` 的映射。
3. 不要假设当前接口原生支持“同患者多次接诊隔离”。

## 4. 标准接入流程

### 4.1 基础接诊流程

1. HIS 选中患者后调用 `POST /api/consultation/start`
2. 调用成功后立即轮询 `GET /api/consultation/result`
3. 收到 `draft` 或 `final-report` 后回填医生站草稿

适用场景：

- 从完整问诊开始
- 目标是生成病历草稿、初步诊断、用药建议、检查建议

### 4.2 灵活模式流程

1. HIS 在当前患者上下文下调用 `POST /api/consultation/assist`
2. 传入 `action`
3. 继续轮询 `GET /api/consultation/result`
4. 如收到 `reference-request`，说明医生在 `floating-ball` 中发起了引用

`action` 支持：

- `record`
- `diagnosis`
- `differential`
- `medication`
- `examination`
- `reminder`

适用场景：

- 医生已在 HIS 中录入部分病历，只想快速拿某类 AI 建议
- 不希望再开第二套独立问诊窗口

### 4.3 PHIS 引用闭环流程

1. HIS / PHIS 轮询到 `reference-request`
2. 读取 `requestId`、`referenceType`、`referenceItems`
3. 在 HIS / PHIS 内完成保存
4. 保存成功或失败后调用 `POST /api/consultation/reference-feedback`
5. `floating-ball` 收到回执后更新页面状态
6. HIS 继续轮询 `GET /api/consultation/result`，直到读到 `reference-feedback`

这是当前推荐诊断 / 用药 / 检查真正写入业务系统的闭环。

## 5. 接口标准

### 5.1 `POST /api/consultation/start`

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

处理说明：

1. 会刷新当前患者上下文。
2. 会清空上一条本地结果。
3. 桌面端会尝试置顶并进入完整问诊。

### 5.2 `POST /api/consultation/assist`

用途：在当前患者上下文里直接进入灵活模式中的某个动作。

完整地址：

```text
http://127.0.0.1:8081/api/consultation/assist
```

请求字段：

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `action` | String | 是 | `record` / `diagnosis` / `differential` / `medication` / `examination` / `reminder` |
| `idPi` | String | 是 | 患者唯一标识 |
| `naPi` | String | 是 | 患者姓名 |
| `sdSexText` | String | 是 | 性别文本 |
| `ageText` | String | 是 | 年龄文本 |
| 其他患者字段 | Mixed | 否 | 见第 3 节 |

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
  "diagnosis": "急性支气管炎"
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

处理说明：

1. 每次调用都会清空旧结果通道。
2. 如果已传入 `chiefComplaint + historyOfPresentIllness`，前端通常会跳过症状采集。
3. 如果触发 `differential / medication / examination` 但诊断不足，前端会提示医生先补全诊断。

### 5.3 `POST /api/consultation/start-voice`

用途：启动语音接诊胶囊。

完整地址：

```text
http://127.0.0.1:8081/api/consultation/start-voice
```

说明：

1. 请求体可以为空。
2. 若不为空，字段结构与 `/start` 基本一致。
3. 语音接诊结果最终仍通过 `GET /api/consultation/result` 返回。

### 5.4 `GET /api/consultation/result`

用途：获取当前最新一条问诊结果。

完整地址：

```text
http://127.0.0.1:8081/api/consultation/result
```

结果说明：

1. 这是当前唯一结果回传通道。
2. 当前采用“最新结果覆盖旧结果”的单槽模型。
3. HIS 必须自己做去重和当前患者校验。

#### 结果类型

| `resultType` | 含义 | HIS 建议动作 |
| :--- | :--- | :--- |
| `draft` | 病历草稿回写 | 回填主诉、现病史、诊断和建议 |
| `final-report` | 完整问诊最终报告 | 作为完整结构化结果回写 |
| `reference-request` | `floating-ball` 请求 PHIS 保存引用 | 调用 PHIS 保存，并准备回执 |
| `reference-feedback` | PHIS 回执后的最新状态 | 更新医生站状态，提示成功或失败 |

#### 重点字段

| 字段名 | 说明 |
| :--- | :--- |
| `consultationId` | 当前患者标识，现阶段默认等于 `idPi / patientId` |
| `timestamp` | 本条结果生成时间戳 |
| `requestId` | 引用闭环请求 ID，仅引用相关结果存在 |
| `referenceType` | 引用对象类型，支持 `diagnosis` / `medication` / `examination` |
| `action` | 兼容旧版字段，语义与 `referenceType` 相同 |
| `referenceStatus` | 引用状态，常见值 `pending` / `success` / `failed` |
| `referenceMessage` | 当前状态说明或失败原因 |
| `referenceItems` | 引用闭环中的结构化项目列表 |

#### 处理规则

1. 必须先校验 `consultationId` 是否匹配当前患者。
2. 判断回执类型时，建议优先看 `resultType + referenceType`。
3. 收到 `reference-request` 后不要停止轮询，应继续等待 `reference-feedback`。
4. `404 RESULT_NOT_READY` 视为正常等待，不应当作错误中断。

### 5.5 `POST /api/consultation/reference-feedback`

用途：PHIS 保存推荐诊断 / 用药 / 检查后，把成功或失败结果回执给 `floating-ball`。

完整地址：

```text
http://127.0.0.1:8081/api/consultation/reference-feedback
```

请求字段：

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `consultationId` | String | 是 | 当前患者 / 当前问诊标识 |
| `requestId` | String | 是 | 对应 `reference-request` 中的请求 ID |
| `referenceType` | String | 否 | 建议新接入显式传入，支持 `diagnosis` / `medication` / `examination` |
| `action` | String | 否 | 兼容旧版字段，语义与 `referenceType` 相同 |
| `status` | String | 是 | `success` / `failed` |
| `message` | String | 否 | 成功说明或失败原因 |
| `items` | Array | 否 | 本次实际保存项目列表 |

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

异常说明：

| HTTP 状态码 | `code` | 说明 |
| :--- | :--- | :--- |
| `400` | `INVALID_REFERENCE_TYPE` | `referenceType` 与 `action` 同时传入但不一致，或两者都没传 |
| `409` | `REFERENCE_REQUEST_MISMATCH` | 当前没有匹配的待处理引用请求 |

处理说明：

1. 当前回执必须匹配“最新一条结果”里的 `requestId`。
2. 当前回执必须匹配“最新一条结果”里的 `referenceType`。
3. 建议失败时把失败原因写进 `message`。
4. 建议原样回传成功或失败的 `items`，便于页面逐项更新状态。

### 5.6 `POST /api/consultation/stop`

用途：结束当前接诊上下文。

完整地址：

```text
http://127.0.0.1:8081/api/consultation/stop
```

成功响应：

```json
{
  "status": "success",
  "message": "Consultation stopped"
}
```

适用场景：

1. HIS 切换患者
2. 结束当前接诊
3. 退出本次联调

### 5.7 `POST /api/patient/risks`（可选）

用途：把 HIS 当前患者风险信息推送到 `floating-ball`，用于风险提醒展示。

该接口不是主链路必需项，可以后补。

## 6. 推荐轮询与去重策略

推荐策略：

1. 调用 `/start`、`/assist`、`/start-voice` 成功后，立即开始轮询 `/result`
2. 轮询间隔建议 `1~2 秒`
3. 收到 `404 RESULT_NOT_READY` 时继续等待
4. 收到非当前患者 `consultationId` 的结果直接忽略
5. 收到 `reference-request` 后继续轮询，直到拿到 `reference-feedback`
6. 收到重复结果时按唯一键去重

推荐唯一键：

```text
consultationId + resultType + requestId + timestamp
```

## 7. 引用闭环标准规则

### 7.1 判断这是一条什么回执

建议 HIS 优先按以下规则判断：

- `reference-request + diagnosis`：请求保存诊断
- `reference-request + medication`：请求保存用药
- `reference-request + examination`：请求保存检查检验
- `reference-feedback + diagnosis`：诊断保存回执
- `reference-feedback + medication`：用药保存回执
- `reference-feedback + examination`：检查检验保存回执

### 7.2 回执设计原则

1. `resultType` 负责区分“请求”还是“回执”。
2. `referenceType` 负责区分“诊断 / 用药 / 检查”。
3. `action` 仅作为兼容旧版字段保留。
4. 新接入项目应优先使用 `referenceType`，不要只依赖 `action`。

## 8. 最小接入示例

### 8.1 启动完整问诊

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

### 8.2 轮询结果

```bash
curl 'http://127.0.0.1:8081/api/consultation/result'
```

### 8.3 回执引用结果

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

## 9. 联调验收清单

接入完成后，至少验证以下场景：

1. `POST /api/consultation/start` 能唤起完整问诊
2. `POST /api/consultation/assist` 能进入对应灵活模式阶段
3. `GET /api/consultation/result` 能回收到当前患者的 `draft` 或 `final-report`
4. 发起推荐诊断 / 用药 / 检查引用时能先收到 `reference-request`
5. PHIS 调用 `POST /api/consultation/reference-feedback` 后，`GET /api/consultation/result` 能继续返回 `reference-feedback`
6. 切换患者后不会把上一位患者的结果误回填到当前医生站
7. 语音接诊结果也能走同一条 `/result` 通道回写

## 10. 联调注意事项

1. 当前真实联调参考页是 `floating-ball/mock_his.html`。
2. `consultationId` 当前不是独立就诊流水，HIS 必须防止同患者旧结果误命中当前就诊。
3. `/assist` 每次调用都会清空上一次结果通道，不要复用旧状态。
4. `reference-feedback` 只接受与“当前最新待处理引用请求”匹配的回执。
5. 当前页面恢复依赖同一运行期内的前端内存状态，不代表重启后仍可恢复。
6. `floating-ball` 内所有推荐结果本质上都是医生确认前草稿，HIS / PHIS 仍应保留最终校验和保存逻辑。
