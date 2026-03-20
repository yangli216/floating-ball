declare module 'echarts/core' {
  export function use(...args: any[]): void;
  export function init(...args: any[]): any;
  export type ECharts = any;
  export type ComposeOption<T = any> = any;
}

declare module 'echarts/charts' {
  export const SankeyChart: unknown;
  export type SankeySeriesOption = any;
}

declare module 'echarts/components' {
  export const TooltipComponent: unknown;
  export type TooltipComponentOption = any;
}

declare module 'echarts/renderers' {
  export const CanvasRenderer: unknown;
}
