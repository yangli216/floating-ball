# 人卫数智 / PMPHAI 知识库链路

本文档记录当前真实运行的知识库实现。早期 `src/services/knowledgeSearch.ts`、聊天面板自动 RAG 注入、`RENWEI_TOKEN` 配置口径已经不再是当前代码基线。

## 当前职责

| 职责 | 当前文件 |
| --- | --- |
| PMPHAI API / token / 批量检索 / 分类检索 / 原文片段 / 页面 URL / 连接测试 | `src/services/pmphai.ts` |
| 知识库面板、RAG / 列表模式展示、结果详情弹窗 | `src/features/knowledge/ui/KnowledgePanel.vue` |
| 内置知识库页面入口和 page token URL 构建 | `src/features/knowledge/ui/KnowledgeBasePanel.vue` + `src/services/knowledgeBase.ts` |
| 智能问诊 / 语音问诊共用的批量检索状态 | `src/features/knowledge/model/useKnowledgeSearchController.ts` |
| 诊断、药品、检查分类词提取 | `src/features/knowledge/lib/knowledgeSearchCategories.ts` |
| 语音问诊到知识库 controller 的轻包装 | `src/features/voice-consultation/model/useVoiceKnowledgeSearch.ts` |
| 配置入口 | `src/components/SettingsPanel.vue` + `src/features/settings/ui/SettingsModelTab.vue` |

## 运行链路

1. 设置页读取并保存 `PMPHAI_APP_KEY`、`PMPHAI_APP_SECRET`、`PMPHAI_ENABLED`、`PMPHAI_SEARCH_MODE`。
2. `pmphaiService` 负责 PMPHAI token 获取、缓存、搜索、原文片段获取和页面 URL 生成。
3. `ConsultationPage.vue` 和语音问诊分别注入 `isPMPHAIConfigured`、`pmphaiService.searchByCategories`、`pmphaiService.batchSearch` 到 `useKnowledgeSearchController`。
4. `useKnowledgeSearchController` 只管理 loading、结果 Map、面板开合和单项定位，不直接依赖 PMPHAI 单例。
5. `KnowledgePanel.vue` 负责结果展示；RAG 模式展示诊断 / 药品 / 检查分组，列表模式通过 `pmphaiService.listSearch` 查询。

当前 `ChatPanel.vue` 没有接入自动 RAG 注入；如果后续要恢复聊天知识增强，需要先更新 `ARCHITECTURE.md` / `CODE_MAP.md`，再新增明确的聊天侧 controller 或复用现有 knowledge controller。

## PMPHAI 服务接口

常用接口来自 `pmphaiService`：

| 方法 | 用途 |
| --- | --- |
| `search(params)` | 单关键词知识 / 图书 / 图片搜索 |
| `batchSearch(queries, options)` | 多关键词批量搜索，返回 `Map<query, SearchResult[]>` |
| `searchByCategories(diagnoses, medications, examinations, options)` | 按诊断、药品、检查三类批量检索 |
| `getClip(id)` | 获取搜索结果原文片段 |
| `listSearch(params)` | 传统列表搜索 |
| `getPageUrl(params)` | 生成 PMPHAI 页面地址；区域化模式下由服务端生成 |
| `testConnection()` | 设置页连接测试 |

示例：

```typescript
import { pmphaiService, SearchType } from '@services/pmphai';

const results = await pmphaiService.search({
  query: '高血压诊断标准',
  type: SearchType.Knowledge,
  limit: 5,
  enableAbstract: true,
});

const batch = await pmphaiService.searchByCategories(
  ['高血压病'],
  ['苯磺酸氨氯地平片'],
  ['血常规'],
  { trackUsage: true }
);
```

## 区域化模式

区域化模式下桌面端不保存 PMPHAI 凭据，启用状态来自 bootstrap：

- `bootstrap.pmphai.enabled`
- `bootstrap.knowledgeBase.enabled`
- `bootstrap.knowledgeBase.baseUrl`

`pmphaiService` 会通过 `regionalPost` / `regionalGet` 调用远端 `/v1/knowledge/pmphai/*`。新增远端知识库接口时必须遵守区域化请求签名规则，不得绕过 `regionalClient`。

## 本地配置

非区域化模式下当前使用这些 `localStorage` 键：

| 键名 | 说明 |
| --- | --- |
| `PMPHAI_APP_KEY` | PMPHAI App Key |
| `PMPHAI_APP_SECRET` | PMPHAI App Secret |
| `PMPHAI_ENABLED` | 是否启用知识库搜索 |
| `PMPHAI_SEARCH_MODE` | `rag` 或 `list` |
| `KB_APP_KEY` / `KB_APP_SECRET` / `KB_BASE_URL` | 内置知识库页面入口的历史配置 |

不要在文档或代码中写入真实密钥；本地默认值应来自环境变量或用户配置，区域化环境由服务端托管。

## 维护约束

1. 智能问诊和语音问诊的分类词提取统一走 `knowledgeSearchCategories.ts`。
2. 面板开合、loading、结果 Map 和单项定位统一走 `useKnowledgeSearchController.ts`。
3. PMPHAI 凭据、token、远端接口和 page URL 生成仍由 `pmphai.ts` / `knowledgeBase.ts` 负责。
4. 新增知识库入口时优先复用 `@features/knowledge` 公开出口，不要重新创建 `knowledgeSearch.ts` 旁路服务。
5. 修改区域化 `/v1/knowledge/pmphai/*` 契约时，同步更新 `api.md`、后端契约和服务端实现。
