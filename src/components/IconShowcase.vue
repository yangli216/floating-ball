<script setup lang="ts">
import Icon from './Icon.vue';
import { ref } from 'vue';

const selectedIcon = ref('mdi:account');
const iconSize = ref(24);
// 使用 CSS 变量的十六进制等价值作为默认值（与 --color-primary 对应）
const iconColor = ref('#0891B2');

// 常用医疗图标示例
const medicalIcons = [
  { name: 'mdi:account-heart', label: '患者' },
  { name: 'mdi:stethoscope', label: '听诊器' },
  { name: 'mdi:pill', label: '药物' },
  { name: 'mdi:hospital-box', label: '医院' },
  { name: 'mdi:clipboard-text', label: '病历' },
  { name: 'mdi:heart-pulse', label: '心率' },
  { name: 'healthicons:stethoscope', label: '听诊器2' },
  { name: 'healthicons:medicines', label: '药品' },
];

// UI 图标示例
const uiIcons = [
  { name: 'lucide:arrow-left', label: '返回' },
  { name: 'lucide:chevron-down', label: '下箭头' },
  { name: 'lucide:settings', label: '设置' },
  { name: 'lucide:message-square', label: '聊天' },
  { name: 'lucide:mic', label: '麦克风' },
  { name: 'lucide:send', label: '发送' },
  { name: 'lucide:copy', label: '复制' },
  { name: 'lucide:x', label: '关闭' },
];

// 系统图标示例
const systemIcons = [
  { name: 'healthicons:lungs', label: '呼吸系统' },
  { name: 'mdi:heart-pulse', label: '循环系统' },
  { name: 'healthicons:stomach', label: '消化系统' },
  { name: 'healthicons:kidneys', label: '泌尿系统' },
  { name: 'mdi:gender-male-female', label: '生殖系统' },
  { name: 'mdi:brain', label: '神经系统' },
  { name: 'healthicons:hormones', label: '内分泌系统' },
  { name: 'mdi:run', label: '运动系统' },
];

const selectIcon = (iconName: string) => {
  selectedIcon.value = iconName;
};
</script>

<template>
  <div class="icon-showcase">
    <h1>Iconify 图标展示</h1>

    <!-- 图标预览器 -->
    <div class="preview-section">
      <h2>图标预览器</h2>
      <div class="preview-container">
        <div class="icon-display">
          <Icon :icon="selectedIcon" :size="iconSize" :color="iconColor" />
        </div>
        <div class="controls">
          <div class="control-group">
            <label>图标名称:</label>
            <input v-model="selectedIcon" type="text" placeholder="例如: mdi:account" />
          </div>
          <div class="control-group">
            <label>大小: {{ iconSize }}px</label>
            <input v-model.number="iconSize" type="range" min="16" max="128" />
          </div>
          <div class="control-group">
            <label>颜色:</label>
            <input v-model="iconColor" type="color" />
          </div>
        </div>
      </div>
      <p class="hint">
        访问 <a href="https://icon-sets.iconify.design/" target="_blank" rel="noopener">
          https://icon-sets.iconify.design/
        </a> 搜索更多图标
      </p>
    </div>

    <!-- 医疗图标 -->
    <div class="icon-section">
      <h2>医疗相关图标</h2>
      <div class="icon-grid">
        <div
          v-for="icon in medicalIcons"
          :key="icon.name"
          class="icon-item"
          @click="selectIcon(icon.name)"
        >
          <Icon :icon="icon.name" size="32" />
          <span>{{ icon.label }}</span>
          <code>{{ icon.name }}</code>
        </div>
      </div>
    </div>

    <!-- UI 图标 -->
    <div class="icon-section">
      <h2>UI 界面图标</h2>
      <div class="icon-grid">
        <div
          v-for="icon in uiIcons"
          :key="icon.name"
          class="icon-item"
          @click="selectIcon(icon.name)"
        >
          <Icon :icon="icon.name" size="32" />
          <span>{{ icon.label }}</span>
          <code>{{ icon.name }}</code>
        </div>
      </div>
    </div>

    <!-- 系统图标 -->
    <div class="icon-section">
      <h2>身体系统图标</h2>
      <div class="icon-grid">
        <div
          v-for="icon in systemIcons"
          :key="icon.name"
          class="icon-item"
          @click="selectIcon(icon.name)"
        >
          <Icon :icon="icon.name" size="32" />
          <span>{{ icon.label }}</span>
          <code>{{ icon.name }}</code>
        </div>
      </div>
    </div>

    <!-- 使用示例 -->
    <div class="code-section">
      <h2>使用示例</h2>
      <pre><code>&lt;script setup&gt;
