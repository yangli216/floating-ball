<script setup lang="ts">
import { Icon as IconifyIcon } from '@iconify/vue';
import { computed } from 'vue';

interface Props {
  /** Iconify 图标名称，格式为 'collection:icon-name'
   * 例如: 'mdi:account', 'lucide:settings', 'heroicons:home'
   * 可在 https://icon-sets.iconify.design/ 搜索
   */
  icon: string;
  /** 图标大小（宽度和高度） */
  size?: string | number;
  /** 图标颜色（使用 currentColor 继承父元素颜色） */
  color?: string;
  /** 内联显示 */
  inline?: boolean;
  /** 水平翻转 */
  hFlip?: boolean;
  /** 垂直翻转 */
  vFlip?: boolean;
  /** 旋转角度（0, 90, 180, 270） */
  rotate?: number;
}

const props = withDefaults(defineProps<Props>(), {
  size: '1em',
  color: 'currentColor',
  inline: false,
  hFlip: false,
  vFlip: false,
  rotate: 0,
});

// 计算样式
const iconStyle = computed(() => ({
  width: typeof props.size === 'number' ? `${props.size}px` : props.size,
  height: typeof props.size === 'number' ? `${props.size}px` : props.size,
  color: props.color,
}));
</script>

<template>
  <IconifyIcon
    :icon="icon"
    :style="iconStyle"
    :inline="inline"
    :horizontalFlip="hFlip"
    :verticalFlip="vFlip"
    :rotate="rotate"
  />
</template>

<style scoped>
/* 确保图标与文本对齐 */
:deep(svg) {
  display: block;
  vertical-align: middle;
}
</style>
