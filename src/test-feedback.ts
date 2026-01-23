// 简单的数据库测试
// 在浏览器控制台中运行以测试反馈系统

import { invoke } from '@tauri-apps/api/core';

async function testFeedbackSystem() {
  console.log('=== 测试反馈系统 ===');

  try {
    // 1. 创建会话
    console.log('1. 创建会话...');
    const sessionId = await invoke('create_session', {
      sessionType: 'chat',
      patientId: 'test_patient_001',
      patientName: '测试患者'
    });
    console.log('✓ 会话创建成功:', sessionId);

    // 2. 保存消息
    console.log('2. 保存用户消息...');
    const userMsgId = await invoke('save_message', {
      sessionId,
      role: 'user',
      content: '你好，我想咨询一下',
      images: null,
      tokenCount: null,
      llmModel: null,
      latencyMs: null
    });
    console.log('✓ 用户消息已保存:', userMsgId);

    console.log('3. 保存助手消息...');
    const assistantMsgId = await invoke('save_message', {
      sessionId,
      role: 'assistant',
      content: '您好！我是AI医疗助手，很高兴为您服务。',
      images: null,
      tokenCount: 25,
      llmModel: 'gpt-4',
      latencyMs: 1500
    });
    console.log('✓ 助手消息已保存:', assistantMsgId);

    // 3. 保存正面反馈
    console.log('4. 保存正面反馈...');
    const feedbackId = await invoke('save_feedback', {
      sessionId,
      targetType: 'message',
      targetId: assistantMsgId,
      feedbackType: 'positive',
      rating: 5,
      reason: '回复很有帮助',
      originalValue: null,
      modifiedValue: null
    });
    console.log('✓ 反馈已保存:', feedbackId);

    // 4. 获取统计信息
    console.log('5. 获取统计信息...');
    const sessionStats = await invoke('get_session_statistics', {
      startDate: null,
      endDate: null
    });
    console.log('✓ 会话统计:', sessionStats);

    const feedbackStats = await invoke('get_feedback_statistics', {
      startDate: null,
      endDate: null
    });
    console.log('✓ 反馈统计:', feedbackStats);

    // 5. 结束会话
    console.log('6. 结束会话...');
    await invoke('update_session_status', {
      sessionId,
      status: 'completed',
      endTime: Date.now()
    });
    console.log('✓ 会话已结束');

    console.log('\n=== 所有测试通过! ===');
    return true;

  } catch (error) {
    console.error('✗ 测试失败:', error);
    return false;
  }
}

// 导出测试函数
export { testFeedbackSystem };

// 自动运行测试（如果在开发模式）
if (import.meta.env.DEV) {
  console.log('开发模式 - 可以在控制台运行 testFeedbackSystem() 来测试反馈系统');
}
