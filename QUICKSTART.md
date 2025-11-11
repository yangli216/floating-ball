# 快速开始指南

## 运行项目

### 1. 进入项目目录
```bash
cd /home/ubuntu/floating-ball
```

### 2. 确保依赖已安装
```bash
pnpm install
```

### 3. 启动开发模式
```bash
source $HOME/.cargo/env
pnpm tauri dev
```

第一次运行会编译 Rust 代码，需要等待几分钟。之后的启动会快很多。

## 项目核心文件说明

### 前端文件

**src/App.vue** - 悬浮球主界面
- 包含悬浮球的 UI 设计
- 实现拖拽、悬停、右键等交互逻辑
- 可自定义样式、颜色、动画效果

### 后端文件

**src-tauri/src/lib.rs** - Rust 后端逻辑
- 提供窗口拖拽 API
- 窗口位置获取和设置
- 窗口初始化配置

**src-tauri/tauri.conf.json** - Tauri 配置
- 窗口属性配置（大小、透明度、置顶等）
- 应用信息配置
- 构建和打包配置

## 自定义悬浮球

### 修改悬浮球大小

编辑 `src-tauri/tauri.conf.json`：
```json
{
  "app": {
    "windows": [
      {
        "width": 100,   // 修改宽度
        "height": 100   // 修改高度
      }
    ]
  }
}
```

同时修改 `src/App.vue` 中的样式：
```css
.floating-ball {
  width: 100px;   /* 与配置保持一致 */
  height: 100px;
}
```

### 修改悬浮球颜色

编辑 `src/App.vue` 的样式部分：
```css
.floating-ball {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  /* 修改为你喜欢的渐变色 */
}
```

### 修改悬浮球图标

在 `src/App.vue` 的 template 部分，替换 SVG 图标：
```vue
<template>
  <div class="ball-content">
    <!-- 替换为你的图标或图片 -->
    <img src="your-icon.png" class="icon" />
  </div>
</template>
```

## 添加新功能示例

### 示例 1：添加单击事件

在 `src/App.vue` 中添加：
```vue
<script setup lang="ts">
const handleClick = () => {
  console.log('悬浮球被点击');
  // 添加你的逻辑
};
</script>

<template>
  <div 
    class="floating-ball"
    @click="handleClick"
  >
    <!-- ... -->
  </div>
</template>
```

### 示例 2：添加快捷键

在 `src-tauri/src/lib.rs` 中：
```rust
use tauri::Manager;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

// 在 setup 函数中
.setup(|app| {
    // 注册快捷键
    app.global_shortcut()
        .on_shortcut("Ctrl+Shift+F", |app, _shortcut| {
            // 快捷键触发的操作
            println!("快捷键被触发");
        })
        .unwrap();
    
    Ok(())
})
```

### 示例 3：添加系统托盘

需要先在 `src-tauri/Cargo.toml` 添加依赖：
```toml
[dependencies]
tauri-plugin-tray = "2"
```

然后在 `lib.rs` 中配置托盘菜单。

## 构建发布版本

### 开发版本（带调试信息）
```bash
pnpm tauri build --debug
```

### 生产版本（优化性能）
```bash
pnpm tauri build
```

构建完成后，可执行文件位于：
- Linux: `src-tauri/target/release/floating-ball`
- Windows: `src-tauri/target/release/floating-ball.exe`
- macOS: `src-tauri/target/release/bundle/macos/floating-ball.app`

## 调试技巧

### 查看控制台输出
在开发模式下，前端的 `console.log` 会显示在终端中。

### 打开开发者工具
在 `src-tauri/tauri.conf.json` 中临时添加：
```json
{
  "app": {
    "windows": [
      {
        "decorations": true  // 临时启用边框以访问右键菜单
      }
    ]
  }
}
```

然后右键窗口选择"检查"打开开发者工具。

### Rust 日志输出
在 `lib.rs` 中使用：
```rust
println!("调试信息: {:?}", some_variable);
```

## 常用命令

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm tauri dev

# 构建应用
pnpm tauri build

# 仅构建前端
pnpm build

# 清理构建缓存
cargo clean
```

## 遇到问题？

1. **依赖安装失败**：尝试删除 `node_modules` 和 `pnpm-lock.yaml`，重新运行 `pnpm install`
2. **Rust 编译错误**：确保 Rust 版本 >= 1.70，运行 `rustup update`
3. **窗口不显示**：检查 `tauri.conf.json` 配置是否正确
4. **透明效果失效**：Linux 需要安装完整的系统依赖

更多问题请查看 [Tauri 官方文档](https://tauri.app/)