import Icon from './Icon.vue';
&lt;/script&gt;

&lt;template&gt;
  &lt;!-- 基本使用 --&gt;
  &lt;Icon icon="mdi:account" /&gt;

  &lt;!-- 自定义大小和颜色 --&gt;
  &lt;Icon icon="lucide:settings" size="24" color="var(--color-primary)" /&gt;

  &lt;!-- 在按钮中使用 --&gt;
  &lt;button&gt;
    &lt;Icon icon="lucide:send" inline /&gt;
    发送
  &lt;/button&gt;

  &lt;!-- 旋转图标 --&gt;
  &lt;Icon icon="lucide:arrow-right" rotate="90" /&gt;
&lt;/template&gt;</code></pre>
    </div>
  </div>
</template>

<style scoped>
/**
 * 组件样式规范：
 * - 所有颜色使用 var(--color-*) 语义变量
 * - 间距使用 var(--space-*)
 * - 动画使用 var(--duration-*) 和 var(--ease-*)
 * - 参考: src/styles/design-tokens.css
 */

.icon-showcase {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-2xl) var(--space-lg);
  font-family: var(--font-body);
}

h1 {
  font-size: var(--font-size-4xl);
  margin-bottom: var(--space-xl);
  color: var(--color-text-strong);
}

h2 {
  font-size: var(--font-size-2xl);
  margin: var(--space-xl) 0 var(--space-lg);
  color: var(--color-text-medium);
}

/* 预览器 */
.preview-section {
  background: var(--color-background-gray);
  padding: var(--space-xl);
  border-radius: var(--radius-lg);
  margin-bottom: var(--space-2xl);
}

.preview-container {
  display: flex;
  gap: var(--space-2xl);
  align-items: center;
}

.icon-display {
  flex-shrink: 0;
  width: 200px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-background-white);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.controls {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.control-group label {
  font-weight: var(--font-weight-medium);
  color: var(--color-text-weak);
}

.control-group input[type="text"] {
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  transition: border-color var(--duration-normal) var(--ease-out);
}

.control-group input[type="text"]:focus {
  border-color: var(--color-primary);
  outline: none;
  box-shadow: var(--shadow-focus);
}

.control-group input[type="range"] {
  width: 100%;
}

.control-group input[type="color"] {
  width: 60px;
  height: 40px;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
}

.hint {
  margin-top: var(--space-lg);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.hint a {
  color: var(--color-primary);
  text-decoration: none;
  transition: color var(--duration-fast) var(--ease-out);
}

.hint a:hover {
  color: var(--color-primary-dark);
  text-decoration: underline;
}

/* 图标网格 */
.icon-section {
  margin-bottom: var(--space-2xl);
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--space-md);
}

.icon-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-lg);
  background: var(--color-background-white);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
}

.icon-item:hover {
  border-color: var(--color-primary);
  box-shadow: 0 2px 8px var(--shadow-color);
  transform: translateY(-2px);
}

.icon-item span {
  font-size: var(--font-size-sm);
  color: var(--color-text-strong);
  text-align: center;
}

.icon-item code {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  background: var(--color-background-gray);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  text-align: center;
  word-break: break-all;
}

/* 代码示例 - 使用深色代码块变量 */
.code-section {
  --code-bg: #1E293B;
  --code-text: #E2E8F0;

  background: var(--code-bg);
  color: var(--code-text);
  padding: var(--space-xl);
  border-radius: var(--radius-lg);
  overflow-x: auto;
}

.code-section pre {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
}

.code-section code {
  color: var(--code-text);
}
</style>
