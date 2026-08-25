# PCIE 测试构建与正式发布流程

## 目标

将“生成可安装测试包”和“提升正式版本、打 tag、发布更新”彻底分开。候选包用于功能验收，不占用正式版本记录和更新通道；只有验收通过的候选版本才能进入正式发布。

## 测试构建

当前正式版本为 `X.Y.Z` 时，默认补丁候选可直接执行：

```bash
yarn release:test
```

也可以明确指定准备验收的稳定版本：

```bash
yarn release:test 1.4.4
```

该命令会临时把 `package.json`、`src-tauri/tauri.conf.json` 和 `src-tauri/Cargo.toml` 设为候选版本，执行当前平台的 Tauri 构建，并在成功或失败后恢复全部原文件。它不会提交文件、创建 tag、GitHub Release、draft 或 `latest.json`。本机未配置 updater 私钥时，只生成可直接安装的测试包并临时关闭 updater artifact；GitHub `Test Build` 使用发布环境中的私钥生成带签名的候选包。

需要 Windows 与 macOS 双平台测试包时，在 GitHub Actions 手动运行 `Test Build`：

1. 在运行工作流时选择需要验收的分支或 commit。
2. 输入候选稳定版本号，例如 `1.4.4`。
3. 工作流先执行类型检查、单元测试、前端构建和 Rust 检查，再分别生成签名的 Windows 与 macOS 测试包；上传前会检查目标目录中确实存在安装包，只有来源清单时必须失败。
4. 从该次工作流的 Artifacts 下载测试包；这些文件不会出现在 GitHub Releases，也不会被客户端自动更新发现。

测试包采用候选正式版本号，因此安装过候选包的测试机器不会把后续同版本正式包识别成更高版本。正式 updater 冒烟应另用仍停留在历史正式版本的环境执行。

## 正式发布

功能验收通过、改动已合入 `main` 且工作区干净后，使用与测试包相同的版本：

```bash
yarn release 1.4.4
```

正式命令会核对当前分支、工作区、三处基线版本和 tag 唯一性，然后固化版本号、执行 release preflight、创建 release commit 与本地 tag。确认无误后推送：

```bash
git push origin main
git push origin v1.4.4
```

tag 推送后才会触发正式 Release 工作流。该工作流继续以 draft 汇聚各平台产物，验证同批安装包、签名和 `latest.json` 后再发布为 latest。

## Windows 7 技术验证构建

Windows 7 不属于正式桌面客户端支持范围。为验证仍在使用 Windows 7 SP1 x64 的院内环境是否具备临时迁移条件，仓库提供独立的 `Win7 Legacy Test Build` 手动工作流和 `src-tauri/tauri.win7.conf.json` 构建 flavor：

1. 该工作流只允许手动触发，只生成 GitHub Actions Artifact，不创建 tag、Release、draft、`.sig` 或 `latest.json`，也不上传正式或测试更新源。
2. 构建使用固定 nightly 工具链、`x86_64-win7-windows-msvc` Tier 3 目标和 `build-std`，不得复用正式构建的 `stable-x86_64-pc-windows-msvc` 产物。该 Tier 3 target 不在 `rustup target list` 的可下载组件中，工作流只在调用 Tauri CLI 时临时隐藏 `rustup.exe` 以跳过其 target 预检，并在 `finally` 中恢复；Cargo 和 rustc 仍必须使用固定 nightly 与 `rust-src`。当前 `tauri-utils 2.9.3` 的旧 `ctor 0.8` 不识别 `target_vendor = win7`，Win7 专用 Cargo runner 仅在该 flavor 内将 `tauri-utils` 固定到上游修复提交 `8a97d387a3a1a52f7c501762517e294d8c94e119`；普通和正式构建继续使用原 Cargo.lock。
3. 验证包设置 `webviewInstallMode = skip`，CI 不下载、不安装也不内嵌 WebView2。验证人员必须在 Windows 7 SP1 x64 实机上另行安装 WebView2 109，并在冒烟记录中写明实际版本。
4. Win7 flavor 使用独立 `identifier`、WiX `UpgradeCode` 和 Tauri 默认 WiX 模板，不继承正式模板中的历史安装线迁移规则；同时关闭 updater artifact 与运行时 updater，禁止覆盖正式 `PCIE` 安装身份。由于仍需保留历史 `med-hermes` HIS 深链，验证包不得与正式客户端安装在同一台机器。
5. 候选包必须记录版本、源 commit/ref、Rust 工具链、Rust target 和要求的外置 WebView2 版本。Artifact 名称必须包含 `win7-legacy`，不得描述为已发布版本。
6. WebView2 在 Windows 7 上不支持透明默认背景，Win7 flavor 必须通过 `win7-legacy` Cargo feature 启用原生窗口 region 裁剪：待机仅保留中心球，菜单展开时保留中心球与四个菜单圆，进入工作态或任何几何变更前先恢复完整矩形 region。实机必须回归启动白底、菜单展开/收起、四个按钮点击、拖拽、球态↔工作态及混合 DPI。
7. Actions 构建成功只证明安装包可生成；完成技术验证还必须在真实 Windows 7 SP1 x64 环境执行安装、进程启动、首屏渲染、本地 Bridge 健康检查、SDK handshake 和卸载手测。WebView2 109 不支持 `color-mix()` 等较新 Web 能力，关键页面还需检查样式 fallback。

Win7 验证包不能直接转为正式发布。若验证通过且业务决定长期维护，必须另行确定独立仓库或独立更新通道、安全责任、版本策略和退出期限，再更新 `ARCHITECTURE.md / PRODUCT.md / AGENTS.md`。

## 边界

- 测试构建允许来自待验收分支；正式发布只能来自 `main`。
- 测试构建不进入 `production` 或 `testing` updater 通道；“测试更新源”仍属于后台管理的已发布更新通道，不等于 Actions 测试产物。
- 候选版本必须高于仓库当前三处一致的版本，且使用稳定 `X.Y.Z` 格式。
- 正式发布不得换用未经该轮验收的新版本号，也不得复用已有 tag、draft 或历史更新清单。
- Win7 legacy Artifact 只用于技术验证，不视为功能候选正式版本，不得进入当前 `main` updater 兼容链。
