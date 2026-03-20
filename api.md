# 智能问诊系统对接接口说明

本文档描述了 HIS 系统与智能问诊系统（悬浮球）的本地对接接口。HIS 系统通过 HTTP 请求将患者信息发送给悬浮球应用，并接收问诊结果。

## 1. 服务基础信息

- **服务地址 (Base URL)**: `http://127.0.0.1:8081/api/consultation`
- **通信协议**: HTTP
- **数据格式**: JSON
- **字符编码**: UTF-8

> **注意**: 请确保智能问诊系统（悬浮球应用）已在本地启动，否则接口无法访问。

## 2. 接口列表

### 2.1 启动问诊 (呼叫)

用于将当前 HIS 界面中的患者信息同步至智能问诊系统，并自动唤起/置顶问诊窗口。

- **接口路径**: `/start`
- **请求方式**: `POST`
- **完整 URL**: `http://127.0.0.1:8081/api/consultation/start`

#### 请求参数 (JSON Body)

| 字段名 | 类型 | 必填 | 描述 | 示例值 |
| :--- | :--- | :--- | :--- | :--- |
| `idPi` | String | 是 | 患者唯一标识 (Patient ID) | `"766842939207974912"` |
| `naPi` | String | 是 | 患者姓名 | `"张虎"` |
| `sdSexText` | String | 是 | 性别文本 | `"男性"` / `"女性"` |
| `ageText` | String | 是 | 年龄文本 | `"19岁"` |
| `department` | String | 否 | 就诊科室 | `"呼吸内科"` |
| `idCard` | String | 否 | 身份证号 | `"360731200607117442"` |
| `mobilePhone` | String | 否 | 联系电话 | `"13800138000"` |
| `allergyHistory` | String | 否 | 过敏史 | `"青霉素过敏"` |
| `chiefComplaint` | String | 否 | 主诉 (可选) | `"咳嗽三天"` |

> **说明**: 接口底层支持字段别名兼容（如 `patientId` 可映射为 `idPi`），但建议统一使用上述标准字段名。

#### 响应示例

**成功 (HTTP 200)**
```json
{
  "status": "success",
  "consultationId": "766842939207974912"
}
```

### 2.1.1 灵活触发 AI 辅助

用于在不打断原症状问诊主流程的前提下，直接唤起 `floating-ball` 的桌面助手式悬浮小窗，并自动触发某个推荐动作。

- **接口路径**: `/assist`
- **请求方式**: `POST`
- **完整 URL**: `http://127.0.0.1:8081/api/consultation/assist`

#### 请求参数 (JSON Body)

| 字段名 | 类型 | 必填 | 描述 | 示例值 |
| :--- | :--- | :--- | :--- | :--- |
| `action` | String | 是 | 触发动作，当前支持 `record` / `diagnosis` / `medication` / `examination` | `"diagnosis"` |
| `idPi` | String | 是 | 患者唯一标识 | `"766842939207974912"` |
| `naPi` | String | 是 | 患者姓名 | `"张虎"` |
| `sdSexText` | String | 是 | 性别文本 | `"男性"` |
| `ageText` | String | 是 | 年龄文本 | `"19岁"` |
| `department` | String | 否 | 就诊科室 | `"呼吸内科"` |
| `chiefComplaint` | String | 否 | 当前主诉 | `"咳嗽三天"` |
| `historyOfPresentIllness` | String | 否 | 当前现病史 | `"受凉后出现咳嗽、咳痰"` |
| `pastMedicalHistory` | String | 否 | 当前既往史 | `"高血压10年"` |
| `diagnosis` | String | 否 | 当前医生站诊断草稿 | `"急性支气管炎"` |
| `vitals` | String | 否 | 当前体征摘要 | `"T 37.8℃，P 92次/分"` |
| `allergyHistory` | String | 否 | 过敏史 | `"青霉素过敏"` |

#### 响应示例

**成功 (HTTP 200)**
```json
{
  "status": "success",
  "consultationId": "766842939207974912",
  "action": "diagnosis"
}
```

> **说明**: 此接口只负责唤起桌面助手式悬浮小窗并自动触发推荐，不会直接生成 `/result` 结果。医生在小窗中选中候选项后，可通过卡片内的“确认并回写”一步完成采纳与回写；HIS 仍需通过 `/result` 拉取最终结果。为避免读到上一次旧结果，服务端会在每次 `assist` 触发时先清空本地结果通道。

### 2.2 获取问诊结果

用于获取医生在智能问诊系统中生成的病历结果。建议在调用“启动问诊”接口成功后，通过定时轮询 (Polling) 的方式调用此接口，直到获取到结果。

> **补充说明**: 结果来源既可以是完整问诊页提交，也可以是接诊 session 小窗中的“回写医生站草稿”。两者最终都会写入同一条本地结果通道，再由 HIS 通过 `/result` 拉取。联调页或 HIS 轮询时应校验返回的 `consultationId` 是否与当前患者一致，避免旧结果误回填。

- **接口路径**: `/result`
- **请求方式**: `GET`
- **完整 URL**: `http://127.0.0.1:8081/api/consultation/result`

#### 响应示例

**成功 - 已生成结果 (HTTP 200)**
```json
{
  "consultationId": "766842939207974912",
  "timestamp": 1704355200000,
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
      "usage": "30mg，口服，每日3次"
    }
  ],
  "examinations": [
    {
      "name": "血常规"
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

> **字段说明**: `reminders` 为可选字段，表示接诊 session 小窗在“回写医生站草稿”时一并附带的风险提醒。`mock_his.html` 联调页默认会把 `chiefComplaint/historyOfPresentIllness/pastMedicalHistory/diagnosisList/medications/examinations/treatmentPlan/medicalSummary/reminders` 一起回填到医生站草稿区，右侧结果区仅作为预览。

**等待中 - 结果尚未生成 (HTTP 404)**
```json
{
  "error": "Consultation result not available",
  "code": "RESULT_NOT_READY"
}
```

### 2.3 结束问诊

用于强制结束当前的问诊会话（可选）。

- **接口路径**: `/stop`
- **请求方式**: `POST`
- **完整 URL**: `http://127.0.0.1:8081/api/consultation/stop`

#### 响应示例

**成功 (HTTP 200)**
```json
{
  "status": "success",
  "message": "Consultation stopped"
}
```

## 3. 调用流程示例 (伪代码)

```javascript
// 1. 呼叫问诊系统
const patientData = {
    idPi: "10001",
    naPi: "李四",
    sdSexText: "男性",
    ageText: "30岁",
    department: "全科",
    mobilePhone: "13900000000",
    idCard: "110101199001011234",
    allergyHistory: "无"
};

const startResp = await http.post('http://127.0.0.1:8081/api/consultation/start', patientData);

if (startResp.status === 200) {
    // 2. 轮询结果
    const timer = setInterval(async () => {
        const resultResp = await http.get('http://127.0.0.1:8081/api/consultation/result');
        
        if (resultResp.status === 200) {
            const result = resultResp.data;
            console.log("诊断结果:", result.diagnosis);
            console.log("处方建议:", result.treatmentPlan);
            
            // 拿到结果后停止轮询，并回填到 HIS 界面
            clearInterval(timer);
            fillHisForm(result);
        }
    }, 2000); // 每2秒轮询一次
}
```
