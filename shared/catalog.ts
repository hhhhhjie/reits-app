import type { Instrument } from './types';

const item = (
  symbol: string,
  name: string,
  type: Instrument['type'],
  keywords = '',
  underlying?: string,
): Instrument => ({
  symbol,
  name,
  code: symbol.slice(2),
  type,
  keywords,
  underlying,
  market: symbol.startsWith('sh') ? 'SH' : symbol.startsWith('sz') ? 'SZ' : 'HK',
});

export const CATALOG: Instrument[] = [
  item('sh000001', '上证指数', 'index', 'shangzheng szzs'),
  item('sz399001', '深证成指', 'index', 'shenzheng szcz'),
  item('sz399006', '创业板指', 'index', 'chuangyeban cybz'),
  item('hkHSI', '恒生指数', 'index', 'hengsheng hszs'),
  item('hkHSTECH', '恒生科技', 'index', 'hengshengkeji hskj'),
  item('sh000300', '沪深300', 'index', 'hushen hs300'),
  item('sh600519', '贵州茅台', 'stock', 'guizhoumaotai gzmt'),
  item('sz300750', '宁德时代', 'stock', 'ningdeshidai ndsd'),
  item('sh601318', '中国平安', 'stock', 'zhongguopingan zgpa'),
  item('sh600036', '招商银行', 'stock', 'zhaoshangyinhang zsyh'),
  item('sz000333', '美的集团', 'stock', 'meidi meidi jituan mdjt'),
  item('sz002594', '比亚迪', 'stock', 'biyadi byd'),
  item('sh601899', '紫金矿业', 'stock', 'zijinkuangye zjky'),
  item('sh601398', '工商银行', 'stock', 'gongshangyinhang gsyh'),
  item('sz000001', '平安银行', 'stock', 'pinganyinhang payh'),
  item('sh601166', '兴业银行', 'stock', 'xingyeyinhang xyyh'),
  item('sh601009', '南京银行', 'stock', 'nanjingyinhang njyh'),
  item('sz002714', '牧原股份', 'stock', 'muyuangufen mygf'),
  item('sz300498', '温氏股份', 'stock', 'wenshigufen wsgf'),
  item('sh600438', '通威股份', 'stock', 'tongweigufen twgf'),
  item('sh601012', '隆基绿能', 'stock', 'longjilvneng ljln'),
  item('hk00700', '腾讯控股', 'stock', 'tengxun tencent txkg'),
  item('hk09988', '阿里巴巴-W', 'stock', 'alibaba albb'),
  item('hk03690', '美团-W', 'stock', 'meituan mt'),
  item('hk01810', '小米集团-W', 'stock', 'xiaomi xmjt'),
  item('hk00941', '中国移动', 'stock', 'zhongguoyidong zgyd'),
  item('hk00939', '建设银行', 'stock', 'jiansheyinhang jsyh'),
  item('hk01211', '比亚迪股份', 'stock', 'biyadi byd'),
  item('hk02318', '中国平安', 'stock', 'zhongguopingan zgpa'),
  item('hk03968', '招商银行', 'stock', 'zhaoshangyinhang zsyh'),
  item('hk02899', '紫金矿业', 'stock', 'zijinkuangye zjky'),
  item('sh510300', '沪深300ETF', 'etf', 'hushen hs300'),
  item('sh510500', '中证500ETF', 'etf', 'zhongzheng zz500'),
  item('sh588000', '科创50ETF', 'etf', 'kechuang kc50'),
  item('sz159915', '创业板ETF', 'etf', 'chuangyeban cyb'),
  item('sh518880', '黄金ETF', 'etf', 'huangjin gold hj'),
  item('sh513100', '纳指ETF', 'etf', 'nazhi nasdaq nz'),
  item('sh513180', '恒生科技指数ETF', 'etf', 'hengshengkeji hskj'),
  item('sz161725', '招商中证白酒LOF', 'lof', 'baijiu bj'),
  item('sz161226', '国投瑞银白银期货LOF', 'lof', 'baiyin by'),
  item('sz163407', '兴全沪深300LOF', 'lof', 'xingquan xq'),
  item('sh508056', '中金普洛斯REIT', 'reit', 'zhongjinpuluosi zjpls'),
  item('sh508000', '华安张江REIT', 'reit', 'huanzhangjiang hazj'),
  item('sh508099', '建信中关村REIT', 'reit', 'jianxinzhongguancun jxzgc'),
  item('sz180101', '博时蛇口产园REIT', 'reit', 'boshishekou bssk'),
  item('sz180201', '平安广州广河REIT', 'reit', 'pinganguangzhou pagz'),
  item('sh113052', '兴业转债', 'bond', 'xingye xyzz', 'sh601166'),
  item('sh113050', '南银转债', 'bond', 'nanyin nyzz', 'sh601009'),
  item('sz127045', '牧原转债', 'bond', 'muyuan myzz', 'sz002714'),
  item('sz123107', '温氏转债', 'bond', 'wenshi wszz', 'sz300498'),
  item('sh110085', '通22转债', 'bond', 'tongwei tw', 'sh600438'),
  item('sh113053', '隆22转债', 'bond', 'longji lj', 'sh601012'),
];

export const INDICES = CATALOG.filter((x) => x.type === 'index');
export const DEFAULT_WATCHLIST = ['hk00700', 'sh600519', 'sz300750', 'sh510300', 'sh508056'];
export const AH_PAIRS = [
  { a: 'sz002594', h: 'hk01211', name: '比亚迪' },
  { a: 'sh601318', h: 'hk02318', name: '中国平安' },
  { a: 'sh600036', h: 'hk03968', name: '招商银行' },
  { a: 'sh601899', h: 'hk02899', name: '紫金矿业' },
];
export const MODULES: { key: import('./types').DataModule; label: string; description: string }[] =
  [
    { key: 'bond', label: '可转债', description: '转债行情与价格筛选' },
    { key: 'etf', label: 'ETF', description: '场内指数基金行情' },
    { key: 'lof', label: 'LOF', description: '上市开放式基金行情' },
    { key: 'reit', label: 'REITs', description: '公募基础设施基金行情' },
    { key: 'ah', label: 'A/H比价', description: '同一公司两地价格对照' },
    { key: 'ipo', label: '新股', description: '发行、申购与上市日历' },
  ];

export function validSymbol(symbol: string): boolean {
  return /^(?:sh\d{6}|sz\d{6}|hk\d{5}|hkHSI|hkHSTECH)$/.test(symbol);
}

export function inferType(symbol: string): Instrument['type'] {
  if (/^(sh11|sz12)/.test(symbol)) return 'bond';
  if (/^(sh508|sz180)/.test(symbol)) return 'reit';
  if (/^(sh5[168]|sz15)/.test(symbol)) return 'etf';
  if (/^sz16/.test(symbol)) return 'lof';
  return 'stock';
}

export function findInstrument(symbol: string, name?: string): Instrument {
  return (
    CATALOG.find((x) => x.symbol === symbol) ??
    item(symbol, name || symbol.slice(2), inferType(symbol))
  );
}

export function searchCatalog(query: string): Instrument[] {
  const value = query.toLowerCase().trim();
  if (!value) return [];
  return CATALOG.filter((x) =>
    `${x.name} ${x.code} ${x.symbol} ${x.keywords || ''}`.toLowerCase().includes(value),
  ).slice(0, 30);
}
