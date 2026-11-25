# 监视与测量设备管理台账（InstrumentLedger）

基于 **Tauri 2.0 + Rust + React + TypeScript + Tailwind CSS + Motion + SQLite** 构建的现代单机桌面仪器台账管理系统，同时支持 **macOS（Apple Silicon & Intel 通用包）** 与 **Windows**。

## 下载与安装

前往 [GitHub Releases](https://github.com/MuY-DG/instrument-ledger/releases/latest) 下载对应平台的最新安装包：

- **macOS（Apple Silicon M 系列 & Intel 通用）**：下载 `*_universal.dmg`，双击挂载后将应用拖入「应用程序」文件夹。
  > 由于个人通过 GitHub Actions 自构建的应用默认未附带 Apple Developer 付费公证签名，首次打开若系统提示「无法验证开发者」或「已损坏」，可在终端执行一次以下命令解除隔离属性后正常启动：
  > ```bash
  > xattr -cr /Applications/InstrumentLedger.app
  > ```
- **Windows（64 位）**：下载 `*_x64-setup.exe` 安装包直接双击安装。

> 覆盖升级不会清除本地 SQLite 台账数据库（`ledger.db`）、位置照片（`images/`）与校验报告附件（`reports/`）。

### 首次启动

软件**无默认账号或初始密码**。安装后首次打开将播放光学启动动画并引导初始化本机管理员账号（支持实时密码强度评估）；管理员凭据经 **Argon2id** 加密后仅存储于本地 SQLite 数据库。

### 无感自动更新

- 已接入 Tauri 官方 `tauri-plugin-updater` 与 **Ed25519** 签名校验：启动时后台静默检测新版本（离线或网络异常不打扰），发现更新后侧边栏亮起红点并从右侧滑入更新弹窗；
- 点击「立即更新」即可带进度条自动下载、验签、替换应用本体并自动重启（保留全部本地台账数据与附件）；
- 默认内置更新源 `MuY-DG/instrument-ledger` 及多节点国内加速代理兜底池（`gh-proxy.com` / `ghfast.top` / `gh-proxy.org` / `cdn.gh-proxy.org` / `edgeone.gh-proxy.org` / GitHub 直连），在「设置 → 检查更新」输入框中以浅灰占位提示展示默认内置值；版本检测支持并发择优，下载阶段支持首包/停滞超时自动切换节点，管理员可随时自定义或留空使用内置策略。

---

## 核心特性

- **极简精密桌面界面（浅色 / 深色双主题）**：
  - 采用可折叠左侧导航栏（`⌘B / Ctrl+B`）+ 高密度虚拟滚动数据台账架构，支持表格分页与媒体 LRU 缓存，以及**浅色触感模式**与**深色暗曜模式**一键切换；
  - 内置 `⌘K / Ctrl+K` 全局命令面板，可毫秒级模糊检索任意设备、快速切换视图或触发常用操作；
  - 自动按 `+检定周期（月） - 1天` 规则推算下次校验日期，侧边栏集成可展开的在控设备合规率仪表卡片，支持多级到期阈值筛选、自定义阈值配色与到期预警弹窗。
- **量具 / 检具双台账与 Excel 全兼容**：
  - 完整兼容公司标准 `JSSK-MPR-170 版本：A` 全部 19 项归档字段；
  - 支持一键导入现有双 Sheet `.xlsx` 台账（追加或全量替换），支持导出完整双台账或当前筛选视图，支持横向 A4 规范打印。
- **位置照片灯箱 & 校验报告附件内嵌直览**：
  - 支持上传、缩略图预览、高清灯箱缩放/旋转与光学放大镜（按 `M` 键开关）查看设备存放位置现场图（编辑记录未重传图片时自动保留原图）；
  - 台账表格直接挂接校验报告附件，支持多份历年报告归档追溯、应用内直接渲染预览 PDF 与图片、一键同步更新设备校验日期、另存为或调用系统默认程序打开。
- **权限隔离、托盘驻留、PIN 应用锁与备份重置**：
  - 日常支持以**只读浏览模式**安全查阅、检索、预览报告、导出和打印；登录本机管理员账号（支持最长 7 天持久化会话及 12 套磨砂渐变账号封面）后解锁全部录入、编辑、导入与系统维护权限；
  - 支持系统托盘驻留与窗口关闭行为配置，以及独立 PIN 码全屏应用锁（`⌘L / Ctrl+L` 或定时触发，带平滑弹簧融合解锁动效）；
  - 全部台账数据与附件独立保存于系统应用数据目录，支持一键导出/还原 `.zip` 完整备份，以及执行前强制自动备份至本地下载目录的恢复出厂设置功能。

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

# 前端类型检查与构建 / 单元测试 / Rust 后端单元测试
pnpm build
pnpm test:excel
pnpm test:markdown
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

1. 每次发布新版本前，同步更新以下版本号（例如 `1.3.0`）：
   - `package.json` → `"version"`
   - `src-tauri/tauri.conf.json` → `"version"`
   - `src-tauri/Cargo.toml` → `version`
2. 创建带分类更新说明的附注标签（按 `### 新功能` / `### 改进` / `### 修复` 编写）并推送，Release 页面与软件内更新弹窗将直接展示该更新日志（若使用轻量标签，流水线会自动按提交记录分类生成）：
   ```bash
   git tag -a --cleanup=verbatim v1.3.0 -m $'### 新功能\n\n- ...\n\n### 改进\n\n- ...\n\n### 修复\n\n- ...'
   git push origin v1.3.0
   ```
3. 前往仓库的 **Actions** 页面等待构建完成（约 8~14 分钟），构建完成后即可在 **Releases** 页面同时下载：
   - `InstrumentLedger_1.3.0_universal.dmg`（macOS Apple Silicon + Intel 通用）
   - `InstrumentLedger_1.3.0_x64-setup.exe`（Windows 64 位安装包）

### 方式二：在 GitHub 网页端手动触发构建（无需打标签）

1. 进入仓库 **Actions** → 左侧选择 **Build and Release Desktop Installers** → 点击右侧 **Run workflow**。
2. 若**留空** `tag_name`，流水线将同时编译 macOS `.dmg` 与 Windows `.exe` 并作为 Artifacts 供下载测试，不会发布公开 Release；若填写如 `v1.3.0`，则会同步创建对应的 GitHub Release。

> **CI 签名密钥说明**：GitHub 仓库需在 `Settings → Secrets and variables → Actions` 配置私钥 `TAURI_SIGNING_PRIVATE_KEY`（对应 `src-tauri/tauri.conf.json` 中的 `plugins.updater.pubkey`），流水线会自动为 `.app.tar.gz` 与 `-setup.exe` 生成 `.sig` 签名文件并汇总输出 `latest.json`。
