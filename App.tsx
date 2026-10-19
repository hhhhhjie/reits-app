import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  LayoutGrid,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  UserRound,
} from 'lucide-react-native';
import Svg, { Defs, LinearGradient, Line, Path, Rect, Stop } from 'react-native-svg';
import type { Quote } from './shared/types';
import { INDICES, findInstrument } from './shared/catalog';
import { C, percent, price, quoteTime } from './src/theme';
import { useFullMarkets, useMarket, usePreferences } from './src/hooks';
import { IconButton, ModeBadge, Notice, Panel } from './src/components';
import DataScreen from './src/DataScreen';
import QuoteList from './src/QuoteList';
import SearchModal from './src/SearchModal';
import DetailModal from './src/DetailModal';
import SettingsScreen from './src/SettingsScreen';

type Tab = 'watch' | 'markets' | 'data' | 'settings';
const TABS = [
  { key: 'watch', label: '自选', icon: Star },
  { key: 'markets', label: '行情', icon: BarChart3 },
  { key: 'data', label: '数据', icon: LayoutGrid },
  { key: 'settings', label: '我的', icon: UserRound },
] as const;

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Home />
    </SafeAreaProvider>
  );
}

function Home() {
  const pref = usePreferences();
  const market = useMarket(pref.watchlist, pref.ready, pref.endpoint);
  const fullMarkets = useFullMarkets(pref.ready, pref.endpoint);
  const refresh = () => Promise.allSettled([market.refresh(), fullMarkets.refresh()]);
  const [tab, setTab] = useState<Tab>('data');
  const [searching, setSearching] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [guide, setGuide] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scroll = useRef<ScrollView>(null);
  const { width } = useWindowDimensions();
  const wide = width >= 1020;
  const inset = useSafeAreaInsets();
  const quotes = useMemo(() => {
    const merged: Record<string, Quote> = {};
    const realUniverseSymbols = new Set(
      Object.values(fullMarkets.data)
        .filter((data) => data?.mode !== 'demo')
        .flatMap(
          (data) =>
            data?.items.flatMap((item) =>
              item.underlying ? [item.symbol, item.underlying] : [item.symbol],
            ) ?? [],
        ),
    );
    for (const q of [
      ...(market.data?.quotes ?? []),
      ...(fullMarkets.data.bond?.quotes ?? []),
      ...(fullMarkets.data.reit?.quotes ?? []),
    ]) {
      if (q.source === 'demo' && realUniverseSymbols.has(q.symbol)) continue;
      const previous = merged[q.symbol];
      if (
        !previous ||
        (previous.source === 'demo' && q.source !== 'demo') ||
        (previous.source === q.source && (q.timestamp ?? '') >= (previous.timestamp ?? ''))
      )
        merged[q.symbol] = q;
    }
    return merged;
  }, [market.data, fullMarkets.data]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    document.title = '知行行情 · A股、港股与投资数据';
    const keydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2400);
  }
  function toggle(symbol: string) {
    if (!pref.watchlist.includes(symbol) && pref.watchlist.length >= 50) {
      notify('本机最多保存50个自选，请先移除部分证券');
      return;
    }
    const exists = pref.watchlist.includes(symbol);
    pref.setWatchlist((previous) =>
      previous.includes(symbol) ? previous.filter((s) => s !== symbol) : [...previous, symbol],
    );
    notify(exists ? '已从自选移除' : '已加入我的自选');
  }
  function changeTab(value: Tab) {
    setTab(value);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  function open(symbol: string) {
    setSearching(false);
    setDetail(symbol);
  }
  const common = {
    quotes,
    watchlist: pref.watchlist,
    onOpen: open,
    onToggle: toggle,
    onSearch: () => setSearching(true),
    loading: market.loading,
  };
  const stocks = Object.values(quotes).filter((q) => q.type === 'stock');
  const ups = stocks.filter((q) => q.changePercent > 0).length;
  const downs = stocks.filter((q) => q.changePercent < 0).length;
  return (
    <View style={[s.app, { paddingTop: inset.top }]}>
      <View style={s.headerOuter}>
        <View style={[s.header, !wide && { paddingHorizontal: 20, height: 64 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="知行行情首页"
            onPress={() => changeTab('data')}
            style={s.brand}
          >
            <View style={s.logo}>
              <View style={[s.logoBar, { height: 10 }]} />
              <View style={[s.logoBar, { height: 17 }]} />
              <View style={[s.logoBar, { height: 24 }]} />
            </View>
            <View>
              <Text style={s.brandName}>
                知行<Text style={{ color: C.primary }}>行情</Text>
              </Text>
              <Text style={s.brandSub}>Z H I X I N G</Text>
            </View>
          </Pressable>
          {wide && (
            <View style={s.topNav}>
              {TABS.map((item) => (
                <Pressable
                  key={item.key}
                  accessibilityRole="tab"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: tab === item.key }}
                  onPress={() => changeTab(item.key)}
                  style={[s.topNavItem, tab === item.key && { borderBottomColor: C.primary }]}
                >
                  <Text
                    style={[
                      s.topNavText,
                      tab === item.key && { color: C.primary, fontWeight: '700' },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          <View style={s.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="打开搜索"
              onPress={() => setSearching(true)}
              style={[
                s.searchButton,
                !wide && { width: 39, paddingHorizontal: 10, backgroundColor: C.bg },
              ]}
            >
              <Search size={17} color={C.muted} />
              {wide && (
                <>
                  <Text style={s.searchHint}>搜索名称 / 代码 / 拼音</Text>
                  <Text style={s.shortcut}>⌘ K</Text>
                </>
              )}
            </Pressable>
            {wide && (
              <IconButton icon={CircleHelp} label="使用指南" onPress={() => setGuide((v) => !v)} />
            )}
          </View>
        </View>
      </View>
      <ScrollView
        ref={scroll}
        refreshControl={
          <RefreshControl
            refreshing={market.loading && !!market.data}
            onRefresh={() => {
              void refresh();
            }}
            tintColor={C.primary}
          />
        }
        contentContainerStyle={{ paddingBottom: wide ? 30 : 20 }}
      >
        <View style={[s.body, !wide && { paddingHorizontal: 16, paddingTop: 16, gap: 14 }]}>
          {tab !== 'settings' && (wide || tab !== 'data') && (
            <>
              <View style={[s.hero, !wide && { padding: 20, minHeight: 105 }]}>
                <View style={{ zIndex: 1, flex: 1 }}>
                  <View style={[s.heroKicker, !wide && { display: 'none' }]}>
                    <View style={s.heroDot} />
                    <Text style={s.heroKickerText}>数据有据 · 投资有度</Text>
                  </View>
                  <Text style={[s.heroTitle, !wide && { fontSize: 23 }]}>看见数据，发现价值。</Text>
                  <Text style={[s.heroDescription, !wide && { maxWidth: 235 }]}>
                    连接 A 股与港股，让每一次判断更有依据。
                  </Text>
                </View>
                <View
                  pointerEvents="none"
                  style={[s.heroArt, !wide && { opacity: 0.36, right: -40, width: 195 }]}
                >
                  <HeroArt />
                </View>
              </View>
              <View style={s.indexHead}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={s.miniSectionTitle}>市场速览</Text>
                  <ModeBadge mode={market.data?.mode} />
                </View>
                <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
                  <Clock3 size={11} color={C.muted} />
                  <Text style={s.refreshLabel}>15秒刷新</Text>
                  <IconButton
                    icon={RefreshCw}
                    size={13}
                    label="刷新市场行情"
                    onPress={() => {
                      void refresh();
                    }}
                  />
                </View>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.indexList}
              >
                {INDICES.slice(0, wide ? 6 : 5).map((index) => {
                  const q = quotes[index.symbol];
                  return (
                    <Pressable
                      key={index.symbol}
                      accessibilityRole="button"
                      accessibilityLabel={`查看${index.name}`}
                      onPress={() => open(index.symbol)}
                      style={[s.indexCard, wide && { width: 166 }]}
                    >
                      <View style={s.indexNameRow}>
                        <Text style={s.indexName}>{index.name}</Text>
                        <ArrowUpRight
                          size={12}
                          color={q ? (q.changePercent >= 0 ? C.up : C.down) : C.muted}
                        />
                      </View>
                      <Text
                        style={[
                          s.indexPrice,
                          { color: q ? (q.changePercent >= 0 ? C.up : C.down) : C.ink },
                        ]}
                      >
                        {price(q?.price)}
                      </Text>
                      <View style={s.indexChangeRow}>
                        <Text
                          style={[
                            s.indexChange,
                            { color: q ? (q.changePercent >= 0 ? C.up : C.down) : C.muted },
                          ]}
                        >
                          {percent(q?.changePercent)}
                        </Text>
                        <Text style={s.indexTime}>
                          {q?.source === 'demo'
                            ? '演示快照'
                            : q?.timestamp
                              ? quoteTime(q.timestamp)
                              : '等待报价'}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          )}
          {!!market.error && (
            <Notice
              error
              text={`${market.error} 可在「我的」中检查服务地址。`}
              onPress={() => {
                void refresh();
              }}
            />
          )}
          {market.data?.mode === 'demo' && (
            <Notice error text="演示模式 · 行情源暂不可达，价格为固定样本，不代表当前市场。" />
          )}
          {market.data?.mode === 'cached' && (
            <Notice error text="连接中断 · 当前为上次成功获取的行情，请留意每条报价时间。" />
          )}
          {!!pref.storageError && <Notice error text={pref.storageError} />}
          {guide && (
            <Notice text="在「数据」切换投资品种，点击表头排序；横向滑动查看更多指标。点击名称查看日线走势，点星标加入自选。转债详情可填写转股价计算溢价与双低值。" />
          )}
          <View style={[s.columns, !wide && { gap: 0 }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              {tab === 'data' ? (
                <DataScreen
                  {...common}
                  conversions={pref.conversions}
                  universes={fullMarkets.data}
                  universeLoading={fullMarkets.loading}
                  onRefresh={() => {
                    void refresh();
                  }}
                  endpoint={pref.endpoint}
                  onPageChange={() => scroll.current?.scrollTo({ y: 0, animated: false })}
                />
              ) : tab === 'watch' || tab === 'markets' ? (
                <QuoteList key={tab} {...common} onlyWatchlist={tab === 'watch'} />
              ) : (
                <SettingsScreen
                  mode={market.data?.mode}
                  endpoint={pref.endpoint}
                  onSave={pref.saveEndpoint}
                  watchCount={pref.watchlist.length}
                  refresh={() => {
                    void refresh();
                  }}
                />
              )}
            </View>
            {wide && (
              <View style={s.aside}>
                <Panel style={{ padding: 20 }}>
                  <View style={s.asideHeading}>
                    <Text style={s.asideTitle}>我的观察</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="添加观察证券"
                      onPress={() => setSearching(true)}
                    >
                      <Plus size={17} color={C.primary} />
                    </Pressable>
                  </View>
                  {pref.watchlist.slice(0, 5).map((symbol) => {
                    const q = quotes[symbol];
                    return (
                      <Pressable
                        key={symbol}
                        accessibilityRole="button"
                        accessibilityLabel={`观察${q?.name || findInstrument(symbol).name}`}
                        onPress={() => open(symbol)}
                        style={s.watchRow}
                      >
                        <View style={{ gap: 6, flex: 1 }}>
                          <Text style={s.watchName} numberOfLines={1}>
                            {q?.name || findInstrument(symbol).name}
                          </Text>
                          <Text style={s.watchCode}>{symbol.slice(2)}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 6 }}>
                          <Text style={s.watchPrice}>{price(q?.price)}</Text>
                          <Text
                            style={[
                              s.watchChange,
                              { color: q ? (q.changePercent >= 0 ? C.up : C.down) : C.muted },
                            ]}
                          >
                            {percent(q?.changePercent)}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => changeTab('watch')}
                    style={s.viewAll}
                  >
                    <Text style={s.viewAllText}>查看全部自选</Text>
                    <ArrowRight size={13} color={C.primary} />
                  </Pressable>
                </Panel>
                <Panel style={{ padding: 20 }}>
                  <Text style={s.asideTitle}>目录内个股涨跌</Text>
                  <Text style={s.asideDescription}>精选目录样本 · 非全市场统计</Text>
                  <View style={s.breadth}>
                    <View style={{ gap: 5 }}>
                      <Text style={[s.breadthNumber, { color: C.up }]}>{ups}</Text>
                      <Text style={s.watchCode}>上涨</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 5 }}>
                      <Text style={[s.breadthNumber, { color: C.down }]}>{downs}</Text>
                      <Text style={s.watchCode}>下跌</Text>
                    </View>
                  </View>
                  <View style={s.breadthBar}>
                    <View
                      style={{
                        width: `${(ups / (ups + downs || 1)) * 100}%`,
                        backgroundColor: C.up,
                        height: 5,
                      }}
                    />
                    <View style={{ flex: 1, backgroundColor: C.down, height: 5 }} />
                  </View>
                </Panel>
                <View style={s.tipCard}>
                  <ShieldCheck size={23} color={C.primary} strokeWidth={1.4} />
                  <Text style={s.tipTitle}>保持耐心，也保持好奇</Text>
                  <Text style={s.tipText}>
                    价格是一时的刻度，价值是长期的思考。多一份数据，多一份从容。
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setGuide((v) => !v)}
                    style={s.tipLink}
                  >
                    <Text style={s.viewAllText}>了解数据指标</Text>
                    <ChevronRight size={13} color={C.primary} />
                  </Pressable>
                </View>
              </View>
            )}
          </View>
          <View style={s.pageFooter}>
            <Text style={s.footerBrand}>知行行情</Text>
            <Text style={s.footerText}>以数据为起点，以思考为方向</Text>
            <Text style={s.footerSmall}>行情时间以源数据为准 · 港股可能延迟</Text>
          </View>
        </View>
      </ScrollView>
      {!wide && (
        <View style={[s.bottomNav, { paddingBottom: Math.max(inset.bottom, 10) }]}>
          {TABS.map((item) => {
            const Icon = item.icon;
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === item.key }}
                accessibilityLabel={item.label}
                key={item.key}
                onPress={() => changeTab(item.key)}
                style={s.bottomItem}
              >
                <View style={[s.bottomIconWrap, tab === item.key && { backgroundColor: C.soft }]}>
                  <Icon
                    size={21}
                    strokeWidth={tab === item.key ? 2.1 : 1.6}
                    color={tab === item.key ? C.primary : '#8c9d96'}
                  />
                </View>
                <Text
                  style={[
                    s.bottomLabel,
                    tab === item.key && { color: C.primary, fontWeight: '600' },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {!!toast && (
        <View pointerEvents="none" style={[s.toastWrap, { bottom: wide ? 28 : 95 + inset.bottom }]}>
          <View style={s.toast}>
            <Check size={15} color="#fff" />
            <Text accessibilityRole="alert" style={s.toastText}>
              {toast}
            </Text>
          </View>
        </View>
      )}
      <SearchModal
        visible={searching}
        onClose={() => setSearching(false)}
        watchlist={pref.watchlist}
        onToggle={toggle}
        onOpen={open}
      />
      <DetailModal
        mode={
          Object.values(fullMarkets.data).find((data) =>
            data?.items.some((item) => item.symbol === detail),
          )?.mode ?? market.data?.mode
        }
        symbol={detail}
        quotes={quotes}
        item={
          detail
            ? [
                ...(fullMarkets.data.bond?.items ?? []),
                ...(fullMarkets.data.reit?.items ?? []),
              ].find((item) => item.symbol === detail)
            : undefined
        }
        watchlist={pref.watchlist}
        conversions={pref.conversions}
        onClose={() => setDetail(null)}
        onToggle={toggle}
        onRefresh={() => {
          void refresh();
        }}
        onConversion={(symbol, value) =>
          pref.setConversions((previous) => {
            const next = { ...previous };
            if (value == null) delete next[symbol];
            else next[symbol] = value;
            return next;
          })
        }
      />
    </View>
  );
}

function HeroArt() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 350 170">
      <Defs>
        <LinearGradient id="heroGlow" x1="0" x2="1">
          <Stop offset="0" stopColor="#74b5a2" stopOpacity="0.08" />
          <Stop offset="1" stopColor="#81caae" stopOpacity="0.45" />
        </LinearGradient>
      </Defs>
      {[40, 80, 120, 160].map((y) => (
        <Line key={y} x1="20" y1={y} x2="340" y2={y} stroke="#d8e9df" strokeDasharray="3 7" />
      ))}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((value, i) => (
        <Rect
          key={i}
          x={45 + i * 33}
          y={130 - [35, 46, 39, 68, 60, 87, 92, 118][i]}
          width="17"
          height={[35, 46, 39, 68, 60, 87, 92, 118][i]}
          rx="4"
          fill="url(#heroGlow)"
        />
      ))}
      <Path
        d="M24 135L65 117L102 128L145 83L182 97L223 55L265 68L319 20"
        fill="none"
        stroke="#66aa8d"
        strokeWidth="2"
      />
      <Path d="M305 20L319 20L319 34" fill="none" stroke="#66aa8d" strokeWidth="2" />
      <Rect x="207" y="97" width="111" height="47" rx="10" fill="#fff" opacity="0.8" />
      <Path d="M223 122L233 112L244 118L259 105" fill="none" stroke="#087f70" strokeWidth="2" />
      <Line
        x1="271"
        y1="113"
        x2="301"
        y2="113"
        stroke="#bfd7ca"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <Line
        x1="271"
        y1="125"
        x2="291"
        y2="125"
        stroke="#e0eae3"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </Svg>
  );
}

const s = StyleSheet.create({
  app: { flex: 1, backgroundColor: C.bg },
  headerOuter: { backgroundColor: C.card, borderBottomWidth: 1, borderColor: C.line },
  header: {
    width: '100%',
    maxWidth: 1200,
    paddingHorizontal: 30,
    height: 78,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 20,
  },
  brand: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  logo: {
    width: 37,
    height: 37,
    backgroundColor: C.primary,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 3,
    paddingBottom: 8,
  },
  logoBar: { width: 4, borderRadius: 2, backgroundColor: '#e8f5df' },
  brandName: { fontSize: 19, fontWeight: '700', letterSpacing: 1 },
  brandSub: { fontSize: 7, color: C.muted, marginTop: 4 },
  topNav: { flexDirection: 'row', gap: 36, height: '100%', marginLeft: 26, flex: 1 },
  topNavItem: {
    justifyContent: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    paddingHorizontal: 4,
  },
  topNavText: { color: '#73867d', fontSize: 14 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 38,
    paddingHorizontal: 13,
    backgroundColor: C.bg,
    borderRadius: 9,
    width: 256,
  },
  searchHint: { fontSize: 11, color: '#8c9e96', flex: 1 },
  shortcut: { fontSize: 9, color: '#9cadA4', padding: 3, backgroundColor: '#fff', borderRadius: 4 },
  body: {
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
    paddingHorizontal: 30,
    paddingTop: 27,
    gap: 17,
  },
  hero: {
    borderRadius: 17,
    backgroundColor: '#e8f0e7',
    minHeight: 166,
    padding: 30,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  heroKicker: { flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 12 },
  heroDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.primary },
  heroKickerText: { color: '#638872', fontSize: 10, letterSpacing: 1.4 },
  heroTitle: { color: '#214e40', fontSize: 29, letterSpacing: 1, fontWeight: '600' },
  heroDescription: { color: '#7c9987', fontSize: 11, marginTop: 12, lineHeight: 20 },
  heroArt: { width: 340, height: 160, position: 'absolute', right: 40, top: 4 },
  indexHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: -14,
  },
  miniSectionTitle: { fontSize: 13, color: C.ink, fontWeight: '600' },
  refreshLabel: { fontSize: 9, color: C.muted },
  indexList: { gap: 10, paddingBottom: 2 },
  indexCard: {
    width: 152,
    borderRadius: 12,
    padding: 15,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
  },
  indexNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  indexName: { fontSize: 11, color: '#658074' },
  indexPrice: {
    fontSize: 20,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginTop: 11,
    letterSpacing: -0.4,
  },
  indexChangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 7,
  },
  indexChange: { fontSize: 10, fontWeight: '500', fontVariant: ['tabular-nums'] },
  indexTime: { fontSize: 8, color: '#9baea3' },
  columns: { flexDirection: 'row', gap: 22, marginTop: 6 },
  aside: { width: 264, gap: 18, paddingTop: 63 },
  asideHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  asideTitle: { fontSize: 14, fontWeight: '600', color: C.ink },
  watchRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  watchName: { fontSize: 11, fontWeight: '500', color: C.ink },
  watchCode: { fontSize: 9, color: C.muted },
  watchPrice: { fontSize: 12, color: C.ink, fontVariant: ['tabular-nums'] },
  watchChange: { fontSize: 10, fontVariant: ['tabular-nums'] },
  viewAll: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 16,
  },
  viewAllText: { color: C.primary, fontSize: 10 },
  asideDescription: { fontSize: 9, color: C.muted, marginTop: 9 },
  breadth: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 17 },
  breadthNumber: { fontSize: 25, fontWeight: '600' },
  breadthBar: { flexDirection: 'row', height: 5, gap: 4, borderRadius: 3, overflow: 'hidden' },
  tipCard: { backgroundColor: '#eaf1e9', borderRadius: 15, padding: 23, gap: 14 },
  tipTitle: { fontSize: 14, fontWeight: '600', color: '#386550' },
  tipText: { fontSize: 11, lineHeight: 21, color: '#799381' },
  tipLink: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pageFooter: { alignItems: 'center', gap: 7, paddingTop: 22, paddingBottom: 14 },
  footerBrand: { fontSize: 12, fontWeight: '600', color: '#9aafa2', letterSpacing: 1 },
  footerText: { fontSize: 9, color: '#a8b8af' },
  footerSmall: { fontSize: 8, color: '#b0bfb6' },
  bottomNav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    paddingTop: 7,
  },
  bottomItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 48 },
  bottomIconWrap: {
    width: 43,
    height: 28,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomLabel: { fontSize: 9, color: '#83988d' },
  toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  toast: {
    backgroundColor: '#244a3e',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 13,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  toastText: { fontSize: 12, color: '#fff' },
});
