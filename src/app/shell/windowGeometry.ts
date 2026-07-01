import type { WindowSize } from '@/constants/windowSizes';

export interface PhysicalPointLike {
  x: number;
  y: number;
}

export interface PhysicalSizeLike {
  width: number;
  height: number;
}

export interface PhysicalRectLike {
  position: PhysicalPointLike;
  size: PhysicalSizeLike;
}

export interface WindowGeometryMonitor {
  position: PhysicalPointLike;
  size: PhysicalSizeLike;
  workArea?: PhysicalRectLike;
  scaleFactor: number;
}

export interface ResolveWindowGeometryOptions {
  targetSize: WindowSize;
  currentPosition: PhysicalPointLike;
  monitor: WindowGeometryMonitor;
  preferredPosition?: PhysicalPointLike | null;
  marginLogical?: number;
}

export interface ResolvedWindowGeometry {
  logicalSize: WindowSize;
  physicalPosition: PhysicalPointLike;
  wasSizeClamped: boolean;
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function resolveWorkArea(monitor: WindowGeometryMonitor): PhysicalRectLike {
  const workArea = monitor.workArea;
  if (workArea && workArea.size.width > 0 && workArea.size.height > 0) {
    return workArea;
  }

  return {
    position: monitor.position,
    size: monitor.size,
  };
}

/**
 * 将视图偏好尺寸裁剪到当前显示器可见工作区，并计算安全物理坐标。
 *
 * 该函数不读取浏览器/Tauri 状态，供多显示器、混合 DPI 和历史尺寸恢复共同复用。
 */
export function resolveWindowGeometry({
  targetSize,
  currentPosition,
  preferredPosition,
  monitor,
  marginLogical = 16,
}: ResolveWindowGeometryOptions): ResolvedWindowGeometry {
  const scaleFactor = finitePositive(monitor.scaleFactor, 1);
  const workArea = resolveWorkArea(monitor);
  const requestedWidth = finitePositive(targetSize.width, 1);
  const requestedHeight = finitePositive(targetSize.height, 1);
  const safeMarginLogical = Math.max(0, Number.isFinite(marginLogical) ? marginLogical : 0);
  const marginPhysical = Math.round(safeMarginLogical * scaleFactor);

  const maxLogicalWidth = Math.max(1, Math.floor(
    Math.max(1, workArea.size.width - marginPhysical * 2) / scaleFactor,
  ));
  const maxLogicalHeight = Math.max(1, Math.floor(
    Math.max(1, workArea.size.height - marginPhysical * 2) / scaleFactor,
  ));
  const logicalSize = {
    width: Math.min(Math.round(requestedWidth), maxLogicalWidth),
    height: Math.min(Math.round(requestedHeight), maxLogicalHeight),
  };
  const physicalSize = {
    width: Math.round(logicalSize.width * scaleFactor),
    height: Math.round(logicalSize.height * scaleFactor),
  };

  const sourcePosition = preferredPosition ?? currentPosition;
  const minX = workArea.position.x + marginPhysical;
  const minY = workArea.position.y + marginPhysical;
  const maxX = workArea.position.x + workArea.size.width - marginPhysical - physicalSize.width;
  const maxY = workArea.position.y + workArea.size.height - marginPhysical - physicalSize.height;

  return {
    logicalSize,
    physicalPosition: {
      x: Math.round(clamp(sourcePosition.x, minX, maxX)),
      y: Math.round(clamp(sourcePosition.y, minY, maxY)),
    },
    wasSizeClamped: logicalSize.width !== Math.round(requestedWidth)
      || logicalSize.height !== Math.round(requestedHeight),
  };
}
