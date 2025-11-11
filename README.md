# Tauri 桌面悬浮球应用

这是一个基于 Tauri 2.0 + Vue 3 + TypeScript 开发的桌面悬浮球应用框架。

## 项目特性

### 核心功能
- **透明窗口**：窗口背景完全透明，只显示悬浮球本身
- **无边框设计**：去除系统默认窗口边框，实现纯悬浮效果
- **始终置顶**：悬浮球始终显示在所有窗口之上
- **自由拖拽**：支持鼠标拖拽移动悬浮球位置
- **交互反馈**：鼠标悬停时有缩放和旋转动画效果
- **右键退出**：右键点击悬浮球可退出应用
- **双击扩展**：预留双击事件，可扩展更多功能

### 技术栈
- **前端框架**：Vue 3 + TypeScript
- **构建工具**：Vite
- **桌面框架**：Tauri 2.0
- **后端语言**：Rust

## 项目结构

```
floating-ball/
├── src/                    # 前端源码
│   ├── App.vue            # 主组件（悬浮球界面）
│   └── main.ts            # 前端入口文件
├── src-tauri/             # Tauri 后端
│   ├── src/
│   │   └── lib.rs         # Rust 主程序（窗口控制逻辑）
│   ├── Cargo.toml         # Rust 依赖配置
│   └── tauri.conf.json    # Tauri 配置文件
├── package.json           # Node.js 依赖配置
└── README.md              # 项目说明文档
```

## 开发指南

### 环境要求
- Node.js 18+
- Rust 1.70+
- pnpm（推荐）或 npm

### 安装依赖
```bash
pnpm install
```

### 开发模式
```bash
pnpm tauri dev
```

### 构建应用
```bash
pnpm tauri build
```

构建完成后，可执行文件位于 `src-tauri/target/release/` 目录下。

## 配置说明

### 窗口配置（tauri.conf.json）

```json
{
  "app": {
    "windows": [
      {
        "width": 80,           // 窗口宽度
        "height": 80,          // 窗口高度
        "resizable": false,    // 禁止调整大小
        "decorations": false,  // 无边框
        "alwaysOnTop": true,   // 始终置顶
        "skipTaskbar": true,   // 不显示在任务栏
        "transparent": true,   // 透明背景
        "x": 100,              // 初始 X 坐标
        "y": 100               // 初始 Y 坐标
      }
    ]
  }
}
```

### 样式配置（App.vue）

悬浮球的外观可以通过修改 `App.vue` 中的 CSS 样式来自定义：

- **尺寸**：修改 `.floating-ball` 的 `width` 和 `height`
- **颜色**：修改 `background` 渐变色值
- **阴影**：调整 `box-shadow` 参数
- **动画**：修改 `transition` 和 `transform` 属性

## 功能扩展

### 添加菜单功能

可以在双击事件中添加菜单窗口：

```typescript
const handleDoubleClick = () => {
  // 打开设置窗口或菜单
  // 可以创建新的 Tauri 窗口
};
```

### 添加快捷键

在 `lib.rs` 中注册全局快捷键：

```rust
use tauri::GlobalShortcutManager;

// 在 setup 中注册快捷键
app.global_shortcut_manager()
    .register("Ctrl+Shift+F", move || {
        // 快捷键触发的操作
    })
    .unwrap();
```

### 添加系统托盘

修改 `tauri.conf.json` 添加托盘配置，并在 `lib.rs` 中实现托盘菜单。

### 数据持久化

可以使用 Tauri 的 `tauri-plugin-store` 插件来保存悬浮球的位置等配置信息。

## 常见问题

### Q: 悬浮球无法拖拽？
A: 确保 Tauri 配置中 `decorations` 设置为 `false`，并且前端调用了 `startDragging()` API。

### Q: 窗口不透明？
A: 检查 `tauri.conf.json` 中 `transparent` 是否设置为 `true`，以及 CSS 中 `background` 是否设置为 `transparent`。

### Q: Linux 下透明窗口显示异常？
A: 确保安装了 `libwebkit2gtk-4.0-dev` 等必要的系统依赖。

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
