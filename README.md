# 知行行情 Android v1.4.0

[下载 v1.4.0 APK](https://raw.githubusercontent.com/hhhhhjie/reits-app/android-preview/zhixing-android-v1.4.0.apk) · [备用 ZIP](https://raw.githubusercontent.com/hhhhhjie/reits-app/android-preview/zhixing-android-v1.4.0.zip) · [源码与说明](https://github.com/hhhhhjie/reits-app/tree/main) · [手机界面预览](https://github.com/hhhhhjie/reits-app/tree/main/docs/previews)

约23 MB，Android 7.0及以上ARM64手机。同一开发签名、versionCode 5，可覆盖上一版保留自选、转股价和筛选方案。请用手机系统浏览器下载APK并按系统提示安装；聊天软件内置浏览器如拦截，可复制链接到系统浏览器。

新增“数据 → 可转债 → 理论估值”：纯债价值、期权价值、理论价值和理论偏离度，支持全市场排序、四指标组合区间与负偏离筛选、命名方案、详情参数和日期说明。纯债价值取独立日终源；理论价值＝纯债＋期权，偏离度＝(现价÷理论价值−1)×100%，正值表示现价高于模型。

期权采用到期欧式BS估算：转股价值为标的，含末期利息的到期赎回金额为行权金额；真实60日日涨跌幅对数收益波动率、中国国债2/5/10/30年曲线与来源股息率代理。未模拟提前转股、强赎、回售、下修和期权信用风险，不等同集思录模型。参数按需补全、显示进度并可重试；公告赎回或数据不足不算，缺失显示“—”。

2026-10-23同一套Android适配器核验311只转债：308条2026-10-22纯债估值、203套真实正股参数、205条期权和204条理论价值。数量随市场与数据源变化。全部205条期权用独立Python公式复核，最大误差小于0.000014元/百元面值。

原有沪深REITs、港股REITs、A股/港股股息率、行情、自选与筛选功能保留。港股REITs为维护名单，港股公司目录为源覆盖；五年平均股息率、估值温度及港股REITs披露净值尚无已核验数据，显示缺失。

59项接口/计算测试、40项手机/桌面交互测试及APK构建、签名、版本、CRC、内置Hermes与16KB打包对齐校验通过。尚未真机安装验证，开发签名供初步试用。

SHA256SUMS可核对下载文件；ZIP内含同一个APK、安装说明与验证记录。保留旧版固定文件名用于核对，当前试用请下载v1.4.0。
