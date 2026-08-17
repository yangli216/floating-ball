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

## 边界

- 测试构建允许来自待验收分支；正式发布只能来自 `main`。
- 测试构建不进入 `production` 或 `testing` updater 通道；“测试更新源”仍属于后台管理的已发布更新通道，不等于 Actions 测试产物。
- 候选版本必须高于仓库当前三处一致的版本，且使用稳定 `X.Y.Z` 格式。
- 正式发布不得换用未经该轮验收的新版本号，也不得复用已有 tag、draft 或历史更新清单。
