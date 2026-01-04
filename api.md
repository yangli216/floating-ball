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

### 2.2 获取问诊结果

用于获取医生在智能问诊系统中生成的病历结果。建议在调用“启动问诊”接口成功后，通过定时轮询 (Polling) 的方式调用此接口，直到获取到结果。

- **接口路径**: `/result`
- **请求方式**: `GET`
- **完整 URL**: `http://127.0.0.1:8081/api/consultation/result`

#### 响应示例

**成功 - 已生成结果 (HTTP 200)**
```json
{
  "consultationId": "766842939207974912",
  "diagnosis": "上呼吸道感染",
  "treatmentPlan": "1. 多饮水，注意休息。\n2. 开具感冒灵颗粒...",
  "medicalSummary": "患者主诉咳嗽三天，无发热...",
  "timestamp": 1704355200000
}
```

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
