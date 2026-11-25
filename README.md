# 监视与测量设备管理台账（InstrumentLedger）

基于 **Tauri 2.0 + Rust + React + TypeScript + Tailwind CSS + Motion + SQLite** 构建的现代单机桌面仪器台账管理系统，同时支持 **macOS（Apple Silicon & Intel 通用包）** 与 **Windows**。

## 核心特性

- **极简精密桌面界面（浅色 / 深色双主题）**：
  - 采用左侧导航栏 + 高密度精密数据台账架构，支持**浅色精密模式**与**深色暗曜模式**一键切换；
  - 内置 `⌘K / Ctrl+K` 全局命令面板，可毫秒级模糊检索任意设备、快速切换视图或触发常用操作；
  - 自动按 `+检定周期（月） - 1天` 规则推算下次校验日期，侧边栏集成在控设备合规率分段进度条与极简微光状态筛选（正常有效 / 即将到期 / 已超期 / 免校归档，提前提醒天数可自定义），支持按到期日优先排序。
- **零默认账号 · 首次启动动效与初始化向导**：
  - 软件**不预设任何默认账号或初始密码**；
  - 安装后首次打开将播放精密计量仪表自绘启动动画，随后平滑渐进展示本机管理员账号初始化卡片（支持实时密码强度评估）；凭据经 **Argon2id** 加密后仅存储于本地 SQLite 数据库。
- **量具 / 检具双台账与 Excel 全兼容**：
  - 完整兼容公司标准 `JSSK-MPR-170 版本：A` 全部 19 项归档字段；
  - 支持一键导入现有双 Sheet `.xlsx` 台账（追加或全量替换），支持导出完整双台账或当前筛选视图，支持横向 A4 规范打印。
- **位置照片灯箱 & 校验报告附件内嵌直览**：
  - 支持上传、缩略图预览与高清灯箱缩放/旋转查看设备存放位置现场图（编辑记录未重传图片时自动保留原图）；
  - 台账表格直接挂接校验报告附件，支持多份历年报告归档追溯、应用内直接渲染预览 PDF 与图片、一键同步更新设备校验日期、另存为或调用系统默认程序打开。
- **权限隔离、全屏应用锁与 ZIP 一键备份还原**：
  - 日常支持以**只读浏览模式**安全查阅、检索、预览报告、导出和打印；登录本机管理员账号后解锁全部录入、编辑、导入与系统维护权限；
  - 支持快捷键（`⌘L / Ctrl+L`）或无操作定时触发**全屏高斯模糊锁屏**，输入管理员密码即可无缝恢复；
  - 全部台账数据与附件独立保存于系统应用数据目录（`ledger.db` + `images/` + `reports/`），覆盖升级不丢数据，并支持一键打包导出/还原 `.zip` 完整备份。
- **Tauri 官方 `tauri-plugin-updater` 静默检测与一键自更新**：
  - 启动时后台静默检查更新，发现新版本后在侧边栏亮起红点/新版本提示条并从右侧滑入更新通知卡片；
  - 集成 Ed25519 签名校验，点击「立即更新并重启」即可带进度条自动下载、校验签名、替换应用本体并自动重启；默认支持可编辑的国内加速代理前缀并在代理失效时自动回退直连 GitHub。

---

## 本地开发与构建

### 环境准备
1. Node.js 20+（推荐 22）与 `pnpm` 12+
2. Rust 稳定版工具链（`rustup`）
3. Windows 本地构建需安装 Visual Studio C++ 生成工具（Desktop development with C++）
4. macOS 本地构建通用包（Universal Binary）需安装双架构目标：
   ```bash
   rustup target add aarch64-apple-darwin x86_64-apple-darwin
   ```

### 常用命令
```bash
# 安装前端依赖
pnpm install

# 本地开发模式（启动 Tauri 桌面窗口）
pnpm tauri dev

# 前端类型检查与构建 / Excel 解析回环测试 / Rust 后端单元测试
pnpm build
pnpm test:excel
cargo test --manifest-path src-tauri/Cargo.toml

# 本地正式打包
pnpm tauri build                                          # 当前平台默认包
pnpm tauri build --target universal-apple-darwin --bundles dmg  # macOS 通用 .dmg
```

本地打包产物路径：
- **macOS 通用安装包**：`src-tauri/target/universal-apple-darwin/release/bundle/dmg/InstrumentLedger_x.x.x_universal.dmg`
- **Windows 安装包**：`src-tauri/target/release/bundle/nsis/InstrumentLedger_x.x.x_x64-setup.exe`

