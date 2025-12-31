<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getCurrentWindow, Window as TauriWindow } from "@tauri-apps/api/window";
import ChatPanel from "./components/ChatPanel.vue";
import { LogicalSize } from "@tauri-apps/api/dpi";

const appWindow = ref<TauriWindow | null>(null);
const isHovered = ref(false);
const isWorking = ref(false);
const transitioning = ref(false);
const exiting = ref(false);
const TRANSITION_MS = 420;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const TARGET_WORK_W = 420;
const TARGET_WORK_H = 560;
const TARGET_BALL_W = 80;
const TARGET_BALL_H = 80;

// 等待窗口达到指定逻辑尺寸（考虑缩放因子），避免内容在小尺寸下先渲染
const waitForWindowSize = async (logicalW: number, logicalH: number, timeout = 1000) => {
  if (!appWindow.value) return;
  let scale = 1;
  try {
    scale = await appWindow.value.scaleFactor();
  } catch {}
  const targetW = Math.round(logicalW * scale);
  const targetH = Math.round(logicalH * scale);
  const start = performance.now();
  while (performance.now() - start < timeout) {
    try {
      const size = await appWindow.value.innerSize();
      const reached = Math.abs(size.width - targetW) <= 2 && Math.abs(size.height - targetH) <= 2;
      if (reached) return;
    } catch {
      break;
    }
    await wait(16);
  }
};

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
const handleDoubleClick = async () => {
  transitioning.value = true;
  if (appWindow.value) {
    try {
      await appWindow.value.setResizable(true);
      await appWindow.value.setSize(new LogicalSize(TARGET_WORK_W, TARGET_WORK_H));
      await appWindow.value.setResizable(false);
    } catch (err) {
      console.warn('设置窗口大小失败:', err);
    }
  }
  // 等待窗口达到目标尺寸，避免问答面板在小窗口里短暂渲染
  await waitForWindowSize(TARGET_WORK_W, TARGET_WORK_H);
  isWorking.value = true;
  setTimeout(() => (transitioning.value = false), TRANSITION_MS);
};

const exitWork = async () => {
  transitioning.value = true;
  exiting.value = true;
  if (appWindow.value) {
    try {
      await appWindow.value.setResizable(true);
      await appWindow.value.setSize(new LogicalSize(TARGET_BALL_W, TARGET_BALL_H));
      await appWindow.value.setResizable(false);
    } catch (err) {
      console.warn('恢复窗口大小失败:', err);
    }
  }
  await waitForWindowSize(TARGET_BALL_W, TARGET_BALL_H);
  isWorking.value = false;
  setTimeout(() => {
    exiting.value = false;
    transitioning.value = false;
  }, TRANSITION_MS);
};
</script>

<template>
  <div class="state-layer">
    <Transition name="fade-only">
      <div v-show="!isWorking || exiting" key="floating" class="ball-layer">
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
      </div>
    </Transition>
    <Transition name="fade-only">
      <div v-show="isWorking" key="assistant" class="assistant-layer">
        <div class="assistant-container" :class="{ exiting }">
          <div class="assistant-toolbar" data-tauri-drag-region>
            <span class="assistant-title">工作状态 · 智能问答</span>
            <button class="icon-btn" aria-label="收起" title="收起" @click="exitWork">
              <svg class="toolbar-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <polyline points="6,10 12,16 18,10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>
          <ChatPanel />
        </div>
      </div>
    </Transition>
  </div>
  <div v-if="transitioning" class="transition-mask" />
</template>

<style scoped>
.floating-ball {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, #79c2ff 0%, #a985ff 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: move;
  user-select: none;
  transition: opacity var(--anim-dur) ease;
  will-change: opacity;
  transform: translateZ(0);
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

/* 主题变量：现代简约 + 玻璃质感 */
:root {
  --accent: #79c2ff;
  --accent-strong: #4fa7ff;
  --panel-bg: #f0f6ff; /* 问答界面固定背景，取自 accent 的浅色调 */
  --surface-glass: rgba(255, 255, 255, 0.52);
  --surface-glass-weak: rgba(255, 255, 255, 0.28);
  --text-strong: #0f172a;
  --text-weak: #334155;
  --anim-dur: 420ms;
  --anim-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* 层布局：两种状态层叠并交叉淡化 */
.state-layer {
  position: relative;
  width: 100%;
  height: 100%;
}
.ball-layer,
.assistant-layer {
  position: absolute;
  inset: 0;
}
.ball-layer {
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2; /* 退出时圆球遮在面板上方 */
}
.assistant-layer { z-index: 1; }

/* 纯淡入淡出过渡 */
.fade-only-enter-active,
.fade-only-leave-active {
  transition: opacity var(--anim-dur) var(--anim-ease);
}
.fade-only-enter-from,
.fade-only-leave-to {
  opacity: 0;
}

.assistant-container {
  width: 420px;
  height: 560px;
  border-radius: 16px;
  overflow: hidden;
  position: relative;
  background: var(--surface-glass);
  backdrop-filter: blur(12px) saturate(1.2);
  -webkit-backdrop-filter: blur(12px) saturate(1.2);
  border: 1px solid rgba(255, 255, 255, 0.35);
  box-shadow: 0 12px 32px rgba(127, 167, 255, 0.28);
  padding-top: 36px; /* 为顶部工具栏留出空间，避免文字重叠 */
  transition: opacity var(--anim-dur) var(--anim-ease), border-radius var(--anim-dur) var(--anim-ease);
  will-change: opacity, filter;
  transform: translateZ(0);
}
.assistant-container.exiting { border-radius: 50%; }

.assistant-toolbar {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  color: var(--text-strong);
  background: linear-gradient(135deg, rgba(121,194,255,0.16), rgba(79,167,255,0.14));
  backdrop-filter: blur(10px) saturate(1.1);
  -webkit-backdrop-filter: blur(10px) saturate(1.1);
  border-bottom: 1px solid rgba(121,194,255,0.28);
  box-shadow: 0 2px 6px rgba(79,167,255,0.12);
  z-index: 10;
  -webkit-app-region: drag;
}

.assistant-title {
  font-weight: 600;
  letter-spacing: 0.2px;
}

.assistant-container .icon-btn {
  -webkit-app-region: no-drag;
  appearance: none;
  border: 1px solid rgba(121,194,255,0.35);
  border-radius: 10px;
  width: 32px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: rgba(255,255,255,0.38);
  color: var(--text-strong);
  transition: background var(--anim-dur) ease, border-color var(--anim-dur) ease, box-shadow var(--anim-dur) ease;
}
.assistant-container .icon-btn:hover {
  background: rgba(255,255,255,0.52);
  border-color: rgba(121,194,255,0.55);
  box-shadow: 0 2px 8px rgba(79,167,255,0.18);
}
.assistant-container .toolbar-icon {
  width: 18px;
  height: 18px;
}

/* 已移除缩放过渡，改为纯淡入淡出（见 .fade-only-*） */

/* 过渡遮罩，柔化窗口尺寸瞬变 */
.transition-mask {
  position: absolute;
  inset: 0;
  background: radial-gradient(120% 120% at 50% 50%, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.0) 60%);
  pointer-events: none;
  animation: maskFade var(--anim-dur) ease;
}
@keyframes maskFade {
  from { opacity: 1; }
  to { opacity: 0; }
}
</style>
