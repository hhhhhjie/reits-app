# 验证记录

验证日期：2026-10-19。当前实现为 Android 应用，网页构建用于开发联调及手机尺寸交互验证。

| 检查 | 结果 |
| --- | --- |
| Node.js | 24.19.0 |
| 冻结锁文件安装 `npm ci` | 通过 |
| TypeScript `npm run typecheck` | 通过 |
| 接口、估值、目录分页、现金分红与字符解码测试 `npm test` | 32 项通过 |
| 浏览器交互 `npm run test:e2e` | 16 项通过，覆盖手机与桌面联调尺寸 |
| 网页资源 `npm run build` | 通过 |
| Android Hermes 资源 `npm run build:native` | 通过 |
| 后端真实行情 `npm run test:live` | 通过 |
| Android 直连同一套 fetch / GB18030 适配器 `npm run test:android-data` | 通过 |
| Android 同一套适配器全市场与逐只基金指标 `npm run test:universe -- --all-funds` | 通过；308只转债、88只REITs，88只披露净值和近12月现金分红 |
| Android 原生 APK | 通过；原生 APK 已生成并校验 |
| Android 真机或模拟器安装运行 | 未执行，本环境没有已连接设备 |

真实行情检查覆盖了贵州茅台、腾讯控股、兴业转债、沪深300ETF、中金普洛斯REIT；取得原始报价时间与 CNY/HKD 币种。A股与港股日线、目录外证券「中国中免」搜索及30条新股日历也返回了真实数据。原始报价时间可能是上一个交易日，保留源时间而不伪造“实时”时间。

手机界面预览位于项目内的 `docs/previews/android-layout.png`、`docs/previews/reits-layout.png` 和 `docs/previews/detail-layout.png`。这些是共用 React Native 界面的浏览器布局截图，不能作为 Android 真机测试证据。

## 可安装测试包

- 文件：`builds/zhixing-android-preview.apk`
- 应用名称：知行行情
- 包名：`com.zhixing.markets`
- 版本：`1.1.0`，versionCode `2`
- 大小：23,988,304 字节，约 22.88 MiB
- 最低系统：Android 7.0（API 24）
- CPU 架构：ARM64 / `arm64-v8a`
- SHA-256：`b10f92b70d9c44522a1ccc8ea87bef10385ac929d3ca4c1654e645496def66d8`

本版原生构建成功，一键命令 `npm run build:apk:local` 已验证；后续手机布局调整也已重新构建并通过签名及文件检查。

APK Signature Scheme v2 签名验证、ZIP CRC、16 KB 打包页面对齐检查通过；内置 `assets/index.android.bundle` Hermes 运行资源，无需连接开发电脑。包内包含网络访问与应用内部签名级接收器权限，未包含相机、麦克风、外部存储、悬浮窗或振动权限。

该包使用开发签名，供初步试用；本环境未连接真机，尚未执行设备安装测试。完整验证详情随下载包提供为 `zhixing-android-preview.verification.json`。Android 默认 HTTPS 直连公开行情，源不可达时明确标注演示或缓存。正式发布需要独立发布签名。

本版与 v1.0.0 的签名证书 SHA-256 一致，versionCode 从1增加到2，可用于覆盖升级；实际设备覆盖安装仍需用户真机确认。

## 全市场与指标核验

2026-10-19 从东方财富可转债有效目录完整读取两页、共319条，经上市日期及类型过滤得到308只沪深上市可转债，308只均有腾讯真实报价、现行转股价、转股溢价、双低值和评级。其中178只具有完整合同现金流且没有源端赎回公告，可计算税前到期收益率估算；299只有明确含末期利息的到期赎回金额。其余留空，不把强赎价替代到期价。

REITs 首选目录在本环境不可达，已自动完成 `sh508000…sh508999`、`sz180000…sz180999` 全部2000个代码的报价核验，取得88只沪深公募REITs、88条真实交易报价，以及88只腾讯基金独立披露单位净值和净值日期。备用代码段与当前沪深公募REITs编码规则对应，未来交易所增加代码段时须更新规则；首选目录仍支持完整分页。

88只REITs逐只核对天天基金公开现金分红表，88只均取得覆盖近12个月的现金分红记录统计。明确按“每10份”换算为“每份”，按北京记录日统计，不将该日期称为到账日。样本华安张江产业园REIT：净值2.5576（2026-06-30），近12月每份现金分红0.10638，最近记录2026-09-17。

发现天天基金部分REITs净值历史脚本仍停留在2022年，因此本版使用腾讯带披露日期的基金净值，并独立从分红表取得现金记录，避免旧净值覆盖新披露。净值溢价以披露账面净值为基准，非IOPV；历史现金分派率不代表未来收益预测。

新增回归覆盖超过150只转债和超过100只REITs的完整分页、报价分批、目录计数漂移、失败保留原始时间、部分名单不能标完整、无报价证券保留、全局排序后分页、跨页搜索、本机转股价覆盖、YTM末期利息不重复、北京记录日及现金分红单位换算。仍未接入剩余转债规模或强赎15/30日触发计数。

## 已解决的构建问题

Java 17、Android SDK 36、Build Tools 36.0.0、NDK 27.1.12297006、CMake 3.22.1 与 Gradle 8.14.3 已准备。

此前 React Native / Hermes 0.81.5 AAR 在重定向后的仓库下载时被拒绝。现已通过常规下载请求从官方地址取得两个 AAR 及 POM / Gradle 模块元数据，逐项核对 Maven Central 发布的 SHA-256 值。构建通过仅限这两个模块的本地 Maven 仓库复用已验证的原始文件，版本、元数据及校验值保持完整，TLS 验证保持开启。

云环境下载与校验脚本：`/workspace/android-tools/prepare-react-artifacts.py`；已验证仓库：`/workspace/android-tools/verified-maven/`；Gradle 初始化脚本：`/workspace/android-tools/verified-react.init.gradle`。`npm run build:apk:local` 会自动复用已准备的工具与该仓库。
