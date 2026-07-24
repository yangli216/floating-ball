import { createApp } from "vue";
import App from "./App.vue";

// 离线图标集：预注册本地 JSON，避免内网环境从 Iconify CDN 拉取
import { addCollection } from "@iconify/vue/offline";
import { iconifyCollections } from "./icons/iconifyCollections";
import { chronicDiseaseIconCollections } from "./icons/chronicDiseaseIcons";
iconifyCollections.forEach((collection) => addCollection(collection as never));
chronicDiseaseIconCollections.forEach((collection) => addCollection(collection as never));

// 导入全局设计令牌和样式覆盖
import "./styles/design-tokens.css";
import "./styles/global-overrides.css";
import "./styles/utilities.css";

// 导入应用样式（重构后的模块化样式）
import "./styles/global.css";
import "./styles/layouts/app-layout.css";
import "./styles/animations/morph.css";

// 导入主题服务并初始化
import { initializeTheme } from "./services/themeService";
import { createPinia } from "pinia";

// 在 Vue 应用挂载前初始化主题，避免闪烁
initializeTheme();

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

// 捕获 Vue 组件更新期间的内部错误，防止其转变为 Unhandled Promise Rejection。
// 背景：Vue 3 在 BaseTransition（morph 过渡区域）内处理组件挂载/卸载时，若 vnode.component
// 尚为 null，会抛出 "component.emitsOptions" 错误；若不捕获，会通过 nextTick Promise 链
// 传播并中断调用方的 async 函数逻辑。
app.config.errorHandler = (err, _instance, info) => {
  console.warn('[Vue] Caught component error in', info, err);
};

app.mount("#app");

// 服务端客户端初始化（异步，不阻塞渲染）
import { ensureRegionalConnectionDefaults } from "./services/regionalClient";
import { initializeRegionalRuntime } from "./services/regionalRuntime";

ensureRegionalConnectionDefaults();

initializeRegionalRuntime().then((config) => {
  if (config) {
    console.log('[App] Server runtime initialization complete');
  }
}).catch(err => {
  console.warn('[App] Server runtime init failed; server-backed capabilities remain unavailable:', err);
});
