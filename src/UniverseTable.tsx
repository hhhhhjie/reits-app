import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from 'lucide-react-native';
import { CATALOG } from '../shared/catalog';
import {
  METRIC_GROUPS,
  marketMetric,
  type MetricColumn,
  type MetricValue,
} from '../shared/market-metrics';
import type {
  Quote,
  ReitMetricsResponse,
  UniverseItem,
  UniverseKind,
  UniverseResponse,
} from '../shared/types';
import { api } from './api';
import { Button, EmptyState, ModeBadge, Notice, Panel } from './components';
import { C, compact, percent, price, quoteTime } from './theme';
import FilterPanel from './FilterPanel';
import {
  FILTER_FIELDS,
  activeFilterChips,
  canonicalFilters,
  clearFilter,
  emptyMarketFilters,
  matchesMarketFilters,
  upsertFilterPreset,
  type KindFilterSettings,
  type MarketFilters,
} from '../shared/screening';

export function formatMetric(value: MetricValue, column: MetricColumn) {
  if (value == null) return '—';
  if (typeof value === 'string') return value;
  if (column.format === 'amount') return compact(value);
  if (column.format === 'percent') return percent(value);
  if (column.format === 'years') return `${value.toFixed(2)}年`;
  return price(
    value,
    column.key === 'price' || column.key === 'nav' || column.key.includes('Distribution') ? 3 : 2,
  );
}

