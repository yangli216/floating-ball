import type {
  SessionStatistics,
  FeedbackStatistics,
  PerformanceStatistics,
  RecommendationStatistics,
  OperationStatistics,
} from '../types/feedback';

/**
 * 生成 Markdown 格式的使用情况摘要报告
 */
export async function generateUsageReport(
  sessionStats: SessionStatistics,
  feedbackStats: FeedbackStatistics,
  performanceStats: PerformanceStatistics,
  recommendationStats?: RecommendationStatistics | null,
  operationStats?: OperationStatistics | null,
): Promise<string> {
  const now = new Date();
  const lines: string[] = [];

  lines.push(`# 使用情况报告`);
  lines.push(`> 生成时间: ${now.toLocaleString('zh-CN')}`);
  lines.push('');

  // 1. 会话概览
  lines.push(`## 会话概览`);
  lines.push('');
  lines.push(`| 指标 | 值 |`);
  lines.push(`|------|-----|`);
  lines.push(`| 总会话数 | ${sessionStats.totalSessions} |`);
  lines.push(`| 已完成 | ${sessionStats.completedSessions} |`);
  lines.push(`| 已取消 | ${sessionStats.cancelledSessions} |`);
  lines.push(`| 出错 | ${sessionStats.errorSessions} |`);
  const completionRate = sessionStats.totalSessions > 0
    ? ((sessionStats.completedSessions / sessionStats.totalSessions) * 100).toFixed(1)
    : '0.0';
  lines.push(`| 完成率 | ${completionRate}% |`);
  if (sessionStats.avgDurationMs) {
    const mins = Math.floor(sessionStats.avgDurationMs / 60000);
    const secs = Math.floor((sessionStats.avgDurationMs % 60000) / 1000);
    lines.push(`| 平均时长 | ${mins}分${secs}秒 |`);
  }
  lines.push(`| 总消息数 | ${sessionStats.totalMessages} |`);
  lines.push('');

  // 会话类型分布
  const typeLabels: Record<string, string> = { chat: '聊天', consultation: '门诊', voice: '语音', reception: '接诊' };
  if (sessionStats.sessionsByType && Object.keys(sessionStats.sessionsByType).length > 0) {
    lines.push(`### 会话类型分布`);
    lines.push('');
    for (const [type, count] of Object.entries(sessionStats.sessionsByType)) {
      const pct = sessionStats.totalSessions > 0
        ? ((count as number / sessionStats.totalSessions) * 100).toFixed(1)
        : '0.0';
      lines.push(`- **${typeLabels[type] || type}**: ${count} (${pct}%)`);
    }
    lines.push('');
  }

  // 2. 反馈统计
  lines.push(`## 反馈统计`);
  lines.push('');
  lines.push(`| 指标 | 值 |`);
  lines.push(`|------|-----|`);
  lines.push(`| 总反馈数 | ${feedbackStats.totalFeedbacks} |`);
  lines.push(`| 正面反馈 | ${feedbackStats.positiveCount} |`);
  lines.push(`| 负面反馈 | ${feedbackStats.negativeCount} |`);
  lines.push(`| 正面率 | ${(feedbackStats.positiveRate * 100).toFixed(1)}% |`);
  lines.push(`| 采纳数 | ${feedbackStats.adoptedCount} |`);
  lines.push(`| 拒绝数 | ${feedbackStats.rejectedCount} |`);
  lines.push(`| 修改数 | ${feedbackStats.modifiedCount} |`);
  lines.push(`| 采纳率 | ${(feedbackStats.adoptionRate * 100).toFixed(1)}% |`);
  lines.push('');

  // 3. AI 推荐效果
  if (recommendationStats && recommendationStats.totalRecommendations > 0) {
    lines.push(`## AI 推荐效果`);
    lines.push('');
    lines.push(`| 指标 | 值 |`);
    lines.push(`|------|-----|`);
    lines.push(`| 总推荐数 | ${recommendationStats.totalRecommendations} |`);
    lines.push(`| 匹配数 | ${recommendationStats.matchedCount} |`);
    lines.push(`| 匹配率 | ${(recommendationStats.matchRate * 100).toFixed(1)}% |`);
    if (recommendationStats.avgConfidence != null) {
      lines.push(`| 平均置信度 | ${(recommendationStats.avgConfidence * 100).toFixed(1)}% |`);
    }
    lines.push(`| Prompt Tokens | ${recommendationStats.totalPromptTokens} |`);
    lines.push(`| Completion Tokens | ${recommendationStats.totalCompletionTokens} |`);
    if (recommendationStats.avgLatencyMs != null) {
      lines.push(`| 平均延迟 | ${recommendationStats.avgLatencyMs.toFixed(0)} ms |`);
    }
    lines.push('');

    if (Object.keys(recommendationStats.recommendationsByType).length > 0) {
      const recLabels: Record<string, string> = { diagnosis: '诊断', medication: '药品', examination: '检查' };
      lines.push(`### 各类型推荐`);
      lines.push('');
      for (const [type, info] of Object.entries(recommendationStats.recommendationsByType)) {
        const rate = info.total > 0 ? ((info.matched / info.total) * 100).toFixed(1) : '0.0';
        lines.push(`- **${recLabels[type] || type}**: ${info.total} 条, 匹配 ${info.matched} (${rate}%)`);
      }
      lines.push('');
    }
  }

  // 4. 性能指标
  lines.push(`## 性能指标`);
  lines.push('');
  lines.push(`| 指标 | 值 |`);
  lines.push(`|------|-----|`);
  lines.push(`| 平均 LLM 延迟 | ${performanceStats.avgLlmLatencyMs?.toFixed(0) || 'N/A'} ms |`);
  lines.push(`| 平均 API 延迟 | ${performanceStats.avgApiLatencyMs?.toFixed(0) || 'N/A'} ms |`);
  lines.push(`| 总 Token 数 | ${performanceStats.totalTokenCount} |`);
  lines.push('');

  // 5. 操作统计
  if (operationStats && operationStats.totalOperations > 0) {
    lines.push(`## 用户操作统计`);
    lines.push('');
    lines.push(`- 总操作数: **${operationStats.totalOperations}**`);
    lines.push(`- 成功率: **${(operationStats.successRate * 100).toFixed(1)}%**`);
    lines.push(`- 错误数: **${operationStats.failureCount}**`);
    lines.push('');

    if (operationStats.topOperations.length > 0) {
      lines.push(`### 最频繁操作 (Top 10)`);
      lines.push('');
      lines.push(`| 排名 | 操作 | 次数 |`);
      lines.push(`|------|------|------|`);
      operationStats.topOperations.slice(0, 10).forEach((op, idx) => {
        lines.push(`| ${idx + 1} | ${op.name} | ${op.count} |`);
      });
      lines.push('');
    }

    if (operationStats.errorOperations.length > 0) {
      lines.push(`### 最近错误`);
      lines.push('');
      operationStats.errorOperations.slice(0, 10).forEach(err => {
        const time = new Date(err.createdAt * 1000).toLocaleString('zh-CN');
        lines.push(`- **${err.name}** (${time})`);
      });
      lines.push('');
    }
  }

  lines.push('---');
  lines.push(`*此报告由 AI 医疗助手自动生成*`);

  return lines.join('\n');
}
