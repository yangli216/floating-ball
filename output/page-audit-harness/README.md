# PCIE 页面审查构建

本目录是页面审查专用的隔离构建入口。它直接导入 `pcie/src` 内的生产 Vue 组件，使用脱敏的模拟患者、问诊、报告、风险和 Tauri IPC 数据，使页面在不接入真实患者和 HIS 的情况下可重复渲染。

它不修改生产页面实现，也不替代真实 Tauri/HIS 联调。

## 运行

```bash
yarn vite output/page-audit-harness --config output/page-audit-harness/vite.config.ts
```

浏览器访问：

```text
http://127.0.0.1:1430/?page=chat
```

可用页面参数见 `src/AuditApp.vue`。截图脚本在 `capture-pages.sh` 与 `capture-pages-tail.sh`。

## 构建验证

```bash
yarn vite build output/page-audit-harness \
  --config output/page-audit-harness/vite.config.ts \
  --outDir dist
```

## 限制

- 远端 AI、知识库、药品/诊疗目录和真实 HIS 内容不会被调用。
- 页面中的“生成失败”“正文暂不可用”等状态可能由模拟环境缺少服务响应触发；审查报告会将这类模拟限制与产品代码问题分开说明。
- 截图中的患者、医生、编号与报告内容均为审查构造数据。
