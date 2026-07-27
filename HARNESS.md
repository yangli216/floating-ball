# 全医慧助（PCIE）桌面端项目 Harness

> 适用范围：全医慧助桌面端 `floating-ball` 独立 Git 仓库内的客户端任务。
> 根目录与本仓库 `AGENTS.md` 都是硬约束；项目内细节以本仓库规则为准。

## 1. 任务入口

1. 先读 `AGENTS.md`。
2. 用 `CODE_MAP.md` 定位模块。
3. 按任务补读：
   - 架构与模块职责：`ARCHITECTURE.md`
   - 用户可见行为：`PRODUCT.md`
   - 本地 HIS/SDK 契约：`api.md`
   - 前端复用或迁移：`docs/frontend-reuse-architecture.md`、`docs/frontend-file-structure-plan.md`
   - 历史决策与已知坑：`DECISION_DRIFT.md`、`RETRO.md`
4. 先执行 `git status --short`，保留用户已有修改。

## 2. 影响判断

| 改动 | 必查内容 |
| --- | --- |
| Vue 页面、组件、composable | App 编排边界、feature 公开入口、状态所有权、已有测试 |
| Services / `regionalClient` | `/v1/*` 契约、签名出口、超时/错误文案、服务端兼容 |
| Rust / Tauri | command 注册、权限、窗口生命周期、`cargo check` |
| 本地 HTTP Bridge / SDK | `api.md`、`http_server.rs`、SDK 调用方、WebSocket 结果事件 |
| HIS Adapter / PHIS | vendor-neutral DTO、adapter 边界、缓存 scope、联调日志 |
| 用户可见流程 | `PRODUCT.md`、窗口尺寸、回写/回执状态、可访问性 |

只要修改远端 `/v1/*` 字段或行为，就升级为 workspace 跨仓任务，补读 `../development-harness/HARNESS.md` 与服务端项目 harness。

## 3. 实施顺序

1. 更新受影响的 `ARCHITECTURE.md`、`PRODUCT.md` 或 `api.md`。
2. 更新或新增 fixture、类型和 Vitest 用例。
3. 实现 feature/composable/service，再由页面或 App 做最薄编排。
4. 涉及本地 Bridge 时同步更新 Rust、SDK、联调页和事件消费方。
5. 复查不得新增第三方密钥、本地 AI 直连、HTTP 轮询结果通道或绕过签名的 `fetch`。

## 4. 验证矩阵

| 影响范围 | 最小验证 |
| --- | --- |
| TypeScript / Vue | `yarn type-check`、相关 `yarn test:unit`、`yarn build` |
| Rust / Tauri | 上述验证 + `cargo check` |
| 本地 Bridge / SDK | 上述验证 + 请求、WebSocket 事件、reference-feedback 联调 |
| `/v1/*` | 上述验证 + 服务端对应测试和一条签名联调记录 |

无法执行的验证必须写明原因、影响和替代检查，不能用手测替代失败的类型检查。

## 5. 交付检查

1. 明确桌面端改了什么。
2. 明确服务端、管理端和数据库是否受影响。
3. 列出文档、测试、构建和手测结果。
4. 标出用户原有未提交修改，避免把它们计入本次成果。
