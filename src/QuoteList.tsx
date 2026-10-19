import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowDownUp, ChevronRight, Plus, Star } from 'lucide-react-native';
import { CATALOG } from '../shared/catalog';
import type { Quote } from '../shared/types';
import { C, percent, price } from './theme';
import { EmptyState, Panel } from './components';

export default function QuoteList({
  quotes,
  watchlist,
  onOpen,
  onToggle,
  onSearch,
  onlyWatchlist = false,
  loading,
}: {
  quotes: Record<string, Quote>;
  watchlist: string[];
  onOpen: (symbol: string) => void;
  onToggle: (symbol: string) => void;
  onSearch: () => void;
  onlyWatchlist?: boolean;
  loading: boolean;
}) {
  const [market, setMarket] = useState('全部');
  const [sort, setSort] = useState<'default' | 'up' | 'down'>('default');
  const rows = useMemo(() => {
    const symbols = onlyWatchlist
      ? watchlist
      : CATALOG.filter((x) => x.type === 'stock').map((x) => x.symbol);
    const list = symbols
      .flatMap((s) => (quotes[s] ? [quotes[s]] : []))
      .filter(
        (q) => market === '全部' || (market === '港股' ? q.market === 'HK' : q.market !== 'HK'),
      );
    if (sort !== 'default')
      list.sort((a, b) => (b.changePercent - a.changePercent) * (sort === 'up' ? 1 : -1));
    return list;
  }, [quotes, watchlist, onlyWatchlist, market, sort]);
  return (
    <View style={{ gap: 18 }}>
      <View style={s.header}>
        <View>
          <Text style={s.eyebrow}>{onlyWatchlist ? 'YOUR WATCHLIST' : 'MARKET OVERVIEW'}</Text>
          <Text style={s.heading}>
            {onlyWatchlist ? '我的自选' : '沪深 · 港股'}
            <Text style={{ color: C.primary }}>.</Text>
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="搜索并添加自选"
          onPress={onSearch}
          style={s.addButton}
        >
          <Plus size={16} color={C.primary} />
          <Text style={s.addText}>添加自选</Text>
        </Pressable>
      </View>
      <Panel>
        <View style={s.controls}>
          <View style={s.tabs}>
            {['全部', 'A股', '港股'].map((item) => (
              <Pressable
                key={item}
                accessibilityRole="tab"
                accessibilityState={{ selected: market === item }}
                accessibilityLabel={`${item}行情`}
                onPress={() => setMarket(item)}
                style={[s.tab, market === item && { borderBottomColor: C.primary }]}
              >
                <Text
                  style={[s.tabText, market === item && { color: C.primary, fontWeight: '600' }]}
                >
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="切换涨跌幅排序"
            onPress={() =>
              setSort((v) => (v === 'default' ? 'up' : v === 'up' ? 'down' : 'default'))
            }
            style={s.sort}
          >
            <ArrowDownUp size={13} color={C.muted} />
            <Text style={s.sortText}>
              {sort === 'default' ? '默认排序' : sort === 'up' ? '涨幅优先' : '跌幅优先'}
            </Text>
          </Pressable>
        </View>
        <View style={s.tableHead}>
          <Text style={[s.headerText, { flex: 1 }]}>名称 / 代码</Text>
          <Text style={[s.headerText, s.priceColumn]}>最新价</Text>
          <Text style={[s.headerText, s.changeColumn]}>涨跌幅</Text>
          <View style={{ width: 29 }} />
        </View>
        {rows.map((q) => (
          <View key={q.symbol} style={s.row}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`查看${q.name}`}
              onPress={() => onOpen(q.symbol)}
              style={s.nameColumn}
            >
              <Text style={s.name} numberOfLines={1}>
                {q.name}
              </Text>
              <View style={s.codeRow}>
                <Text style={s.market}>{q.market}</Text>
                <Text style={s.code}>{q.code}</Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${q.name}详情`}
              onPress={() => onOpen(q.symbol)}
              style={s.priceColumn}
            >
              <Text style={s.price}>
                {price(q.price, ['stock', 'index'].includes(q.type) ? 2 : 3)}
              </Text>
              <Text style={s.currency}>{q.currency === 'HKD' ? 'HKD' : 'CNY'}</Text>
            </Pressable>
            <View
              style={[
                s.changePill,
                { backgroundColor: q.changePercent >= 0 ? '#fdf0ed' : '#eaf6f0' },
              ]}
            >
              <Text style={[s.change, { color: q.changePercent >= 0 ? C.up : C.down }]}>
                {percent(q.changePercent)}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${watchlist.includes(q.symbol) ? '移除' : '添加'}${q.name}自选`}
              onPress={() => onToggle(q.symbol)}
              style={s.star}
            >
              <Star
                size={15}
                color={watchlist.includes(q.symbol) ? C.primary : '#cad6d1'}
                fill={watchlist.includes(q.symbol) ? C.primary : 'transparent'}
              />
            </Pressable>
          </View>
        ))}
        {!rows.length && (
          <EmptyState
            title={
              loading ? '正在获取行情' : onlyWatchlist ? '把关注的机会放在这里' : '暂无可用行情'
            }
            description={
              onlyWatchlist
                ? '搜索名称、代码或拼音，点击星标即可添加。自选列表会保存在本机。'
                : '请检查行情服务连接，或切换市场。'
            }
            loading={loading}
            action="搜索证券"
            onAction={onSearch}
          />
        )}
        <View style={s.footer}>
          <Text style={s.footerText}>
            {onlyWatchlist
              ? `本机自选 · ${rows.length}只`
              : `精选股票 · ${rows.length}只 · 非全市场排名`}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onSearch}
            style={{ flexDirection: 'row', alignItems: 'center' }}
          >
            <Text style={s.footerLink}>搜索更多</Text>
            <ChevronRight size={12} color={C.primary} />
          </Pressable>
        </View>
      </Panel>
    </View>
  );
}
const s = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  eyebrow: { fontSize: 9, letterSpacing: 2, color: C.muted, marginBottom: 7, fontWeight: '600' },
  heading: { fontSize: 23, fontWeight: '700', color: C.ink },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 9,
    backgroundColor: C.soft,
  },
  addText: { fontSize: 11, color: C.primary, fontWeight: '500' },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  tabs: { flexDirection: 'row', gap: 21 },
  tab: { paddingVertical: 17, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 13, color: C.muted },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sortText: { fontSize: 10, color: C.muted },
  tableHead: {
    backgroundColor: '#f8faf9',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  headerText: { fontSize: 10, color: C.muted },
  priceColumn: { width: 85, alignItems: 'flex-end', textAlign: 'right', paddingRight: 14 },
  changeColumn: { width: 75, textAlign: 'right', marginRight: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 17,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  nameColumn: { flex: 1, gap: 5, paddingRight: 4 },
  name: { fontSize: 13, fontWeight: '600', color: C.ink },
  codeRow: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  market: {
    fontSize: 8,
    color: C.primary,
    paddingHorizontal: 3,
    paddingVertical: 1,
    backgroundColor: C.soft,
    borderRadius: 2,
  },
  code: { fontSize: 10, color: C.muted, fontVariant: ['tabular-nums'] },
  price: { color: C.ink, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  currency: { fontSize: 8, color: C.muted, marginTop: 4 },
  changePill: {
    width: 75,
    paddingVertical: 9,
    borderRadius: 6,
    alignItems: 'center',
    marginRight: 8,
  },
  change: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  star: { width: 29, minHeight: 40, alignItems: 'flex-end', justifyContent: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', padding: 17 },
  footerText: { fontSize: 10, color: C.muted },
  footerLink: { fontSize: 11, color: C.primary },
});