export default function UniverseTable({
  kind,
  data,
  quotes,
  conversions,
  watchlist,
  onOpen,
  onToggle,
  onRefresh,
  loading,
  endpoint,
  onPageChange,
  filterSettings,
  filtersReady,
  onSettingsChange,
}: {
  kind: UniverseKind;
  data?: UniverseResponse;
  quotes: Record<string, Quote>;
  conversions: Record<string, number>;
  watchlist: string[];
  onOpen: (symbol: string) => void;
  onToggle: (symbol: string) => void;
  onRefresh: () => void;
  loading: boolean;
  endpoint: string;
  onPageChange: () => void;
  filterSettings: KindFilterSettings;
  filtersReady: boolean;
  onSettingsChange: (change: (previous: KindFilterSettings) => KindFilterSettings) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const applied = filterSettings.applied;
  const activeChips = activeFilterChips(applied, kind);
  const [group, setGroup] = useState(0);
  const [sort, setSort] = useState('changePercent');
  const [descending, setDescending] = useState(true);
  const [page, setPage] = useState(0);
  const [help, setHelp] = useState(false);
  const [funds, setFunds] = useState<Record<string, ReitMetricsResponse>>({});
  const [processed, setProcessed] = useState(0);
  const items: UniverseItem[] = data?.items ?? CATALOG.filter((item) => item.type === kind);
  const symbolKey = items.map((item) => item.symbol).join(',');
  const groups = METRIC_GROUPS[kind],
    columns = groups[group].columns;
  const label = kind === 'bond' ? '可转债' : 'REITs';
  useEffect(() => {
    if (kind !== 'reit' || !data || data.mode === 'demo') return;
    let active = true,
      cursor = 0,
      finished = 0;
    setFunds({});
    setProcessed(0);
    const symbols = symbolKey.split(',').filter(Boolean);
    void Promise.all(
      Array.from({ length: Math.min(3, symbols.length) }, async () => {
        while (active && cursor < symbols.length) {
          const symbol = symbols[cursor++];
          try {
            const response = await api.reitMetrics(symbol);
            if (active) setFunds((previous) => ({ ...previous, [symbol]: response }));
          } catch {
            /* 缺失指标显示为 —，不影响已取得的报价。 */
          }
          finished++;
          if (active) setProcessed(finished);
        }
      }),
    );
    return () => {
      active = false;
    };
  }, [kind, symbolKey, endpoint, data?.mode]);
  const result = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items
      .filter((item) => {
        if (
          needle &&
          !`${item.name} ${item.code} ${item.bond?.stockName ?? ''} ${item.underlying ?? ''}`
            .toLowerCase()
            .includes(needle)
        )
          return false;
        return matchesMarketFilters(
          item,
          applied,
          kind,
          quotes,
          watchlist,
          conversions,
          funds[item.symbol]?.metrics ?? item.reit,
        );
      })
      .sort((a, b) => {
        const av = marketMetric(
          a,
          sort,
          quotes,
          conversions[a.symbol],
          funds[a.symbol]?.metrics ?? a.reit,
        );
        const bv = marketMetric(
          b,
          sort,
          quotes,
          conversions[b.symbol],
          funds[b.symbol]?.metrics ?? b.reit,
        );
        if (av == null) return bv == null ? a.code.localeCompare(b.code) : 1;
        if (bv == null) return -1;
        const comparison =
          typeof av === 'number' && typeof bv === 'number'
            ? av - bv
            : String(av).localeCompare(String(bv));
        return comparison * (descending ? -1 : 1) || a.code.localeCompare(b.code);
      });
  }, [items, quotes, query, applied, watchlist, sort, descending, conversions, funds]);
  function updateFilters(change: (previous: MarketFilters) => MarketFilters) {
    if (!filtersReady) return;
    setPage(0);
    void onSettingsChange((previous) => ({
      ...previous,
      applied: canonicalFilters(change(previous.applied), kind),
    })).catch(() => {});
  }
  function quickSelected(value: string) {
    if (value === '全部') return !activeChips.length;
    if (value === '仅自选') return applied.watchOnly;
    if (value === '上涨' || value === '下跌')
      return applied.trend === (value === '上涨' ? 'up' : 'down');
    const key = value === '价格≤120' ? 'price' : 'doubleLow',
      max = value === '价格≤120' ? '120' : '130';
    return !applied.ranges[key]?.min && applied.ranges[key]?.max === max;
  }
  function quickFilter(value: string) {
    updateFilters((previous) => {
      if (value === '全部') return emptyMarketFilters();
      if (value === '仅自选') return { ...previous, watchOnly: !previous.watchOnly };
      if (value === '上涨' || value === '下跌') {
        const trend = value === '上涨' ? 'up' : 'down';
        return { ...previous, trend: previous.trend === trend ? 'all' : trend };
      }
      const key = value === '价格≤120' ? 'price' : 'doubleLow',
        max = value === '价格≤120' ? '120' : '130';
      return !previous.ranges[key]?.min && previous.ranges[key]?.max === max
        ? clearFilter(previous, `range:${key}`)
        : { ...previous, ranges: { ...previous.ranges, [key]: { min: '', max } } };
    });
  }
  function previewCount(draft: MarketFilters) {
    const needle = query.trim().toLowerCase();
    return items.filter(
      (item) =>
        (!needle ||
          `${item.name} ${item.code} ${item.bond?.stockName ?? ''} ${item.underlying ?? ''}`
            .toLowerCase()
            .includes(needle)) &&
        matchesMarketFilters(
          item,
          draft,
          kind,
          quotes,
          watchlist,
          conversions,
          funds[item.symbol]?.metrics ?? item.reit,
        ),
    ).length;
  }
  const size = 25,
    totalPages = Math.max(1, Math.ceil(result.length / size)),
    currentPage = Math.min(page, totalPages - 1);
  const rows = result.slice(currentPage * size, (currentPage + 1) * size);
  const filters =
    kind === 'bond'
      ? ['全部', '价格≤120', '双低≤130', '仅自选']
      : ['全部', '上涨', '下跌', '仅自选'];
  const availableFunds = items.filter((item) => funds[item.symbol]?.available || item.reit).length;
  const distributions = items.filter(
    (item) =>
      (funds[item.symbol]?.metrics?.cashDistributionTtm ?? item.reit?.cashDistributionTtm) != null,
  ).length;
  const withQuotes = items.filter(
    (item) => quotes[item.symbol]?.source !== 'demo' && !!quotes[item.symbol],
  ).length;
  return (
    <View style={{ gap: 12 }}>
      <Panel>
        <View style={s.titleRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={s.title}>{label}行情</Text>
            <Text style={s.count}>
              {result.length} / {items.length}
            </Text>
          </View>
          <ModeBadge mode={data?.mode ?? 'demo'} />
        </View>
        <View style={s.scope}>
          <Text style={s.scopeText}>
            {data?.complete
              ? '沪深全市场'
              : data?.mode === 'demo'
                ? '精选演示样本'
                : loading
                  ? '正在核对全市场目录'
                  : '目录未完成核对'}{' '}
            · {items.length}只
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="刷新全市场目录"
            onPress={onRefresh}
            style={s.refresh}
          >
            <RefreshCw size={13} color={C.primary} />
            <Text style={s.link}>刷新</Text>
          </Pressable>
        </View>
        <View style={s.search}>
          <Search size={15} color={C.muted} />
          <TextInput
            accessibilityLabel={`搜索全市场${label}`}
            value={query}
            onChangeText={(value) => {
              setQuery(value);
              setPage(0);
            }}
            placeholder="搜索全部名称 / 代码 / 正股"
            placeholderTextColor={C.muted}
            style={s.input}
            autoCorrect={false}
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chips}
        >
          {(['all', 'SH', 'SZ'] as const).map((value, index) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: applied.market === value }}
              disabled={!filtersReady}
              onPress={() => updateFilters((previous) => ({ ...previous, market: value }))}
              style={[s.chip, applied.market === value && s.selected]}
            >
              <Text style={[s.chipText, applied.market === value && s.selectedText]}>
                {['全部市场', '沪市', '深市'][index]}
              </Text>
            </Pressable>
          ))}
          <View style={{ width: 1, backgroundColor: C.line, marginHorizontal: 3 }} />
          {filters.map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: quickSelected(value) }}
              disabled={!filtersReady}
              onPress={() => quickFilter(value)}
              style={[s.chip, quickSelected(value) && s.selected]}
            >
              <Text style={[s.chipText, quickSelected(value) && s.selectedText]}>{value}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={s.advancedRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="设置筛选"
            disabled={!filtersReady}
            onPress={() => setFilterPanelOpen(true)}
            style={s.advancedButton}
          >
            <SlidersHorizontal size={14} color={C.primary} />
            <Text style={s.link}>
              设置筛选{activeChips.length ? ` · ${activeChips.length}` : ''}
            </Text>
          </Pressable>
          {!!activeChips.length && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="清空全部筛选"
              onPress={() => updateFilters(() => emptyMarketFilters())}
            >
              <Text style={s.link}>清空条件</Text>
            </Pressable>
          )}
          {!filtersReady && <Text style={s.chipText}>正在读取本机条件…</Text>}
        </View>
        {!!activeChips.length && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.activeChips}
          >
            {activeChips.map((chip) => (
              <Pressable
                key={chip.key}
                accessibilityRole="button"
                accessibilityLabel={`取消${chip.key.startsWith('range:') ? FILTER_FIELDS[kind].find((f) => f.key === chip.key.slice(6))?.label : chip.label}筛选`}
                onPress={() => updateFilters((previous) => clearFilter(previous, chip.key))}
                style={s.activeChip}
              >
                <Text style={s.chipText}>{chip.label}</Text>
                <X size={11} color={C.muted} />
              </Pressable>
            ))}
          </ScrollView>
        )}
        {kind === 'reit' &&
          processed < items.length &&
          !!(applied.ranges.distributionYield || applied.ranges.cashDistributionTtm) && (
            <View style={{ paddingHorizontal: 18, paddingBottom: 10 }}>
              <Notice
                text={`正在补充分红记录 ${processed}/${items.length}，缺失指标暂不进入筛选结果。`}
              />
            </View>
          )}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.groups}
        >
          {groups.map((g, index) => (
            <Pressable
              key={g.label}
              accessibilityRole="tab"
              accessibilityLabel={g.label}
              accessibilityState={{ selected: group === index }}
              onPress={() => {
                setGroup(index);
                setPage(0);
                if (!g.columns.some((c) => c.key === sort)) setSort(g.columns[0].key);
              }}
              style={[s.group, group === index && { borderBottomColor: C.primary }]}
            >
              <Text style={[s.groupText, group === index && s.selectedText]}>{g.label}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={() => setHelp((v) => !v)} style={s.group}>
            <Text style={s.link}>指标口径</Text>
          </Pressable>
        </ScrollView>
        {help && (
          <View style={s.info}>
            <Notice
              text={
                kind === 'bond'
                  ? '转股价值＝正股价÷转股价×100；溢价率＝转债价格÷转股价值−1；双低＝转债价格＋溢价百分数。优先使用本机修正转股价，其次使用东方财富现行转股价。税前YTM为合同现金流IRR估算，按报价日计算，含末期利息且不重复计息，未扣税费；赎回公告或条款不完整时不计算。发行规模不是剩余规模。触发价格不代表满足强赎天数。'
                  : '净值溢价＝交易价格÷最新单位净值−1，净值可能是历史披露值，不是IOPV。历史现金分派率＝现金分红明细中近12个月的记录之和÷现价，记录可能不完整，不能当作未来或年化预测；无记录时留空。记录日不等于到账日。净值、分红和价格分别保留日期。'
              }
            />
          </View>
        )}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          contentContainerStyle={{ minWidth: '100%' }}
        >
          <View style={{ minWidth: 190 + columns.length * 105, flex: 1 }}>
            <View style={s.header}>
              <Text style={[s.nameCell, s.headerText]}>名称 / 代码</Text>
              {columns.map((column) => (
                <Pressable
                  key={column.key}
                  accessibilityRole="button"
                  accessibilityLabel={`按${column.label}排序`}
                  onPress={() => {
                    if (sort === column.key) setDescending((v) => !v);
                    else {
                      setSort(column.key);
                      setDescending(true);
                    }
                    setPage(0);
                  }}
                  style={s.cell}
                >
                  <Text style={[s.headerText, sort === column.key && { color: C.primary }]}>
                    {column.label}
                  </Text>
                  {sort === column.key ? (
                    descending ? (
                      <ArrowDown size={10} color={C.primary} />
                    ) : (
                      <ArrowUp size={10} color={C.primary} />
                    )
                  ) : (
                    <ArrowUpDown size={10} color={C.muted} />
                  )}
                </Pressable>
              ))}
              <View style={s.star} />
            </View>
            {rows.map((item, index) => (
              <View
                key={item.symbol}
                style={[s.row, index % 2 === 1 && { backgroundColor: '#fcfdfd' }]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`查看${item.name}`}
                  onPress={() => onOpen(item.symbol)}
                  style={s.nameCell}
                >
                  <Text numberOfLines={1} style={s.name}>
                    {item.name}
                  </Text>
                  <Text style={s.code}>
                    {item.market} {item.code}
                    {!quotes[item.symbol] ? ' · 行情暂缺' : ''}
                  </Text>
                </Pressable>
                {columns.map((column) => {
                  const value = marketMetric(
                    item,
                    column.key,
                    quotes,
                    conversions[item.symbol],
                    funds[item.symbol]?.metrics ?? item.reit,
                  );
                  return (
                    <Pressable
                      key={column.key}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.name}${column.label}${value == null ? '缺失' : formatMetric(value, column)}`}
                      onPress={() => onOpen(item.symbol)}
                      style={s.cell}
                    >
                      <Text
                        style={[
                          s.value,
                          column.key === 'price' && { fontWeight: '600' },
                          value == null && { color: '#a6b4af' },
                          (column.key === 'changePercent' || column.key === 'stockChange') &&
                            typeof value === 'number' && { color: value >= 0 ? C.up : C.down },
                        ]}
                      >
                        {formatMetric(value, column)}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${watchlist.includes(item.symbol) ? '移除' : '添加'}${item.name}自选`}
                  onPress={() => onToggle(item.symbol)}
                  style={s.star}
                >
                  <Star
                    size={16}
                    color={watchlist.includes(item.symbol) ? C.primary : '#bdcbc5'}
                    fill={watchlist.includes(item.symbol) ? C.primary : 'transparent'}
                  />
                </Pressable>
              </View>
            ))}
          </View>
        </ScrollView>
        {!rows.length && (
          <EmptyState
            loading={loading}
            title={loading ? '正在获取全市场目录' : '没有符合条件的数据'}
            description="请调整名称、市场或指标筛选条件。缺失指标不会参与数值筛选。"
            action="清空搜索和筛选"
            onAction={() => {
              setQuery('');
              updateFilters(() => emptyMarketFilters());
              onPageChange();
            }}
          />
        )}
        <View style={s.pagination}>
          <Button
            label="上一页"
            secondary
            disabled={currentPage === 0}
            onPress={() => {
              setPage(currentPage - 1);
              onPageChange();
            }}
          />
          <Text style={s.page}>
            {currentPage + 1} / {totalPages} 页 · 共{result.length}只
          </Text>
          <Button
            label="下一页"
            secondary
            disabled={currentPage === totalPages - 1}
            onPress={() => {
              setPage(currentPage + 1);
              onPageChange();
            }}
          />
        </View>
        <Text style={s.footer}>
          {data?.source ?? '正在加载目录'}
          {data
            ? `\n目录核对：${quoteTime(data.directoryUpdatedAt, true)} · ${withQuotes}只取得真实或缓存报价\n完整列表每60秒刷新；逐只报价时间见详情。`
            : ''}
        </Text>
        {kind === 'reit' && data?.mode !== 'demo' && (
          <Text style={s.footer}>
            披露净值{availableFunds}只；分红记录已检查{processed}/{items.length}只，{distributions}
            只取得近12月现金记录；缺失显示“—”。
          </Text>
        )}
      </Panel>
      {data && (!data.complete || data.mode !== 'live') && <Notice error text={data.message} />}
      {kind === 'bond' ? (
        <Notice text="税前YTM为估算。强赎触发价与赎回公告分列展示，不推测15/30日计数；到期、强赎和转股价请核对最新公告。" />
      ) : (
        <Notice text="净值及现金分红来自独立披露记录，可能滞后或缺失。历史现金分派率不是预期收益率，须结合基金公告核对。" />
      )}
      <FilterPanel
        visible={filterPanelOpen}
        kind={kind}
        settings={filterSettings}
        onClose={() => setFilterPanelOpen(false)}
        previewCount={previewCount}
        searching={!!query.trim()}
        scope={`${data?.complete ? '沪深全市场' : data?.mode === 'demo' ? '精选演示样本' : data?.mode === 'cached' ? '缓存名单' : '已载入目录'} ${items.length}只`}
        loadingDistributions={processed < items.length}
        onApply={async (filters) => {
          setPage(0);
          await onSettingsChange((previous) => ({ ...previous, applied: filters }));
          onPageChange();
        }}
        onSave={(name, filters) =>
          onSettingsChange((previous) => upsertFilterPreset(previous, name, filters, kind))
        }
        onDelete={(id) =>
          onSettingsChange((previous) => ({
            ...previous,
            presets: previous.presets.filter((p) => p.id !== id),
          }))
        }
      />
    </View>
  );
}
const s = StyleSheet.create({
  titleRow: {
    paddingHorizontal: 18,
    paddingTop: 19,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 16, fontWeight: '600', color: C.ink },
  count: {
    fontSize: 11,
    color: C.muted,
    backgroundColor: C.bg,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  scope: {
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  scopeText: { fontSize: 11, color: C.primary },
  refresh: { flexDirection: 'row', gap: 4, alignItems: 'center', padding: 5 },
  link: { fontSize: 11, color: C.primary },
  advancedRow: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  advancedButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5 },
  activeChips: { paddingHorizontal: 18, paddingBottom: 12, gap: 6 },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.bg,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 5,
  },
  search: {
    marginHorizontal: 18,
    marginBottom: 12,
    backgroundColor: C.bg,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  input: { flex: 1, paddingVertical: 11, color: C.ink, fontSize: 12 },
  chips: { paddingHorizontal: 18, gap: 5, paddingBottom: 12 },
  chip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6 },
  chipText: { fontSize: 11, color: C.muted },
  selected: { backgroundColor: C.soft },
  selectedText: { color: C.primary, fontWeight: '600' },
  groups: { paddingHorizontal: 18, gap: 16 },
  group: { paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  groupText: { fontSize: 12, color: C.muted },
  info: { padding: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    backgroundColor: '#f5f8f6',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 18,
  },
  headerText: { fontSize: 10, color: C.muted },
  nameCell: { width: 148, gap: 6, paddingRight: 9 },
  cell: {
    width: 105,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
    paddingRight: 12,
  },
  star: { width: 30, alignSelf: 'stretch', alignItems: 'flex-end', justifyContent: 'center' },
  row: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  name: { fontSize: 12, fontWeight: '600', color: C.ink },
  code: { fontSize: 10, color: C.muted, fontVariant: ['tabular-nums'] },
  value: { fontSize: 12, color: C.ink, fontVariant: ['tabular-nums'] },
  pagination: {
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  page: { fontSize: 10, color: C.muted },
  footer: {
    fontSize: 10,
    lineHeight: 18,
    color: C.muted,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
});