---

## GitHub Actions 云端自动打包 macOS 与 Windows

项目已内置两套 GitHub Actions 流水线，**无需同时准备 Mac 和 Windows 电脑**，提交代码至 GitHub 即可由云端同时编译打包双平台安装包：

- [`.github/workflows/release.yml`](.github/workflows/release.yml)：同时在 `macos-latest` 与 `windows-latest` 构建 **macOS Universal `.dmg`（同时原生兼容 Apple Silicon M 系列与 Intel Mac）** 与 **Windows 64 位 `.exe` NSIS 安装包**，并支持自动发布至 GitHub Releases 及保存构建产物 Artifacts。
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml)：在推送 `main` 或发起 PR 时，自动在 macOS 与 Windows 上执行前端构建与 Rust 单元测试校验。

### 方式一：推送版本号标签，自动构建并发布 Release（推荐）

1. 将代码推送到 GitHub 仓库（`.gitignore` 已忽略 `.xlsx` 与 `.db` 等本地敏感台账文件）：
   ```bash
   git init
   git add .
   git commit -m "feat: precision desktop UI, onboarding setup & cross-platform build"
   git branch -M main
   git remote add origin https://github.com/MuY-DG/instrument-ledger.git
   git push -u origin main
   ```
2. 每次发布新版本前，同步更新以下 3 处版本号（例如 `1.1.0`）：
   - `package.json` → `"version"`
   - `src-tauri/tauri.conf.json` → `"version"`
   - `src-tauri/Cargo.toml` → `version`
3. 打上 `v` 开头的版本标签并推送：
   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```
4. 前往仓库的 **Actions** 页面等待构建完成（约 6~10 分钟），构建完成后即可在 **Releases** 页面同时下载：
   - `InstrumentLedger_1.1.0_universal.dmg`（macOS Apple Silicon + Intel 通用）
   - `InstrumentLedger_1.1.0_x64-setup.exe`（Windows 64 位安装包）

### 方式二：在 GitHub 网页端手动触发构建（无需打标签）

1. 进入仓库 **Actions** → 左侧选择 **Build and Release Desktop Installers** → 点击右侧 **Run workflow**。
2. 若**留空** `tag_name`，流水线将同时编译 macOS `.dmg` 与 Windows `.exe` 并作为 Artifacts 供下载测试，不会发布公开 Release；若填写如 `v1.1.0`，则会同步创建对应的 GitHub Release。

### macOS 首次安装提示说明

由于个人通过 GitHub Actions 自构建的应用默认未附带 Apple Developer 付费公证签名，macOS 首次启动时若系统提示「已损坏」或「无法验证开发者」，将应用拖入「应用程序」后在终端执行一次以下命令解除隔离属性即可正常打开：

```bash
xattr -cr /Applications/InstrumentLedger.app
```

### 软件内自动更新与密钥配置

软件已接入 Tauri 官方 `tauri-plugin-updater`（基于 Ed25519 公私钥签名校验，防中间人篡改），并默认预填以下更新源配置（管理员可在侧边栏左下角 **设置 → 检查更新** 中随时修改或清空）：

- **GitHub 仓库**：`MuY-DG/instrument-ledger`
- **下载加速代理前缀**：`https://gh-proxy.com/`（同时加速 `latest.json` 与更新包下载；若代理异常会自动回退直连 GitHub，也可手动更换为 `https://ghfast.top/`、`https://gh-proxy.org/` 或留空直连）

更新体验：
- 启动时后台静默检查更新（离线或网络异常不打扰），发现新版本后侧边栏亮起红点与新版本提示条，同时从界面右侧向左平滑滑入更新弹窗；
- 点击 **立即更新并重启** 后，自动下载新版包 → 校验 Ed25519 签名 → 自动替换程序本体并重启（本地 SQLite 台账数据与附件保持不动）。

> **CI 签名密钥说明**：GitHub 仓库需在 `Settings → Secrets and variables → Actions` 配置私钥 `TAURI_SIGNING_PRIVATE_KEY`（对应 `src-tauri/tauri.conf.json` 中的 `plugins.updater.pubkey`），流水线会自动为 `.app.tar.gz` 与 `-setup.exe` 生成 `.sig` 签名文件并汇总输出 `latest.json`。
