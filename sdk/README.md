# MedHermes JS SDK 使用文档

> 智医助理 (MedHermes) 第三方 HIS 集成 SDK

## 文件说明

| 文件 | 部署方式 | 说明 |
|------|----------|------|
| `med-hermes-loader.js` | **HIS 本地部署** | 引导加载器，负责检测在线、协议拉起、CDN 加载。功能纯粹，极少更新 |
| `med-hermes-sdk.js` | **CDN 托管** | 完整 SDK，封装全部 API + 轮询 + 去重 + 事件系统 |
| `med-hermes-sdk.d.ts` | 随 SDK 分发 | TypeScript 类型声明（可选） |

**推荐架构：** HIS 本地只部署 `loader.js`，SDK 从 CDN 加载。这样 loader 几乎不需要更新，SDK 通过 CDN 自动获取最新版本。

---

## 方式一：使用 Loader（推荐）

最省心的接入方式。Loader 自动完成：检测桌面端 → 协议拉起 → 加载 SDK → 初始化。

```html
<!-- HIS 本地部署的 loader，指向 CDN 上的 SDK -->
<script src="/local/med-hermes-loader.js"
        data-sdk-url="https://cdn.example.com/med-hermes-sdk.js">
</script>

<script>
  // 等待 SDK 就绪，拿到已初始化的 MedHermes 实例
  MedHermesLoader.ready(function(mh) {
    mh.on('draft', function(result) {
      document.getElementById('chief').value = result.chiefComplaint;
    });

    // 绑定按钮
    document.getElementById('btn-ai').onclick = function() {
      mh.startConsultation({
        idPi: '12345', naPi: '张三',
        sdSexText: '男性', ageText: '30岁'
      });
    };
  });

  // 错误处理
  MedHermesLoader.onError(function(err) {
    console.error('智医助理加载失败:', err.message);
  });
</script>
```

### Loader 配置属性

通过 `<script>` 标签的 `data-*` 属性配置：

| 属性 | 默认值 | 说明 |
|------|--------|------|
| `data-sdk-url` | *(必填)* | CDN 上 SDK 的完整 URL |
| `data-auto-init` | `true` | 是否自动实例化并初始化 SDK |
| `data-bridge-url` | `http://127.0.0.1:8081/api` | 本地桥接地址 |
| `data-scheme` | `med-hermes` | 深度链接协议名 |

### Loader API

```js
// 注册就绪回调（SDK 加载 + 初始化完成后触发）
MedHermesLoader.ready(function(mh) { ... });

// 注册错误回调
MedHermesLoader.onError(function(err) { ... });

// 获取当前状态
MedHermesLoader.getStatus();
// → { online: true, sdkLoaded: true, instance: MedHermes }

// 手动 ping 检测
MedHermesLoader.ping().then(...);

// 手动触发协议拉起
MedHermesLoader.launch();

// 手动触发完整检测流程（检测 + 拉起 + 重试）
MedHermesLoader.detect().then(function(online) { ... });
```

### Loader 内部流程

```
页面加载
  │
  ├─ DOMContentLoaded
  │
  ├─ 1. ping 桌面端 (POST /api/handshake)
  │     ├─ 在线 → 继续
  │     └─ 离线 → med-hermes://launch 拉起 → 等 4 秒 → 重试 (最多 2 次)
  │
  ├─ 2. 动态加载 CDN 上的 med-hermes-sdk.js
  │
  ├─ 3. new MedHermes() + init() 握手
  │
  └─ 4. MedHermesLoader.ready(fn) 回调触发
```

---

## 方式二：直接引入 SDK

如果不需要 loader 的自动检测和拉起能力，可直接引入 SDK：

```html
<script src="https://cdn.example.com/med-hermes-sdk.js"></script>
```

零依赖、单文件，通过 `<script>` 标签引入即可完成与本地 MedHermes 桌面端的全部对接。

## 快速开始（5 分钟接入）

### 1. 引入 SDK

```html
<script src="https://cdn.example.com/med-hermes-sdk.js"></script>
```

### 2. 初始化

