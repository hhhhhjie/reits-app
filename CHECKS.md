# 验证记录

验证日期：2026-10-19。当前实现为 Android 应用，网页构建用于开发联调及手机尺寸交互验证。

| 检查 | 结果 |
| --- | --- |
| Node.js | 24.19.0 |
| 冻结锁文件安装 `npm ci` | 通过 |
| TypeScript `npm run typecheck` | 通过 |
| 接口、估值、缓存降级与字符解码测试 `npm test` | 20 项通过 |
| 浏览器交互 `npm run test:e2e` | 12 项通过，覆盖手机与桌面联调尺寸 |
| 网页资源 `npm run build` | 通过 |
| Android Hermes 资源 `npm run build:native` | 通过 |
| 后端真实行情 `npm run test:live` | 通过 |
| Android 直连同一套 fetch / GB18030 适配器 `npm run test:android-data` | 通过 |
| Android 原生 APK | 通过；原生 APK 已生成并校验 |
| Android 真机或模拟器安装运行 | 未执行，本环境没有已连接设备 |

真实行情检查覆盖了贵州茅台、腾讯控股、兴业转债、沪深300ETF、中金普洛斯REIT；取得原始报价时间与 CNY/HKD 币种。A股与港股日线、目录外证券「中国中免」搜索及30条新股日历也返回了真实数据。原始报价时间可能是上一个交易日，保留源时间而不伪造“实时”时间。

手机界面预览位于项目内的 `docs/previews/android-layout.png` 和 `docs/previews/detail-layout.png`。这些是共用 React Native 界面的浏览器布局截图，不能作为 Android 真机测试证据。

## 可安装测试包

- 文件：`builds/zhixing-android-preview.apk`
- 应用名称：知行行情
- 包名：`com.zhixing.markets`
- 版本：`1.0.0`
- 大小：23,946,988 字节，约 22.84 MiB
- 最低系统：Android 7.0（API 24）
- CPU 架构：ARM64 / `arm64-v8a`
- SHA-256：`5a0b2fa3f600603fbcf4ec4097ca9b8f9ae3f044212ae2eafed0c6f53a036a81`

原生构建成功，335 个任务，首次构建用时3分21秒。一键命令 `npm run build:apk:local` 已验证，复用缓存后20秒完成。

APK Signature Scheme v2 签名验证、ZIP CRC、16 KB 打包页面对齐检查通过；内置 `assets/index.android.bundle` Hermes 运行资源，无需连接开发电脑。包内包含网络访问与应用内部签名级接收器权限，未包含相机、麦克风、外部存储、悬浮窗或振动权限。

该包使用开发签名，供初步试用；本环境未连接真机，尚未执行设备安装测试。完整验证详情随下载包提供为 `zhixing-android-preview.verification.json`。Android 默认 HTTPS 直连公开行情，源不可达时明确标注演示或缓存。正式发布需要独立发布签名。

## 已解决的构建问题

Java 17、Android SDK 36、Build Tools 36.0.0、NDK 27.1.12297006、CMake 3.22.1 与 Gradle 8.14.3 已准备。

此前 React Native / Hermes 0.81.5 AAR 在重定向后的仓库下载时被拒绝。现已通过常规下载请求从官方地址取得两个 AAR 及 POM / Gradle 模块元数据，逐项核对 Maven Central 发布的 SHA-256 值。构建通过仅限这两个模块的本地 Maven 仓库复用已验证的原始文件，版本、元数据及校验值保持完整，TLS 验证保持开启。

云环境下载与校验脚本：`/workspace/android-tools/prepare-react-artifacts.py`；已验证仓库：`/workspace/android-tools/verified-maven/`；Gradle 初始化脚本：`/workspace/android-tools/verified-react.init.gradle`。`npm run build:apk:local` 会自动复用已准备的工具与该仓库。
