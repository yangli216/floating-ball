<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getCurrentWindow, Window as TauriWindow } from "@tauri-apps/api/window";

const appWindow = ref<TauriWindow | null>(null);
const isHovered = ref(false);

onMounted(() => {
  try {
    appWindow.value = getCurrentWindow();
  } catch (e) {
    console.warn("初始化窗口失败:", e);
  }
});

// 使用 Tauri 原生拖拽
const handleMouseDown = async (e: MouseEvent) => {
  // 只有左键才能拖拽
  if (e.button === 0 && appWindow.value) {
    try {
      await appWindow.value.startDragging();
    } catch (error) {
      console.error('拖拽失败:', error);
    }
  }
};

// 鼠标悬停效果
const handleMouseEnter = () => {
  isHovered.value = true;
};

const handleMouseLeave = () => {
  isHovered.value = false;
};

// 右键菜单 - 退出应用
const handleContextMenu = (e: MouseEvent) => {
  e.preventDefault();
  if (confirm('确定要退出悬浮球应用吗？') && appWindow.value) {
    appWindow.value.close();
  }
};

// 双击事件 - 可以添加自定义功能
const handleDoubleClick = () => {
  console.log('悬浮球被双击');
  // 这里可以添加双击后的功能，比如打开设置窗口等
};
</script>

<template>
  <div 
    class="floating-ball"
    tabindex="0"
    :class="{ 'is-hovered': isHovered }"
    @mousedown="handleMouseDown"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @contextmenu="handleContextMenu"
    @dblclick="handleDoubleClick"
  >
    <div class="ball-content">
      <svg 
        class="icon" 
        viewBox="0 0 1024 1024" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <path 
          d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64z m0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z"
          fill="currentColor"
        />
        <path 
          d="M512 140c-205.4 0-372 166.6-372 372s166.6 372 372 372 372-166.6 372-372-166.6-372-372-372z m0 684c-172.3 0-312-139.7-312-312s139.7-312 312-312 312 139.7 312 312-139.7 312-312 312z"
          fill="currentColor"
          opacity="0.6"
        />
      </svg>
      <div class="tooltip" v-if="isHovered">
        拖动我
      </div>
    </div>
  </div>
</template>

<style scoped>
.floating-ball {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: move;
  user-select: none;
  transition: opacity 0.2s ease;
  position: relative;
}

/* 通过伪元素实现圆形内发光，避免矩形剪裁造成的方形阴影错觉 */
.floating-ball::after {
  content: "";
  position: absolute;
  inset: 0; /* 保持在圆形内部 */
  border-radius: 50%;
  pointer-events: none;
  /* 径向渐变 + 轻微模糊形成柔和的光晕（仅在圆内渲染） */
  background: radial-gradient(circle at 50% 50%,
    rgba(255, 255, 255, 0.22) 0%,
    rgba(255, 255, 255, 0.12) 45%,
    rgba(255, 255, 255, 0.0) 70%
  );
  filter: blur(3px);
  opacity: 0;
  transition: opacity 0.25s ease;
}

.floating-ball.is-hovered::after,
.floating-ball:focus::after,
.floating-ball:active::after {
  opacity: 1;
}

.ball-content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  position: relative;
}

.icon {
  width: 50px;
  height: 50px;
  transition: transform 0.3s ease;
}

.floating-ball:hover .icon {
  transform: rotate(180deg) scale(1.05);
}

.tooltip {
  position: absolute;
  bottom: -30px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
</style>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: transparent;
}
</style>
