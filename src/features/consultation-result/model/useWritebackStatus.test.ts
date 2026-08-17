import { describe, expect, it } from 'vitest';
import { useWritebackStatus } from './useWritebackStatus';

describe('useWritebackStatus', () => {
  it('keeps cancelled feedback as a non-error terminal message', () => {
    const status = useWritebackStatus();
    status.markWritebackPending('request-1');

    status.applyWritebackFeedback({
      requestId: 'request-1',
      status: 'cancelled',
      message: '医生取消了互认决策',
    });

    expect(status.waitingWritebackFeedback.value).toBe(false);
    expect(status.writebackBannerTone.value).toBe('info');
    expect(status.writebackBannerText.value).toBe('医生取消了互认决策');
  });
});
