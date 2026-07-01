import { describe, expect, it } from 'vitest';
import { resolveWindowGeometry } from './windowGeometry';

const monitor = {
  position: { x: 0, y: 0 },
  size: { width: 1920, height: 1080 },
  workArea: {
    position: { x: 0, y: 0 },
    size: { width: 1920, height: 1040 },
  },
  scaleFactor: 1,
};

describe('resolveWindowGeometry', () => {
  it('keeps a fitting size inside the monitor work area', () => {
    expect(resolveWindowGeometry({
      targetSize: { width: 1120, height: 760 },
      currentPosition: { x: 1200, y: 500 },
      monitor,
    })).toEqual({
      logicalSize: { width: 1120, height: 760 },
      physicalPosition: { x: 784, y: 264 },
      wasSizeClamped: false,
    });
  });

  it('clamps an oversized historical preference to the visible work area', () => {
    const result = resolveWindowGeometry({
      targetSize: { width: 1451, height: 898 },
      currentPosition: { x: 300, y: 200 },
      monitor: {
        ...monitor,
        size: { width: 1366, height: 768 },
        workArea: {
          position: { x: 0, y: 0 },
          size: { width: 1366, height: 728 },
        },
      },
    });

    expect(result.logicalSize).toEqual({ width: 1334, height: 696 });
    expect(result.physicalPosition).toEqual({ x: 16, y: 16 });
    expect(result.wasSizeClamped).toBe(true);
  });

  it('uses monitor scale factor for mixed-DPI logical sizing', () => {
    const result = resolveWindowGeometry({
      targetSize: { width: 1280, height: 760 },
      currentPosition: { x: 1920, y: 0 },
      monitor: {
        position: { x: 1920, y: 0 },
        size: { width: 1920, height: 1080 },
        workArea: {
          position: { x: 1920, y: 0 },
          size: { width: 1920, height: 1020 },
        },
        scaleFactor: 1.5,
      },
    });

    expect(result.logicalSize).toEqual({ width: 1248, height: 648 });
    expect(result.physicalPosition).toEqual({ x: 1944, y: 24 });
  });

  it('honors a preferred return anchor while keeping it visible', () => {
    const result = resolveWindowGeometry({
      targetSize: { width: 280, height: 360 },
      currentPosition: { x: 500, y: 300 },
      preferredPosition: { x: 1800, y: 900 },
      monitor,
    });

    expect(result.physicalPosition).toEqual({ x: 1624, y: 664 });
  });

  it('keeps the refill confirmation workspace fully visible on a 1366x768 Windows work area', () => {
    const result = resolveWindowGeometry({
      targetSize: { width: 820, height: 720 },
      currentPosition: { x: 900, y: 500 },
      monitor: {
        position: { x: 0, y: 0 },
        size: { width: 1366, height: 768 },
        workArea: {
          position: { x: 0, y: 0 },
          size: { width: 1366, height: 728 },
        },
        scaleFactor: 1,
      },
    });

    expect(result).toEqual({
      logicalSize: { width: 820, height: 696 },
      physicalPosition: { x: 530, y: 16 },
      wasSizeClamped: true,
    });
  });
});
