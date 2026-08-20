import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { ViewType } from '@/constants/windowSizes';
import type { AppPatient } from '@/types/appState';
import type { useWindowManagement } from './useWindowManagement';
import type { useWindowTransitionCoordinator } from './useWindowTransitionCoordinator';
import { useWorkMode } from './useWorkMode';

vi.mock('@/services/feedback', () => ({
  feedbackService: {
    startSession: vi.fn(async () => undefined),
    endSession: vi.fn(async () => undefined),
  },
}));

vi.mock('@/services/operationTracker', () => ({
  trackClick: vi.fn(),
}));

describe('useWorkMode reception capsule resize', () => {
  it('ignores a late reception resize after navigation has entered voice capture', async () => {
    const currentView = ref<ViewType>('voice-interaction');
    const resizeCurrentView = vi.fn(async () => undefined);
    const workMode = useWorkMode({
      appWindow: ref(null),
      windowMgmt: {
        lastBallPos: ref({ x: 120, y: 240 }),
        isMoving: ref(false),
        getPreferredWindowSize: vi.fn(async () => ({ width: 360, height: 80 })),
      } as unknown as ReturnType<typeof useWindowManagement>,
      windowTransition: {
        contentVisible: ref(true),
        resizeCurrentView,
        transitionToBall: vi.fn(async () => undefined),
        transitionToView: vi.fn(async () => undefined),
      } as unknown as ReturnType<typeof useWindowTransitionCoordinator>,
      currentView,
      isWorking: ref(true),
      transitioning: ref(false),
      isHovered: ref(false),
      currentPatient: ref<AppPatient | null>({ patientId: 'patient-1' } as AppPatient),
    });

    await workMode.resizeReceptionCapsule({ width: 420, height: 220 });

    expect(resizeCurrentView).not.toHaveBeenCalled();
  });

  it('resizes the active patient capsule without hiding its content', async () => {
    const resizeCurrentView = vi.fn(async () => undefined);
    const workMode = useWorkMode({
      appWindow: ref(null),
      windowMgmt: {
        lastBallPos: ref({ x: 120, y: 240 }),
        isMoving: ref(false),
        getPreferredWindowSize: vi.fn(async () => ({ width: 360, height: 80 })),
      } as unknown as ReturnType<typeof useWindowManagement>,
      windowTransition: {
        contentVisible: ref(true),
        resizeCurrentView,
        transitionToBall: vi.fn(async () => undefined),
        transitionToView: vi.fn(async () => undefined),
      } as unknown as ReturnType<typeof useWindowTransitionCoordinator>,
      currentView: ref<ViewType>('reception-capsule'),
      isWorking: ref(true),
      transitioning: ref(false),
      isHovered: ref(false),
      currentPatient: ref<AppPatient | null>({ patientId: 'patient-1' } as AppPatient),
    });

    await workMode.resizeReceptionCapsule({ width: 420, height: 220 });

    expect(resizeCurrentView).toHaveBeenCalledWith(
      { width: 420, height: 220 },
      {
        preferredPosition: { x: 120, y: 240 },
        resizable: false,
        fade: false,
      },
    );
  });
});