```js
const mh = new MedHermes();

// 初始化：采集浏览器上下文（域名、Cookie 等），与桌面端握手
// 如果桌面端未启动，会自动尝试通过协议拉起
await mh.init();
```

### 3. 启动问诊并监听结果

```js
// 监听病历草稿回写
mh.on('draft', (result) => {
  console.log('主诉:', result.chiefComplaint);
  console.log('现病史:', result.historyOfPresentIllness);
});

// 监听完整报告
mh.on('final-report', (result) => {
  console.log('诊断:', result.diagnosisList);
  console.log('用药:', result.medications);
});

// 监听错误
mh.on('error', (err) => {
  console.error('通信异常:', err.message);
});

// 启动完整问诊
mh.startConsultation({
  idPi: '766842939207974912',
  naPi: '张三',
  sdSexText: '男性',
  ageText: '30岁',
  department: '全科门诊'
});
```

完成！SDK 会自动处理轮询、去重和停止。

---

## 三步渐进接入

### 第一步：基础问诊（最简接入）

```js
const mh = new MedHermes();
await mh.init();

mh.on('draft', (result) => {
  fillChiefComplaint(result.chiefComplaint);
  fillHPI(result.historyOfPresentIllness);
});

mh.on('final-report', (result) => {
  fillFullRecord(result);
});

function onPatientSelected(patient) {
  mh.startConsultation(patient);
}
```

### 第二步：灵活模式（AI 辅助）

```js
// 医生已录入部分病历，需要 AI 推荐诊断
function requestDiagnosis(patient) {
  mh.assist(patient, 'diagnosis');
}

// 需要 AI 推荐用药
function requestMedication(patient) {
  mh.assist(patient, 'medication');
}

// 语音问诊
function startVoice(patient) {
  mh.startVoice(patient);
}

// 语音批量回写（含完整 PHIS 字段）
mh.on('batch', (result) => {
  // result.medications 包含 dosage, frequency, route 等
  showConfirmDialog(result);
});
```

### 第三步：引用闭环（PHIS 回写）

```js
mh.on('reference-request', (result) => {
  // MedHermes 请求 PHIS 保存推荐项目
  const items = result.referenceItems;
  const requestId = result.requestId;

  // 调用 PHIS 保存
  saveToPhis(items)
    .then(() => {
      mh.sendFeedback(requestId, 'success', 'PHIS 已保存');
    })
    .catch((err) => {
      mh.sendFeedback(requestId, 'failed', err.message);
    });
});

mh.on('reference-feedback', (result) => {
  if (result.referenceStatus === 'success') {
    showToast('回写成功');
  } else {
    showToast('回写失败: ' + result.referenceMessage);
  }
});
```

---

## 完整 API 参考

### 构造函数

```js
const mh = new MedHermes(options?)
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `baseUrl` | string | `http://127.0.0.1:8081/api` | 本地桥接地址 |
| `pollInterval` | number | `2000` | 轮询间隔（毫秒） |
| `autoPoll` | boolean | `true` | 业务调用后自动轮询 |
| `scheme` | string | `med-hermes` | 深度链接协议名 |
| `launchRetryMs` | number | `3000` | 协议拉起后等待重连时间 |
| `timeout` | number | `5000` | HTTP 请求超时 |
| `extra` | object | `{}` | 自定义浏览器上下文扩展字段 |

### 方法

#### `init(extra?): Promise`

初始化 SDK。采集浏览器上下文（域名、Cookie、UA 等）并与桌面端握手。如果桌面端不在线，会自动通过 `med-hermes://` 协议尝试拉起。

```js
await mh.init({ hospitalCode: 'H001', userId: 'doc-123' });
```

#### `startConsultation(patient): Promise`

启动完整问诊。

```js
await mh.startConsultation({
  idPi: '12345',
  naPi: '张三',
  sdSexText: '男性',
  ageText: '30岁',
  department: '全科',
  allergyHistory: '青霉素过敏',
  chiefComplaint: '咳嗽三天'
});
```

#### `assist(patient, action): Promise`

灵活模式，直接进入指定 AI 模块。

