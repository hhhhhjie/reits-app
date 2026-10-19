import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowLeftRight,
  Banknote,
  Building2,
  CalendarDays,
  ChevronRight,
  Coins,
  ExternalLink,
  Layers,
  ListFilter,
  SlidersHorizontal,
  Star,
} from 'lucide-react-native';
import { AH_PAIRS, CATALOG, MODULES } from '../shared/catalog';
import type { DataModule, Quote, UniverseKind, UniverseResponse } from '../shared/types';
import { bondValuation } from '../shared/valuation';
import { C, compact, percent, price } from './theme';
import { Button, EmptyState, Notice, Panel } from './components';
import IPOPanel from './IPOPanel';
import UniverseTable from './UniverseTable';
import type { FilterPreferenceState } from './useFilterPreferences';

const MODULE_ICONS = {
  bond: Coins,
  etf: Layers,
  lof: Banknote,
  reit: Building2,
  ah: ArrowLeftRight,
  ipo: CalendarDays,
};
type SortKey =
  | 'price'
  | 'changePercent'
  | 'turnover'
  | 'turnoverRate'
  | 'premium'
  | 'doubleLow'
  | 'distribution';
const COLUMNS: Record<string, { key: SortKey; label: string }[]> = {
  bond: [
    { key: 'price', label: '现价' },
    { key: 'changePercent', label: '涨跌幅' },
    { key: 'premium', label: '转股溢价' },
    { key: 'doubleLow', label: '双低值' },
    { key: 'turnover', label: '成交额' },
  ],
  etf: [
    { key: 'price', label: '现价' },
    { key: 'changePercent', label: '涨跌幅' },
    { key: 'turnover', label: '成交额' },
    { key: 'turnoverRate', label: '换手率' },
  ],
  lof: [
    { key: 'price', label: '现价' },
    { key: 'changePercent', label: '涨跌幅' },
    { key: 'turnover', label: '成交额' },
    { key: 'turnoverRate', label: '换手率' },
  ],
  reit: [
    { key: 'price', label: '现价' },
    { key: 'changePercent', label: '涨跌幅' },
    { key: 'turnover', label: '成交额' },
    { key: 'distribution', label: '分派率' },
  ],
};

