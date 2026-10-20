import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
} from 'lucide-react-native';
import { registerInstruments } from '../shared/catalog';
import {
  INCOME_FIELDS,
  emptyIncomeFilters,
  incomeFilterCount,
  incomeFilterError,
  incomeFilterSummary,
  matchesIncomeFilters,
  readIncomeFilters,
  type IncomeFilters,
  type IncomeMetric,
} from '../shared/income-screening';
import type { IncomeResponse, IncomeScope, Quote } from '../shared/types';
import { api } from './api';
import { Button, EmptyState, IconButton, ModeBadge, Notice, Panel } from './components';
import { C, percent, price, quoteTime } from './theme';

const COLS = [
  { key: 'price', label: '价格', width: 90 },
  { key: 'dividendYield', label: '股息率（源）', width: 108 },
  { key: 'pe', label: 'PE-TTM', width: 86 },
  { key: 'pb', label: 'PB', width: 76 },
  { key: 'averageYield5y', label: '五年平均股息率', width: 116 },
  { key: 'dividendPerShare', label: '每份股息（源）', width: 118 },
  { key: 'timestamp', label: '报价时间', width: 156 },
] as const;
type Sort = IncomeMetric | 'dividendPerShare' | 'timestamp';

export default function IncomeTable({
  scope,
  quotes,
  watchlist,
  onOpen,
  onToggle,
  endpoint,
  onData,
  refreshKey,
  onPageChange,
}: {
  scope: IncomeScope;
  quotes: Record<string, Quote>;
  watchlist: string[];
  onOpen: (symbol: string) => void;
  onToggle: (symbol: string) => void;
  endpoint: string;
  onData: (result: IncomeResponse) => void;
  refreshKey: number;
  onPageChange: () => void;
}) {
  const [data, setData] = useState<IncomeResponse | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const refreshRef = useRef<() => void>(() => {});
  useEffect(() => {
    let active = true,
      busy = false;
    setData(null);
    setError('');
    async function refresh() {
      if (busy) return;
      busy = true;
      setLoading(true);
      try {
        const result = await api.income(scope);
        if (active) {
          registerInstruments(result.items);
          setData(result);
          onData(result);
          setError('');
        }
      } catch {
        if (active) {
          setData((old) =>
            old
              ? { ...old, mode: old.mode === 'demo' ? 'demo' : 'cached', directoryComplete: false }
              : null,
          );
          setError('股息行情更新失败，请稍后重试；已取得的报价保留原始时间。');
        }
      } finally {
        busy = false;
        if (active) setLoading(false);
      }
    }
    refreshRef.current = () => {
      void refresh();
    };
    void refresh();
    const timer = setInterval(() => {
      if (
        AppState.currentState === 'active' &&
        (typeof document === 'undefined' || document.visibilityState !== 'hidden')
      )
        void refresh();
    }, 60_000);
    const listener = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => {
      active = false;
      clearInterval(timer);
      listener.remove();
    };
  }, [scope, endpoint, onData]);
  useEffect(() => {
    if (refreshKey) refreshRef.current();
  }, [refreshKey]);
  const [query, setQuery] = useState(''),
    [page, setPage] = useState(0),
    [sort, setSort] = useState<Sort>('dividendYield'),
    [descending, setDescending] = useState(true);
  const [filters, setFilters] = useState<IncomeFilters>(emptyIncomeFilters),
    [ready, setReady] = useState(false),
    [storageError, setStorageError] = useState('');
  const currentFilters = useRef(filters),
    writes = useRef(Promise.resolve());
  const storageKey = `zx.income-filters.v1.${scope}`;
  useEffect(() => {
    let active = true;
    setReady(false);
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (!active) return;
        const result = readIncomeFilters(raw);
        currentFilters.current = result ?? emptyIncomeFilters();
        setFilters(currentFilters.current);
        if (!result) setStorageError('保存的股息筛选内容无效，已恢复默认条件。');
      })
      .catch(() => {
        if (active) setStorageError('未能读取本机股息筛选。');
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [storageKey]);
  function apply(next: IncomeFilters) {
    if (!ready) return;
    currentFilters.current = next;
    setFilters(next);
    setPage(0);
    const write = writes.current
      .catch(() => {})
      .then(() => AsyncStorage.setItem(storageKey, JSON.stringify(next)));
    writes.current = write;
    void write
      .then(() => setStorageError(''))
      .catch(() => setStorageError('筛选已在本次会话生效，但未能保存到本机。'));
  }
  const [panel, setPanel] = useState(false),
    [help, setHelp] = useState(false);
  const ownQuotes = useMemo(
    () => Object.fromEntries((data?.quotes ?? []).map((q) => [q.symbol, q])),
    [data],
  );
  const quoteOf = useCallback(
    (symbol: string) => {
      const q = quotes[symbol],
        own = ownQuotes[symbol];
      // 演示或不同服务地址的数据不能覆盖当前目录取得的真实报价。
      if (data?.mode === 'demo') return undefined;
      if (q?.source !== 'demo' && q && own && (q.timestamp ?? '') > (own.timestamp ?? '')) return q;
      return own;
    },
    [ownQuotes, quotes, data?.mode],
  );
  const items = data?.items ?? [];
  const needle = query.trim().toLowerCase();
  const result = useMemo(
    () =>
      items
        .filter(
          (i) =>
            (!needle || `${i.name} ${i.code} ${i.symbol}`.toLowerCase().includes(needle)) &&
            matchesIncomeFilters(i, quoteOf(i.symbol), filters, watchlist),
        )
        .sort((a, b) => {
          const av = quoteOf(a.symbol)?.[sort],
            bv = quoteOf(b.symbol)?.[sort];
          if (av == null) return bv == null ? a.symbol.localeCompare(b.symbol) : 1;
          if (bv == null) return -1;
          return (
            (typeof av === 'number' && typeof bv === 'number'
              ? av - bv
              : String(av).localeCompare(String(bv))) * (descending ? -1 : 1) ||
            a.symbol.localeCompare(b.symbol)
          );
        }),
    [items, needle, filters, watchlist, quoteOf, sort, descending],
  );
  const totalPages = Math.max(1, Math.ceil(result.length / 25)),
    currentPage = Math.min(page, totalPages - 1),
    rows = result.slice(currentPage * 25, (currentPage + 1) * 25);
  const label = scope === 'a' ? 'A股股息率' : scope === 'hk' ? '港股股息率' : '港股 REITs';
  const stats = items.filter((i) => quoteOf(i.symbol)?.dividendYield != null).length;
  const index = quotes[scope === 'a' ? 'sh000300' : 'hkHSI'];
  return (
    <View style={{ gap: 12 }}>
      <Panel>
        <View style={s.titleRow}>
          <Text style={s.title}>{label}</Text>
          <ModeBadge mode={data?.mode} />
        </View>
        <View style={s.banner}>
          <Text style={s.bannerText}>
            {scope === 'a' ? '沪深300' : '恒生指数'} PE{' '}
            {price(index?.source !== 'demo' ? index?.pe : null)} / PB{' '}
            {price(index?.source !== 'demo' ? index?.pb : null)}
          </Text>
          <Text style={s.temperature}>估值温度 —</Text>
        </View>
        <View style={s.titleRow}>
          <Text style={s.meta}>
            {result.length} / {items.length}只 · 股息率已取得 {stats}只
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="刷新股息行情"
            onPress={() => refreshRef.current()}
            style={s.action}
          >
            <RefreshCw size={14} color={C.primary} />
            <Text style={s.link}>{loading ? '更新中' : '刷新'}</Text>
          </Pressable>
        </View>
        <View style={s.search}>
          <Search size={15} color={C.muted} />
          <TextInput
            accessibilityLabel="搜索股息证券"
            placeholder="搜索全部名称 / 代码"
            placeholderTextColor={C.muted}
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              setPage(0);
            }}
            autoCorrect={false}
            style={s.input}
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chips}
        >
          {[
            {
              label: '全部',
              selected: !incomeFilterCount(filters),
              run: () => apply(emptyIncomeFilters()),
            },
            {
              label: '股息≥5%',
              selected:
                filters.ranges.dividendYield?.min === '5' && !filters.ranges.dividendYield?.max,
              run: () =>
                apply({
                  ...currentFilters.current,
                  ranges: {
                    ...currentFilters.current.ranges,
                    dividendYield: { min: '5', max: '' },
                  },
                }),
            },
            {
              label: '股息≥8%',
              selected:
                filters.ranges.dividendYield?.min === '8' && !filters.ranges.dividendYield?.max,
              run: () =>
                apply({
                  ...currentFilters.current,
                  ranges: {
                    ...currentFilters.current.ranges,
                    dividendYield: { min: '8', max: '' },
                  },
                }),
            },
            {
              label: '仅自选',
              selected: filters.watchOnly,
              run: () =>
                apply({ ...currentFilters.current, watchOnly: !currentFilters.current.watchOnly }),
            },
          ].map((c) => (
            <Pressable
              key={c.label}
              accessibilityRole="button"
              accessibilityState={{ selected: c.selected }}
              disabled={!ready}
              onPress={c.run}
              style={[s.chip, c.selected && s.selected]}
            >
              <Text style={[s.chipText, c.selected && s.link]}>{c.label}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="设置股息筛选"
            disabled={!ready}
            onPress={() => setPanel(true)}
            style={[s.chip, s.action]}
          >
            <SlidersHorizontal size={13} color={C.primary} />
            <Text style={s.link}>
              设置筛选{incomeFilterCount(filters) ? ` · ${incomeFilterCount(filters)}` : ''}
            </Text>
          </Pressable>
        </ScrollView>
        {!!incomeFilterCount(filters) && (
          <View style={s.summary}>
            <Text style={[s.meta, { flex: 1 }]}>{incomeFilterSummary(filters)}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="清空股息筛选"
              onPress={() => apply(emptyIncomeFilters())}
            >
              <Text style={s.link}>清空条件</Text>
            </Pressable>
          </View>
        )}
        {loading && !data ? (
          <EmptyState
            loading
            title="正在读取股息目录与行情"
            description="首次加载需要核对所有分页并分批取得报价，请稍候。"
          />
        ) : !result.length ? (
          <EmptyState
            title="暂无符合条件的证券"
            description={
              data?.mode === 'demo'
                ? '行情源未连接，股息指标保持缺失。'
                : '检查搜索或筛选条件，缺失指标不按0处理。'
            }
            action="清空搜索和筛选"
            onAction={() => {
              setQuery('');
              apply(emptyIncomeFilters());
            }}
          />
        ) : (
          <View style={{ flexDirection: 'row' }} testID="income-table">
            <View style={s.names}>
              <View style={[s.header, { paddingLeft: 12 }]}>
                <Text style={s.meta}>名称 / 代码</Text>
              </View>
              {rows.map((i, n) => (
                <Pressable
                  key={i.symbol}
                  accessibilityRole="button"
                  accessibilityLabel={`查看${i.name}`}
                  onPress={() => onOpen(i.symbol)}
                  style={[s.nameRow, n % 2 === 1 && s.zebra]}
                >
                  <Text style={s.name} numberOfLines={1}>
                    {i.name}
                  </Text>
                  <Text style={s.code}>
                    {i.code} · {quoteOf(i.symbol)?.currency ?? (i.market === 'HK' ? '—' : 'CNY')}
                  </Text>
                </Pressable>
              ))}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator style={{ flex: 1 }}>
              <View>
                <View style={[s.header, { flexDirection: 'row' }]}>
                  {COLS.map((c) =>
                    c.key === 'averageYield5y' ? (
                      <View key={c.key} style={[s.cell, { width: c.width }]}>
                        <Text style={s.meta}>{c.label}</Text>
                      </View>
                    ) : (
                      <Pressable
                        key={c.key}
                        accessibilityRole="button"
                        accessibilityLabel={`股息表按${c.label}排序`}
                        onPress={() => {
                          if (sort === c.key) setDescending((x) => !x);
                          else {
                            setSort(c.key);
                            setDescending(true);
                          }
                          setPage(0);
                        }}
                        style={[s.cell, { width: c.width, flexDirection: 'row', gap: 3 }]}
                      >
                        <Text style={[s.meta, sort === c.key && s.link]}>{c.label}</Text>
                        {sort === c.key &&
                          (descending ? (
                            <ArrowDown size={11} color={C.primary} />
                          ) : (
                            <ArrowUp size={11} color={C.primary} />
                          ))}
                      </Pressable>
                    ),
                  )}
                  <View style={{ width: 48 }} />
                </View>
                {rows.map((i, n) => {
                  const q = quoteOf(i.symbol);
                  return (
                    <View key={i.symbol} style={[s.dataRow, n % 2 === 1 && s.zebra]}>
                      {COLS.map((c) => (
                        <Pressable
                          key={c.key}
                          accessibilityRole="button"
                          accessibilityLabel={`${i.name}${c.label}`}
                          onPress={() => onOpen(i.symbol)}
                          style={[s.cell, { width: c.width }]}
                        >
                          <Text
                            style={[
                              s.value,
                              c.key === 'price' && {
                                color: q ? (q.changePercent >= 0 ? C.up : C.down) : C.ink,
                              },
                              c.key === 'dividendYield' &&
                                q?.dividendYield != null && { color: C.primary, fontWeight: '700' },
                            ]}
                          >
                            {c.key === 'averageYield5y'
                              ? '—'
                              : c.key === 'timestamp'
                                ? q
                                  ? quoteTime(q.timestamp, true)
                                  : '—'
                                : c.key === 'dividendYield'
                                  ? q?.dividendYield == null
                                    ? '—'
                                    : `${q.dividendYield.toFixed(2)}%`
                                  : price(
                                      q?.[c.key],
                                      c.key === 'dividendPerShare' ? 4 : c.key === 'price' ? 3 : 2,
                                    )}
                          </Text>
                          {c.key === 'price' && (
                            <Text
                              style={[
                                s.code,
                                { color: q ? (q.changePercent >= 0 ? C.up : C.down) : C.muted },
                              ]}
                            >
                              {percent(q?.changePercent)}
                            </Text>
                          )}
                        </Pressable>
                      ))}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${watchlist.includes(i.symbol) ? '移除' : '自选'}${i.name}`}
                        onPress={() => onToggle(i.symbol)}
                        style={[s.cell, { width: 48 }]}
                      >
                        <Star
                          size={17}
                          color={watchlist.includes(i.symbol) ? C.primary : C.muted}
                          fill={watchlist.includes(i.symbol) ? C.soft : 'none'}
                        />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        )}
        {!!result.length && (
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
            <Text style={s.meta}>
              第{currentPage + 1}/{totalPages}页 · 每页25只
            </Text>
            <Button
              label="下一页"
              secondary
              disabled={currentPage >= totalPages - 1}
              onPress={() => {
                setPage(currentPage + 1);
                onPageChange();
              }}
            />
          </View>
        )}
        <View style={s.foot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="股息指标口径"
            onPress={() => setHelp((x) => !x)}
          >
            <Text style={s.link}>指标口径与来源 {help ? '收起' : '展开'}</Text>
          </Pressable>
          <Text style={s.meta}>
            {scope === 'hkreit'
              ? '维护名单10只'
              : scope === 'a'
                ? `沪深A股目录日 ${data?.directoryDate ?? '—'}`
                : '港股公司目录 · 源覆盖'}{' '}
            · 每60秒刷新
          </Text>
          {data && <Text style={s.meta}>{data.source}</Text>}
        </View>
      </Panel>
      {!!storageError && <Notice error text={storageError} />}
      {!!error && <Notice error text={error} />}
      {data && <Notice text={data.message} />}
      {help && (
        <Notice text="股息率、PE-TTM和PB直接取公开行情源扩展字段，报价与分红更新可能不同步。股息率为税前来源口径，可能受特别股息影响，不代表未来回报；每份股息仅在源明确提供时展示。PE为负可能表示亏损，REITs的利润受物业重估影响。五年平均股息率与估值温度缺少已核验完整历史，不用当前股息率代替，也不套用集思录私有模型。港股可有HKD、CNY两种报价币种，不跨币种计算净值折溢价。" />
      )}
      <IncomeFilterModal
        visible={panel}
        applied={filters}
        onClose={() => setPanel(false)}
        onApply={(f) => {
          apply(f);
          setPanel(false);
        }}
        count={(draft) =>
          items.filter(
            (i) =>
              (!needle || `${i.name} ${i.code} ${i.symbol}`.toLowerCase().includes(needle)) &&
              matchesIncomeFilters(i, quoteOf(i.symbol), draft, watchlist),
          ).length
        }
      />
    </View>
  );
}

function IncomeFilterModal({
  visible,
  applied,
  onClose,
  onApply,
  count,
}: {
  visible: boolean;
  applied: IncomeFilters;
  onClose: () => void;
  onApply: (f: IncomeFilters) => void;
  count: (f: IncomeFilters) => number;
}) {
  const [draft, setDraft] = useState(applied),
    [submitted, setSubmitted] = useState(false);
  const inset = useSafeAreaInsets();
  useEffect(() => {
    if (visible) {
      setDraft(JSON.parse(JSON.stringify(applied)));
      setSubmitted(false);
    }
  }, [visible]);
  const error = incomeFilterError(draft);
  return (
    <Modal visible={visible} onRequestClose={onClose} animationType="slide">
      <View
        style={{ flex: 1, backgroundColor: C.bg, paddingTop: inset.top }}
        testID="income-filter-panel"
      >
        <View style={s.titleRow}>
          <IconButton icon={ArrowLeft} label="关闭股息筛选" onPress={onClose} />
          <Text style={s.title}>设置筛选</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="重置股息草稿"
            onPress={() => {
              setDraft(emptyIncomeFilters());
              setSubmitted(false);
            }}
          >
            <Text style={s.link}>重置</Text>
          </Pressable>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 20, gap: 18 }}
        >
          <Text style={s.meta}>
            多个条件同时满足；上下限包含边界，留空不限。缺失指标不进入该指标筛选。价格按各证券的报价币种输入。
          </Text>
          {[
            { key: 'watchOnly' as const, label: '仅自选' },
            { key: 'profitableOnly' as const, label: '只看PE为正' },
          ].map((f) => (
            <Pressable
              key={f.key}
              accessibilityRole="checkbox"
              accessibilityLabel={f.label}
              accessibilityState={{ checked: draft[f.key] }}
              onPress={() => setDraft((p) => ({ ...p, [f.key]: !p[f.key] }))}
              style={s.chip}
            >
              <Text style={s.value}>
                {draft[f.key] ? '☑' : '□'} {f.label}
              </Text>
            </Pressable>
          ))}
          {INCOME_FIELDS.map((f) => (
            <View key={f.key} style={{ gap: 10 }}>
              <Text style={s.value}>
                {f.label}（{f.unit}）
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {(['min', 'max'] as const).map((side, i) => (
                  <React.Fragment key={side}>
                    {!!i && <Text style={s.meta}>至</Text>}
                    <TextInput
                      accessibilityLabel={`股息筛选${f.label}${side === 'min' ? '最低值' : '最高值'}`}
                      value={draft.ranges[f.key]?.[side] ?? ''}
                      placeholder={side === 'min' ? '最低不限' : '最高不限'}
                      placeholderTextColor={C.muted}
                      keyboardType={f.signed ? 'default' : 'decimal-pad'}
                      maxLength={30}
                      onChangeText={(value) =>
                        setDraft((p) => ({
                          ...p,
                          ranges: {
                            ...p.ranges,
                            [f.key]: {
                              min: p.ranges[f.key]?.min ?? '',
                              max: p.ranges[f.key]?.max ?? '',
                              [side]: value,
                            },
                          },
                        }))
                      }
                      style={[s.rangeInput, { flex: 1 }]}
                    />
                  </React.Fragment>
                ))}
              </View>
            </View>
          ))}
          {submitted && !!error && <Notice error text={error} />}
          <Text style={s.meta}>
            A股、港股和港股REITs分别保存上次应用的条件。关闭会放弃草稿，应用后自动保存到本机。
          </Text>
        </ScrollView>
        <View
          style={{
            padding: 16,
            paddingBottom: Math.max(inset.bottom, 16),
            backgroundColor: C.card,
          }}
        >
          <Button
            label={`应用股息筛选（${error ? '—' : count(draft)}只）`}
            onPress={() => {
              setSubmitted(true);
              if (!error) onApply(draft);
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  titleRow: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  title: { fontSize: 17, fontWeight: '700', color: C.ink },
  meta: { fontSize: 11, color: C.muted, lineHeight: 17 },
  link: { fontSize: 12, color: C.primary, fontWeight: '600' },
  banner: {
    marginHorizontal: 12,
    padding: 12,
    backgroundColor: C.bg,
    borderRadius: 8,
    gap: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  bannerText: { fontSize: 12, color: C.ink },
  temperature: { fontSize: 11, color: C.muted },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  search: {
    marginHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    backgroundColor: C.bg,
    borderRadius: 8,
  },
  input: { flex: 1, height: 40, color: C.ink, fontSize: 13, outlineWidth: 0 } as any,
  chips: { padding: 14, gap: 8 },
  chip: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 7, backgroundColor: C.bg },
  selected: { backgroundColor: C.soft },
  chipText: { fontSize: 12, color: C.muted },
  summary: { paddingHorizontal: 14, paddingBottom: 12, gap: 8, flexDirection: 'row' },
  names: { width: 126, borderRightWidth: 1, borderColor: C.line },
  header: {
    height: 48,
    backgroundColor: '#f7f9f9',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  nameRow: {
    height: 64,
    paddingHorizontal: 12,
    justifyContent: 'center',
    gap: 5,
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  name: { fontSize: 13, fontWeight: '600', color: C.ink },
  code: { fontSize: 10, color: C.muted, marginTop: 4 },
  dataRow: { height: 64, flexDirection: 'row', borderBottomWidth: 1, borderColor: C.line },
  cell: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  value: { fontSize: 13, color: C.ink, fontVariant: ['tabular-nums'] },
  zebra: { backgroundColor: '#fcfdfd' },
  pagination: {
    padding: 14,
    gap: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  foot: { padding: 14, gap: 7 },
  rangeInput: {
    minWidth: 0,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    backgroundColor: C.card,
    height: 46,
    paddingHorizontal: 12,
    color: C.ink,
    fontSize: 14,
  },
});