| action 值 | 说明 |
|-----------|------|
| `record` | 病历记录（生成主诉+现病史） |
| `diagnosis` | 诊断推荐 |
| `differential` | 鉴别诊断 |
| `medication` | 用药方案 |
| `examination` | 检查推荐 |
| `lab_test` | 检验推荐 |
| `procedure` | 处置推荐 |
| `reminder` | 智能提醒 |

#### `startVoice(patient?): Promise`

启动语音问诊。`patient` 可选，不传则沿用桌面端当前上下文。

#### `stop(): Promise`

结束当前接诊，清空上下文。

#### `sendRisks(patient, risks?): Promise`

推送患者风险信息。`risks` 为空时由 AI 自动分析。

#### `sendFeedback(requestId, status, message?, items?): Promise`

发送 PHIS 引用回执。每收到一条 `reference-request`，必须调用此方法回执。

#### `ping(): Promise`

检测桌面端是否在线。

#### `startPolling() / stopPolling()`

手动控制轮询（通常不需要，`autoPoll=true` 时自动管理）。

#### `destroy()`

销毁实例，清理定时器和事件监听。页面卸载前建议调用。

### 事件

| 事件名 | 回调参数 | 说明 |
|--------|----------|------|
| `draft` | `result` | 收到病历草稿回写 |
| `final-report` | `result` | 收到完整问诊报告 |
| `batch` | `result` | 收到语音问诊批量回写 |
| `reference-request` | `result` | 收到引用请求，需 PHIS 保存并回执 |
| `reference-feedback` | `result` | 收到引用回执确认 |
| `connected` | `info` | 与桌面端握手成功 |
| `disconnected` | - | 连接断开 |
| `launching` | - | 正在通过协议拉起桌面端 |
| `launch-failed` | - | 协议拉起失败 |
| `error` | `err` | 通信异常 |
| `polling-start` | - | 开始轮询 |
| `polling-stop` | - | 停止轮询 |

---

## 浏览器上下文

SDK 初始化时会自动采集以下浏览器信息并传递给桌面端：

| 字段 | 说明 |
|------|------|
| `origin` | 当前域名，如 `https://his.hospital.com` |
| `href` | 完整 URL |
| `cookie` | 当前页面 Cookie（桌面端可借此调用 HIS 后端服务） |
| `userAgent` | 浏览器 UA |
| `timestamp` | 初始化时间戳 |
| `extra` | 自定义扩展字段（通过构造参数或 `init()` 传入） |

桌面端可利用 Cookie 和域名信息调用 HIS 同域后端服务，实现"借用浏览器登录态"的能力。

---

## 离线拉起

当 MedHermes 桌面端未启动时，SDK 会自动通过 `med-hermes://` 协议尝试拉起：

1. 首先尝试 HTTP 调用
2. 如果失败（桌面端离线），触发 `launching` 事件
3. 通过隐藏 iframe 触发协议拉起
4. 等待 3 秒后重试 HTTP
5. 成功则触发 `connected`，失败则触发 `launch-failed`

```js
mh.on('launching', () => {
  showLoading('正在启动智医助理...');
});

mh.on('launch-failed', () => {
  showAlert('请手动启动智医助理桌面端');
});
```

---

## 常见问题

### Q: 调用接口报 CORS 错误？

SDK 通过 `fetch` 调用本地 `127.0.0.1:8081`，MedHermes 桌面端已配置 CORS 为 permissive，正常情况不会出现跨域问题。如果遇到，请确认桌面端版本是否最新。

### Q: 轮询什么时候自动停止？

收到 `draft`、`final-report`、`batch`、`reference-feedback` 时自动停止。收到 `reference-request` 时会继续轮询，等待 PHIS 回执后的 `reference-feedback`。

### Q: 如何在 Vue/React 中使用？

```js
// Vue 3 示例
import MedHermes from './med-hermes-sdk.js';

const mh = new MedHermes();

onMounted(async () => {
  await mh.init();
  mh.on('draft', handleDraft);
});

onUnmounted(() => {
  mh.destroy();
});
```

### Q: 如何切换患者？

切换患者时建议先调用 `stop()` 结束当前接诊，再启动新的问诊：

```js
await mh.stop();
await mh.startConsultation(newPatient);
```