export default function DataScreen({
  quotes,
  watchlist,
  conversions,
  onOpen,
  onToggle,
  onSearch,
  loading,
  universes,
  universeLoading,
  onRefresh,
  endpoint,
  onPageChange,
  screening,
}: {
  quotes: Record<string, Quote>;
  watchlist: string[];
  conversions: Record<string, number>;
  onOpen: (symbol: string) => void;
  onToggle: (symbol: string) => void;
  onSearch: () => void;
  loading: boolean;
  universes: Partial<Record<UniverseKind, UniverseResponse>>;
  universeLoading: boolean;
  onRefresh: () => void;
  endpoint: string;
  onPageChange: () => void;
  screening: FilterPreferenceState;
}) {
  const [module, setModule] = useState<DataModule>('bond');
  const compactLayout = useWindowDimensions().width < 700;
  const [filter, setFilter] = useState('全部');
  const [sortKey, setSortKey] = useState<SortKey>('changePercent');
  const [descending, setDescending] = useState(true);
  const [help, setHelp] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const moduleInfo = MODULES.find((x) => x.key === module)!;
  const getValue = (q: Quote, key: SortKey): number | null => {
    if (key === 'premium' || key === 'doubleLow') {
      const valuation = bondValuation(
        q,
        q.underlying ? quotes[q.underlying] : undefined,
        conversions[q.symbol],
      );
      return valuation?.[key] ?? null;
    }
    if (key === 'distribution') return null;
    return q[key];
  };
  const rows = useMemo(() => {
    const list = CATALOG.filter((x) => x.type === module).flatMap((x) =>
      quotes[x.symbol] ? [quotes[x.symbol]] : [],
    );
    const filtered = list.filter(
      (q) =>
        filter === '全部' ||
        (filter === '上涨' && q.changePercent > 0) ||
        (filter === '下跌' && q.changePercent < 0) ||
        (filter === '价格≤120' && q.price <= 120) ||
        (filter === '仅自选' && watchlist.includes(q.symbol)) ||
        (filter === '双低≤130' && (getValue(q, 'doubleLow') ?? Infinity) <= 130),
    );
    return filtered.sort((a, b) => {
      const av = getValue(a, sortKey),
        bv = getValue(b, sortKey);
      if (av == null) return bv == null ? 0 : 1;
      if (bv == null) return -1;
      return (av - bv) * (descending ? -1 : 1);
    });
  }, [module, quotes, filter, sortKey, descending, conversions, watchlist]);
  function switchModule(value: DataModule) {
    setModule(value);
    setFilter('全部');
    setSortKey('changePercent');
    setHelp(false);
  }
  const filters =
    module === 'bond'
      ? ['全部', '价格≤120', '双低≤130', '仅自选']
      : ['全部', '上涨', '下跌', '仅自选'];
  return (
    <View style={s.container}>
      <View style={s.sectionHead}>
        <View>
          {!compactLayout && <Text style={s.eyebrow}>DISCOVER VALUE</Text>}
          <Text style={s.heading}>
            数据中心<Text style={s.headingDot}>.</Text>
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setHelp((v) => !v)}
          style={s.textButton}
        >
          <Text style={s.link}>指标说明</Text>
          <ChevronRight size={14} color={C.primary} />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.moduleList}
      >
        {MODULES.map((item) => {
          const Icon = MODULE_ICONS[item.key];
          const selected = module === item.key;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={item.label}
              onPress={() => switchModule(item.key)}
              style={[s.module, compactLayout && s.moduleCompact, selected && s.moduleActive]}
            >
              <View
                style={[
                  s.moduleIcon,
                  selected && { backgroundColor: 'rgba(255,255,255,0.15)' },
                  compactLayout && { width: 20, height: 20, backgroundColor: 'transparent' },
                ]}
              >
                <Icon
                  size={compactLayout ? 18 : 21}
                  strokeWidth={1.6}
                  color={selected ? '#fff' : C.primary}
                />
              </View>
              <Text style={[s.moduleLabel, selected && { color: '#fff' }]}>{item.label}</Text>
              {selected && !compactLayout && <View style={s.moduleIndicator} />}
            </Pressable>
          );
        })}
      </ScrollView>
      {help && (
        <Notice
          text={
            module === 'bond'
              ? '转债已支持自动读取转股价、转股价值、溢价与双低值；也可在详情修正。税前YTM为合同现金流估算，详细口径见表格“指标口径”。'
              : module === 'ah'
                ? 'A股以人民币报价，H股以港元报价。原币价比未计入汇率、交易成本与税费，不等于A/H溢价率。'
                : module === 'reit'
                  ? '沪深公募REITs完整名单；净值与分红按披露日期展示。历史现金分派率按已取得的近12月分红记录计算，不代表未来收益。'
                  : '涨跌幅以昨收计算；成交额为行情源口径。缺失指标以“—”表示。'
          }
        />
      )}
      {module === 'ah' ? (
        <AHTable quotes={quotes} onOpen={onOpen} />
      ) : module === 'ipo' ? (
        <IPOPanel />
      ) : module === 'bond' || module === 'reit' ? (
        <UniverseTable
          key={module}
          kind={module}
          data={universes[module]}
          quotes={quotes}
          conversions={conversions}
          watchlist={watchlist}
          onOpen={onOpen}
          onToggle={onToggle}
          onRefresh={onRefresh}
          loading={universeLoading}
          endpoint={endpoint}
          onPageChange={onPageChange}
          filterSettings={screening.settings[module]}
          filtersReady={screening.ready}
          onSettingsChange={(change) => screening.update(module, change)}
        />
      ) : (
        <Panel>
          <View style={s.tableTitle}>
            <View style={s.titleLeft}>
              <Text style={s.tableTitleText}>{moduleInfo.label}行情</Text>
              <View style={s.count}>
                <Text style={s.countText}>{rows.length}</Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="筛选条件"
              onPress={() => setFiltersOpen((v) => !v)}
              style={s.textButton}
            >
              <SlidersHorizontal size={14} color={C.muted} />
              <Text style={s.mutedSmall}>筛选</Text>
            </Pressable>
          </View>
          <View style={s.filterRow}>
            {filters.map((item) => (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected: filter === item }}
                onPress={() => setFilter(item)}
                style={[s.filterChip, filter === item && { backgroundColor: C.soft }]}
              >
                <Text
                  style={[s.filterText, filter === item && { color: C.primary, fontWeight: '600' }]}
                >
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>
          {filtersOpen && (
            <View style={{ paddingHorizontal: 18, paddingBottom: 12 }}>
              <Notice text="点按表头可按升序或降序排列；缺失数据始终排在最后。横向滑动表格可查看更多指标。" />
            </View>
          )}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            contentContainerStyle={{ minWidth: '100%' }}
          >
            <View style={{ flex: 1, minWidth: 540 }}>
              <View style={s.tableHeader}>
                <Text style={[s.columnName, s.tableHeaderText]}>名称 / 代码</Text>
                {COLUMNS[module].map((col) => (
                  <Pressable
                    key={col.key}
                    accessibilityRole="button"
                    accessibilityLabel={`按${col.label}排序`}
                    onPress={() => {
                      if (sortKey === col.key) setDescending((v) => !v);
                      else {
                        setSortKey(col.key);
                        setDescending(true);
                      }
                    }}
                    style={s.column}
                  >
                    <Text style={[s.tableHeaderText, sortKey === col.key && { color: C.primary }]}>
                      {col.label}
                    </Text>
                    {sortKey === col.key ? (
                      descending ? (
                        <ArrowDown size={11} color={C.primary} />
                      ) : (
                        <ArrowUp size={11} color={C.primary} />
                      )
                    ) : (
                      <ArrowUpDown size={10} color="#b4bfbd" />
                    )}
                  </Pressable>
                ))}
                <View style={s.starColumn} />
              </View>
              {rows.map((q, i) => (
                <View
                  key={q.symbol}
                  style={[s.tableRow, i % 2 === 1 && { backgroundColor: '#fcfdfd' }]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`查看${q.name}`}
                    onPress={() => onOpen(q.symbol)}
                    style={s.columnName}
                  >
                    <Text numberOfLines={1} style={s.stockName}>
                      {q.name}
                    </Text>
                    <View style={s.codeRow}>
                      <Text style={s.marketTag}>{q.market}</Text>
                      <Text style={s.code}>{q.code}</Text>
                    </View>
                  </Pressable>
                  {COLUMNS[module].map((col) => {
                    const value = getValue(q, col.key);
                    const change = col.key === 'changePercent';
                    const percentage =
                      change ||
                      col.key === 'premium' ||
                      col.key === 'turnoverRate' ||
                      col.key === 'distribution';
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${q.name}${col.label}${value ?? '缺失'}`}
                        onPress={() => onOpen(q.symbol)}
                        key={col.key}
                        style={s.column}
                      >
                        <Text
                          style={[
                            s.value,
                            col.key === 'price' && { fontWeight: '600' },
                            change && { color: q.changePercent >= 0 ? C.up : C.down },
                            value == null && { color: '#b0bdb9' },
                          ]}
                        >
                          {col.key === 'turnover'
                            ? compact(value)
                            : percentage
                              ? percent(value)
                              : price(value, col.key === 'price' ? 3 : 2)}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    style={s.starColumn}
                    accessibilityRole="button"
                    accessibilityLabel={`${watchlist.includes(q.symbol) ? '移除' : '添加'}${q.name}自选`}
                    onPress={() => onToggle(q.symbol)}
                  >
                    <Star
                      size={16}
                      color={watchlist.includes(q.symbol) ? C.primary : '#c9d3d0'}
                      fill={watchlist.includes(q.symbol) ? C.primary : 'transparent'}
                      strokeWidth={1.6}
                    />
                  </Pressable>
                </View>
              ))}
            </View>
          </ScrollView>
          {!rows.length && (
            <EmptyState
              loading={loading}
              title={loading ? '正在获取行情' : '没有符合条件的数据'}
              description={
                filter === '双低≤130'
                  ? '进入转债详情，先填写当前有效转股价，再使用双低筛选。'
                  : filter === '仅自选'
                    ? '点击行情右侧星标，将关注的品种加入自选。'
                    : '可以调整筛选条件，或稍后刷新行情。'
              }
            />
          )}
          <View style={s.tableFooter}>
            <View style={s.titleLeft}>
              <ListFilter size={12} color={C.muted} />
              <Text style={s.footerText}>精选目录 · {rows.length}只 · 非全市场排名</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={onSearch}>
              <Text style={s.link}>
                搜索更多 <Text>→</Text>
              </Text>
            </Pressable>
          </View>
        </Panel>
      )}
      {(module === 'etf' || module === 'lof') && (
        <Notice text="此处为场内交易行情。基金净值、IOPV及折溢价数据尚未接入。" />
      )}
    </View>
  );
}

function AHTable({
  quotes,
  onOpen,
}: {
  quotes: Record<string, Quote>;
  onOpen: (symbol: string) => void;
}) {
  return (
    <Panel>
      <View style={s.tableTitle}>
        <Text style={s.tableTitleText}>A/H 两地价格</Text>
        <Text style={s.mutedSmall}>原币报价</Text>
      </View>
      <ScrollView horizontal contentContainerStyle={{ minWidth: '100%' }}>
        <View style={{ minWidth: 570, flex: 1 }}>
          <View style={s.tableHeader}>
            <Text style={[s.columnName, s.tableHeaderText]}>公司</Text>
            <Text style={[s.column, s.tableHeaderText]}>A股 / CNY</Text>
            <Text style={[s.column, s.tableHeaderText]}>H股 / HKD</Text>
            <Text style={[s.column, s.tableHeaderText]}>原币价比 A/H</Text>
          </View>
          {AH_PAIRS.map((pair) => {
            const a = quotes[pair.a],
              h = quotes[pair.h];
            return (
              <View key={pair.a} style={s.tableRow}>
                <View style={s.columnName}>
                  <Text style={s.stockName}>{pair.name}</Text>
                  <Text style={s.code}>
                    {pair.a.slice(2)} / {pair.h.slice(2)}
                  </Text>
                </View>
                {[a, h].map((q, i) => (
                  <Pressable
                    key={i}
                    accessibilityRole="button"
                    accessibilityLabel={`查看${pair.name}${i ? 'H股' : 'A股'}`}
                    onPress={() => onOpen(i ? pair.h : pair.a)}
                    style={s.column}
                  >
                    <Text style={s.value}>{price(q?.price)}</Text>
                  </Pressable>
                ))}
                <View style={s.column}>
                  <Text style={[s.value, { color: C.primary }]}>
                    {a && h && h.price > 0 && a.source === h.source
                      ? `${(a.price / h.price).toFixed(3)}×`
                      : '—'}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
      <View style={{ padding: 16 }}>
        <Notice text="原币价比未作汇率换算，不等于A/H溢价。A股为人民币、H股为港元，两地报价时间可能不同。" />
      </View>
    </Panel>
  );
}

const s = StyleSheet.create({
  container: { gap: 16 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  eyebrow: { fontSize: 9, letterSpacing: 2, fontWeight: '600', color: C.muted, marginBottom: 5 },
  heading: { color: C.ink, fontSize: 23, fontWeight: '700', letterSpacing: 0.4 },
  headingDot: { color: C.primary, fontSize: 30 },
  textButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5 },
  link: { color: C.primary, fontSize: 11, fontWeight: '500' },
  mutedSmall: { fontSize: 11, color: C.muted },
  moduleList: { gap: 10, paddingBottom: 3 },
  module: {
    width: 100,
    height: 108,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    padding: 15,
    gap: 10,
    position: 'relative',
  },
  moduleActive: { backgroundColor: C.primary, borderColor: C.primary },
  moduleCompact: {
    width: 'auto',
    height: 46,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 11,
  },
  moduleIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleLabel: { fontSize: 14, color: C.ink, fontWeight: '600' },
  moduleIndicator: {
    position: 'absolute',
    right: 12,
    top: 15,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#b2e9d1',
  },
  tableTitle: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tableTitleText: { fontSize: 16, fontWeight: '600', color: C.ink },
  titleLeft: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  count: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: C.bg },
  countText: { fontSize: 10, color: C.muted },
  filterRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 18, paddingBottom: 16 },
  filterChip: { borderRadius: 6, paddingVertical: 6, paddingHorizontal: 11 },
  filterText: { fontSize: 11, color: C.muted },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8faf9',
    minHeight: 39,
    paddingHorizontal: 18,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  tableHeaderText: { color: C.muted, fontSize: 10 },
  columnName: { width: 142, paddingRight: 6, justifyContent: 'center', gap: 5 },
  column: {
    minWidth: 82,
    flex: 1,
    paddingRight: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
  },
  starColumn: { width: 32, alignItems: 'flex-end', justifyContent: 'center', alignSelf: 'stretch' },
  tableRow: {
    minHeight: 72,
    paddingHorizontal: 18,
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f4f2',
    alignItems: 'center',
  },
  stockName: { fontSize: 13, fontWeight: '600', color: C.ink },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  marketTag: {
    color: C.primary,
    backgroundColor: C.soft,
    fontSize: 8,
    fontWeight: '600',
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 2,
  },
  code: { color: C.muted, fontSize: 10, fontVariant: ['tabular-nums'] },
  value: { fontSize: 13, color: C.ink, fontVariant: ['tabular-nums'] },
  tableFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    gap: 6,
  },
  footerText: { fontSize: 9, color: C.muted },
});
