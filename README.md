# 知行行情（Android）

参照集思录「数据」的品种分类开发的 Android 应用，使用 React Native + Expo。品牌和界面为独立设计，未使用集思录的账户或私有接口。

## 下载 Android 测试包

- [下载 v1.2.0 APK](https://raw.githubusercontent.com/hhhhhjie/reits-app/android-preview/zhixing-android-v1.2.0.apk)
- [下载 v1.2.0 ZIP（含 APK、安装说明和校验记录）](https://raw.githubusercontent.com/hhhhhjie/reits-app/android-preview/zhixing-android-v1.2.0.zip)
- [下载文件目录](https://github.com/hhhhhjie/reits-app/tree/android-preview)

当前版本 1.2.0（versionCode 3），约 23 MB，支持 Android 7.0 及以上 ARM64 手机。使用手机浏览器下载后，允许该浏览器安装未知应用，再打开 APK 安装；可覆盖安装上一版以保留自选。测试包使用同一开发签名，尚未进行真机验证。首次启动默认直连公开行情源，完整目录首次加载需要一些时间。下载如被聊天软件内置浏览器拦截，请复制链接到系统浏览器打开。

文件与 SHA-256 校验记录位于独立的 `android-preview` 分支，源码保留在 `main` 分支。固定版本文件名可避免浏览器继续使用上一版缓存。

## 已实现

- 「数据」标签：可转债、ETF、LOF、REITs、A/H 比价、新股。
- 沪深 A 股与港股查询，支持名称、代码、拼音搜索，以及目录外证券远端搜索。
- 常用及自选行情前台每 15 秒刷新，全市场数据表每 60 秒刷新；保留报价原始时间、币种、来源，红涨绿跌。
- 沪深可转债完整分页目录，自动排除未上市、已退市及可交换债，超过150只自动分批查询；REITs 完整分页目录并提供完整 `508xxx` / `180xxx` 代码段核验备用源。任何一页失败都不会把部分名单标为完整。
- 全市场名称、代码、正股搜索，沪深市场与价格/双低/自选筛选，先对全部品种排序、再每页显示25只；缺报价的证券仍保留在名单中。
- 「设置筛选」支持多条件组合、上下限与负溢价率、符合数量预览、单项取消和全部重置。可转债与REITs分别自动恢复最近一次应用的条件，每类可保存10套命名方案，同名更新、支持载入和删除。
- 自选增删与本机持久保存，行情排序、涨跌及价格筛选。
- 证券详情、30/60/90 日历史折线和日 K 线。
- 自动同步转股价及正股，计算转股价值、转股溢价和双低；本机修正值优先，清空后恢复数据源参数。
- 转债评级、发行规模、剩余年限、到期日、到期赎回价、强赎/回售触发价、赎回公告及日期；税前到期收益率按未来合同现金流估算，末期利息不重复计入，缺条款或存在赎回公告时不计算。
- REITs 交易额、换手率、振幅、市值，独立披露的单位/累计净值、净值日期及折溢价；现金分红明细按每份换算并核对近12月覆盖，计算历史现金分派率，保留最新分红记录日。
- A/H 两地原币价格对照，明确标注 CNY/HKD，不把未换汇的原币价比称为溢价率。
- 新股日历独立数据适配器及交易所公告入口。源不可达时不编造申购信息。
- 行情服务不可达时可离线演示；演示报价使用固定的 2025-03-14 样本并明确标注，不会伪装为实时价格。

沪深可转债和公募 REITs 为动态完整目录，不硬编码品种数量。2026-10-19 实测分别取得308只和88只，均有真实报价，88只REITs取得披露净值。ETF、LOF、普通股票及A/H配对仍为精选目录，远端搜索可扩展到目录外证券。港股公开报价可能延迟；休市或源端未更新时保留上个报价日期。演示或缓存有独立标记，部分名单不会标为全市场。

## 使用组合筛选

在「数据 → 可转债 / REITs → 设置筛选」填写上下限；留空不限、边界包含，多个条件同时满足。面板中预览当前搜索范围内的符合数量，点击「应用筛选」生效。关闭面板会放弃未应用草稿，「重置筛选」也需再应用才影响列表。

可转债可组合现价、转股溢价率、双低、转股价值/价格、税前到期收益率估算、剩余年限、发行规模、成交额/换手率、正股价格/涨跌、多选评级、赎回公告及已标记ST正股条件。REITs可组合现价、净值溢价、单位净值、历史现金分派率、每份现金分红、涨跌、成交额、换手与市值。成交额输入单位为万元，发行规模/市值为亿元；发行规模不是剩余规模。

筛选与名称搜索叠加，先过滤全部名单，再全局排序和分页。未设条件时保留缺报价证券；设定某指标条件后，缺失该指标的证券不进入结果，明确取得的0仍可参与筛选。REITs分红异步补全时数量会随数据更新；赎回公告筛选不等于强赎15/30日计数，历史分派率不代表未来收益。

「我的筛选方案」保存后可反复载入；载入方案不会立即应用。条件与方案仅存在本机，不改变自选和转股价参数。本机写入失败时保留本次会话的筛选并显示错误，不宣称保存成功。

## 本地开发

需要 Node.js 22.13+（本环境使用 24.19），Android 真机或模拟器。Android 默认直接通过 HTTPS 连接公开行情源，不需要部署后端。

```bash
npm ci
```

启动 Expo，使用与 SDK 54 兼容的 Expo Go，或 Android Studio 模拟器：

```bash
npm start
# 已配置模拟器时
npm run android
```

Android 使用内置的 HTTPS 行情连接，无需额外设置。可选：在「我的 → 行情服务地址」填写自己的后端地址，或在构建前设置公开的 `EXPO_PUBLIC_API_URL`。清空地址并保存恢复默认连接。不要在服务地址中包含账号或密钥。

行情后端及网页仅用于可选的集中缓存和开发验证；需要时另开终端运行 `npm run api`，再运行 `npm run web`。模拟器访问本机后端可在开发环境设置 `http://10.0.2.2:3000`；发布 APK 的自定义服务应使用 HTTPS。

## 构建 APK

本云环境可复用已准备的 Android SDK、Java 17 与经过官方 SHA-256 校验的 React Native / Hermes 依赖：

```bash
npm run build:apk:local
```

输出：`builds/zhixing-android-preview.apk`。这是适用于 Android 7.0 及以上 ARM64 手机的测试签名包，已内置运行资源，无需连接开发电脑。首次构建和重复构建均已验证成功，尚未进行真机安装测试。

已配置 EAS `preview` 为 Android APK，`production` 为应用商店 AAB。首次运行需要在你自己的 Expo 账号下初始化项目，并按提示配置 Android 签名：

```bash
npx eas-cli@25.2.0 login
npm run build:android
```

签名密钥由你或 EAS 安全管理，不放入仓库。正式上架需要独立的发布签名。

本地构建需要 Java 17、Android SDK 36、Build Tools 36.0.0、NDK 27.1.12297006 与 CMake 3.22.1：

```bash
npm run prebuild:android
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --max-workers=3
```

Expo 生成的默认本地 release 配置使用开发签名，只适合测试。上述命令生成 arm64 真机包；兼容更多架构时调整 `reactNativeArchitectures`。`android/` 是可重新生成的构建目录，已忽略。

## 后端部署与联调

```bash
npm ci
npm run build
PORT=3000 npm run serve
```

Node 服务同时提供行情 API 和用于开发验证的网页界面；Android 是应用交付目标。将服务放在 HTTPS 网关后，再把公开地址配置到 Android 应用。无需行情密钥即可使用当前的公开数据适配器。

| 接口                                       | 用途                               |
| ------------------------------------------ | ---------------------------------- |
| `GET /api/health`                          | 服务存活检查，不表示上游行情正常   |
| `GET /api/quotes?symbols=sh600519,hk00700` | 报价、数据模式、原始时间和缺失代码 |
| `GET /api/history/sh600519`                | 历史日线与数据模式                 |
| `GET /api/search?q=txkg`                   | 本地目录和远端证券搜索             |
| `GET /api/ipo`                             | 新股发行日历及可用状态             |
| `GET /api/universe/bond` | 沪深上市可转债完整目录、条款及批量报价 |
| `GET /api/universe/reit` | 沪深公募 REITs 完整目录、报价及披露净值 |
| `GET /api/reit/:symbol` | 披露净值及近12月现金分红明细统计 |

服务端 `MARKET_DATA_MODE=demo` 可强制演示。客户端只注入 `EXPO_PUBLIC_*` 变量，不注入服务端配置。生产环境可设置 `ALLOWED_ORIGIN` 限定网页跨域来源。报价请求限制为每 IP 每分钟 180 次。

所需出站域名：`qt.gtimg.cn`、`web.ifzq.gtimg.cn`、`smartbox.gtimg.cn`、`datacenter-web.eastmoney.com`、`fund.eastmoney.com`；REITs 首选目录另使用 `95.push2.eastmoney.com`，不可达时自动改用腾讯完整代码段核验。服务使用环境现有的 HTTP(S) 代理与 CA 信任，不关闭 TLS 验证。

## 检查

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run build:native
# 独立的真实数据检查；必须能连接行情源，不接受演示数据代替通过
npm run test:live
# 使用 Android 同一套 fetch 和 GB18030 解码适配器验证真实数据
npm run test:android-data
npm run test:universe -- --all-funds
```

浏览器测试覆盖手机尺寸交互和网页联调，不等同于 Android 真机测试。没有系统 Chromium 时先运行 `npx playwright install chromium`。

## 尚未覆盖

- ETF/LOF 的净值及IOPV、预期REITs分派率与资产评估价值；当前 REITs 折溢价以已披露账面净值为基准，历史现金分派率只使用已核对的分红记录。
- 可转债剩余规模、强赎15/30日触发计数及“不强赎承诺期”；目前展示源端现行转股价、触发价和赎回公告日期。合同现金流YTM为税前估算，不含提前赎回、违约、税费或交易成本。
- 汇率换算后的 A/H 溢价、北交所报价、账户云同步、交易下单与推送提醒。
- 新股日历依赖东方财富数据源可达性；官方公告链接始终保留。

缺失指标在界面中显示“—”，不从价格推测或填入随机值。净值可能滞后，详情中保留净值与分红记录的独立日期。
