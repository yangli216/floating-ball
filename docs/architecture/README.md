# 全医慧助（PCIE）架构图

本目录以当前 `pcie` 桌面端与 `pcie-server` 服务端的真实运行形态为基线，提供三张适合宣传型 PPT 使用的 16:9、4K PNG 架构图。

| 图 | 关注范围 | 图片 |
| --- | --- | --- |
| 总体架构图 | 系统边界、参与者、客户端、服务端与外部依赖 | [overall-architecture.png](./overall-architecture.png) |
| 业务架构图 | 接诊到回写的业务闭环，以及运营与治理能力 | [business-architecture.png](./business-architecture.png) |
| 技术架构图 | 桌面端、通信协议、服务端、数据与第三方技术分层 | [technical-architecture.png](./technical-architecture.png) |

维护约定：

1. `ARCHITECTURE.md` 是架构事实的唯一来源，图中只保留稳定边界与关键链路。
2. 本地 `/api/*` 仅用于 HIS/SDK Bridge；AI、语音、知识库、配置、反馈与审计固定经签名 `/v1/*` 访问 PCIE Server。
3. 历史 `MedHermes` / `med-hermes` 仅作为已发布技术契约的兼容标识，不作为产品品牌展示。
