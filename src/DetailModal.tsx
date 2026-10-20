import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowUpRight, RefreshCw, Star } from 'lucide-react-native';
import type {
  DataMode,
  HistoryResponse,
  Quote,
  UniverseItem,
  ReitMetricsResponse,
} from '../shared/types';
import { METRIC_GROUPS, marketMetric } from '../shared/market-metrics';
import { demoHistory } from '../shared/demo';
import { findInstrument } from '../shared/catalog';
import { bondValuation } from '../shared/valuation';
import { api } from './api';
import { C, compact, percent, price, quoteTime } from './theme';
import { Button, EmptyState, IconButton, ModeBadge, Notice, Panel } from './components';
import Chart from './Chart';
import { formatMetric } from './UniverseTable';

export default function DetailModal({
  symbol,
  quotes,
  item,
  watchlist,
  conversions,
  mode,
  onClose,
  onToggle,
  onConversion,
  onRefresh,
}: {
  symbol: string | null;
  quotes: Record<string, Quote>;
  item?: UniverseItem;
  watchlist: string[];
  conversions: Record<string, number>;
  mode?: DataMode;
  onClose: () => void;
  onToggle: (symbol: string) => void;
  onConversion: (symbol: string, value: number | null) => void;
  onRefresh: () => void;
}) {
  const [extra, setExtra] = useState<Quote | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [conversion, setConversion] = useState('');
  const [feedback, setFeedback] = useState('');
  const [fundamentals, setFundamentals] = useState<ReitMetricsResponse | null>(null);
  const inset = useSafeAreaInsets();
  useEffect(() => {
    if (!symbol) return;
    setConversion(conversions[symbol]?.toString() ?? '');
    setFeedback('');
  }, [symbol]);
  useEffect(() => {
    setExtra(null);
    setHistory(null);
    if (!symbol) return;
    let active = true;
    setLoading(true);
    Promise.allSettled([api.quotes([symbol]), api.history(symbol)])
      .then(([quoteResult, historyResult]) => {
        if (!active) return;
        if (quoteResult.status === 'fulfilled') setExtra(quoteResult.value.quotes[0] ?? null);
        if (historyResult.status === 'fulfilled') setHistory(historyResult.value);
        else
          setHistory({ mode: 'demo', candles: demoHistory(symbol), message: '离线演示历史走势' });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [symbol, retry]);
  useEffect(() => {
    setFundamentals(null);
    if (!symbol || !/^(sh508\d{3}|sz180\d{3})$/.test(symbol)) return;
    let active = true;
    api
      .reitMetrics(symbol)
      .then((result) => {
        if (active) setFundamentals(result);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [symbol, retry]);
  const quote = symbol ? (quotes[symbol] ?? extra) : null;
  const instrument = symbol ? (item ?? quote ?? findInstrument(symbol)) : null;
  const rising = (quote?.changePercent ?? 0) >= 0;
  const color = rising ? C.up : C.down;
  const valuation = quote
    ? bondValuation(
        quote,
        (item?.underlying ?? quote.underlying)
          ? quotes[(item?.underlying ?? quote.underlying)!]
          : undefined,
        (symbol ? conversions[symbol] : undefined) ?? item?.bond?.conversionPrice ?? undefined,
      )
    : null;
  function saveConversion() {
    if (!symbol) return;
    if (!conversion.trim()) {
      onConversion(symbol, null);
      setFeedback('已清除转股价参数');
      return;
    }
    const value = Number(conversion);
    if (!Number.isFinite(value) || value <= 0 || value > 100000) {
      setFeedback('请输入有效的正数转股价');
      return;
    }
    onConversion(symbol, value);
    setFeedback('已保存本机参数，请与最新公告核对');
  }
  return (
    <Modal
      visible={!!symbol}
      onRequestClose={onClose}
      animationType="slide"
      presentationStyle="fullScreen"
    >
      <View style={[s.screen, { paddingTop: inset.top }]}>
        <View style={s.inner}>
          <View style={s.header}>
            <IconButton icon={ArrowLeft} label="关闭详情" onPress={onClose} />
            <View style={{ flex: 1 }}>
              <Text style={s.headerName}>{instrument?.name || '证券详情'}</Text>
              <Text style={s.code}>
                {instrument?.market} · {instrument?.code}
              </Text>
            </View>
            {loading ? (
              <ActivityIndicator size="small" color={C.primary} />
            ) : (
              <IconButton
                icon={RefreshCw}
                label="刷新详情"
                onPress={() => {
                  setRetry((v) => v + 1);
                  onRefresh();
                }}
              />
            )}
            <IconButton
              icon={Star}
              label={symbol && watchlist.includes(symbol) ? '移除自选' : '加入自选'}
              active={!!symbol && watchlist.includes(symbol)}
              onPress={() => symbol && onToggle(symbol)}
            />
          </View>
          <ScrollView
            contentContainerStyle={{ paddingBottom: inset.bottom + 28 }}
            keyboardShouldPersistTaps="handled"
          >
            {quote ? (
              <>
                <View style={s.quoteBox}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.latestLabel}>
                      最新价 · {quote.currency === 'HKD' ? '港元 HKD' : '人民币 CNY'}
                    </Text>
                    <Text style={[s.bigPrice, { color }]}>
                      {price(quote.price, ['stock', 'index'].includes(quote.type) ? 2 : 3)}
                    </Text>
                    <View style={s.changeRow}>
                      <Text style={[s.change, { color }]}>
                        {quote.change > 0 ? '+' : ''}
                        {price(quote.change)}
                      </Text>
                      <Text style={[s.change, { color }]}>{percent(quote.changePercent)}</Text>
                      <ArrowUpRight
                        size={15}
                        color={color}
                        style={!rising ? { transform: [{ rotate: '90deg' }] } : undefined}
                      />
                    </View>
                  </View>
                  <ModeBadge
                    mode={quote.source === 'demo' ? 'demo' : mode === 'cached' ? 'cached' : 'live'}
                  />
                </View>
                <Text style={s.timestamp}>
                  报价时间：{quoteTime(quote.timestamp, true)}（北京时间）
                </Text>
                {quote.source === 'demo' && (
                  <View style={s.notice}>
                    <Notice
                      error
                      text="当前为固定演示快照，非实时行情。所有价格和走势仅用于体验功能。"
                    />
                  </View>
                )}
                {quote.market === 'HK' && quote.source !== 'demo' && (
                  <View style={s.notice}>
                    <Notice text="港股公开行情可能存在延迟，请以报价时间和交易所行情为准。" />
                  </View>
                )}
                <View style={s.metrics}>
                  {[
                    ['今开', price(quote.open)],
                    ['最高', price(quote.high)],
                    ['最低', price(quote.low)],
                    ['昨收', price(quote.previousClose)],
                    ['成交额', compact(quote.turnover)],
                    [
                      '换手率',
                      quote.turnoverRate == null ? '—' : `${quote.turnoverRate.toFixed(2)}%`,
                    ],
                    ['PE-TTM', price(quote.pe)],
                    ['PB', price(quote.pb)],
                    [
                      '股息率（源）',
                      quote.dividendYield == null ? '—' : `${quote.dividendYield.toFixed(2)}%`,
                    ],
                    ['每份股息（源）', price(quote.dividendPerShare, 4)],
                    ['总市值', compact(quote.marketCap)],
                    ['行情来源', quote.source === 'demo' ? '演示样本' : '腾讯公开行情'],
                  ].map(([label, value]) => (
                    <View key={label} style={s.metric}>
                      <Text style={s.metricLabel}>{label}</Text>
                      <Text style={s.metricValue}>{value}</Text>
                    </View>
                  ))}
                </View>
                <View style={s.chartHeader}>
                  <Text style={s.sectionTitle}>历史走势</Text>
                  {history && <ModeBadge mode={history.mode} />}
                </View>
                {loading && !history ? (
                  <EmptyState loading title="加载历史行情" description="正在获取日线数据" />
                ) : history &&
                  history.candles.length > 1 &&
                  (history.mode === 'demo') === (quote.source === 'demo') ? (
                  <Chart candles={history.candles} rising={rising} />
                ) : (
                  <EmptyState
                    title="历史行情暂不可用"
                    description="日线数据尚未成功获取，请稍后重试。"
                  />
                )}
                {quote.type === 'bond' && (
                  <View style={{ padding: 18, gap: 12 }}>
                    <Panel style={{ padding: 17 }}>
                      <Text style={s.sectionTitle}>转债估值参数</Text>
                      <Text style={s.helper}>
                        {item?.bond?.conversionPrice
                          ? `数据源现行转股价：${price(item.bond.conversionPrice)}元。`
                          : '暂未取得数据源转股价。'}
                        可填写本机修正值；清空保存后恢复使用数据源参数。请核对最新公告。
                      </Text>
                      <View style={s.conversionRow}>
                        <TextInput
                          accessibilityLabel="当前有效转股价"
                          keyboardType="decimal-pad"
                          placeholder="当前有效转股价（元）"
                          placeholderTextColor={C.muted}
                          value={conversion}
                          onChangeText={setConversion}
                          style={s.conversionInput}
                        />
                        <Button label="保存参数" onPress={saveConversion} />
                      </View>
                      {!!feedback && (
                        <Text accessibilityRole="alert" style={s.feedback}>
                          {feedback}
                        </Text>
                      )}
                      <View style={s.valuationRow}>
                        {[
                          ['转股价值', price(valuation?.conversionValue)],
                          ['转股溢价', percent(valuation?.premium)],
                          ['双低值', price(valuation?.doubleLow)],
                        ].map(([label, value]) => (
                          <View key={label} style={{ gap: 7 }}>
                            <Text style={s.metricLabel}>{label}</Text>
                            <Text style={[s.metricValue, { color: C.primary }]}>{value}</Text>
                          </View>
                        ))}
                      </View>
                      <Text style={s.helper}>
                        正股：
                        {item?.bond?.stockName ??
                          (quote.underlying ? findInstrument(quote.underlying).name : '—')}{' '}
                        · 缺少正股行情或有效转股价时不计算。空白保存可清除参数。
                      </Text>
                    </Panel>
                  </View>
                )}
              </>
            ) : (
              <EmptyState
                loading={loading}
                title={loading ? '正在获取报价' : '暂未取得该证券行情'}
                description="行情源不可达、代码不存在或证券已退市时无法提供报价。请稍后重试。"
                action="重新加载"
                onAction={() => setRetry((v) => v + 1)}
              />
            )}
            {item?.bond && (
              <View style={{ padding: 18, gap: 12 }}>
                <Text style={s.sectionTitle}>转债指标与条款</Text>
                <View style={s.metrics}>
                  {METRIC_GROUPS.bond
                    .flatMap((group) => group.columns)
                    .filter(
                      (column, index, all) => all.findIndex((c) => c.key === column.key) === index,
                    )
                    .map((column) => (
                      <View key={column.key} style={s.metric}>
                        <Text style={s.metricLabel}>{column.label}</Text>
                        <Text style={s.metricValue}>
                          {formatMetric(
                            marketMetric(
                              item,
                              column.key,
                              quotes,
                              symbol ? conversions[symbol] : undefined,
                            ),
                            column,
                          )}
                        </Text>
                      </View>
                    ))}
                </View>
                <Notice text="税前YTM按报价日的合同现金流估算，含末期利息，未扣税费；已披露赎回公告或条款不完整时不计算。发行规模不是剩余规模。强赎价不代表满足触发天数，公告请以交易所披露为准。" />
              </View>
            )}
            {(item?.type ?? quote?.type) === 'reit' && instrument?.market === 'HK' && (
              <View style={{ padding: 18 }}>
                <Notice text="港股REITs股息率及每份股息采用行情源口径，可能包含特别分派，不代表未来回报。当前未接入已核验的港股REITs披露净值，不以PB或交易价格反推；报价币种以本页CNY/HKD为准。" />
              </View>
            )}
            {(item?.type ?? quote?.type) === 'reit' && instrument?.market !== 'HK' && (
              <View style={{ padding: 18, gap: 12 }}>
                <Text style={s.sectionTitle}>净值与历史现金分派</Text>
                <View style={s.metrics}>
                  {METRIC_GROUPS.reit[1].columns.map((column) => (
                    <View key={column.key} style={s.metric}>
                      <Text style={s.metricLabel}>{column.label}</Text>
                      <Text style={s.metricValue}>
                        {formatMetric(
                          marketMetric(
                            (item ?? quote)!,
                            column.key,
                            quotes,
                            undefined,
                            fundamentals?.metrics ?? item?.reit,
                          ),
                          column,
                        )}
                      </Text>
                    </View>
                  ))}
                </View>
                <Notice
                  text={
                    fundamentals?.message ??
                    '正在补充现金分红历史；披露净值不是盘中IOPV，缺失指标不使用交易价格反推。'
                  }
                />
                <Notice text="净值分别来自腾讯基金/天天基金披露历史。历史现金分派率按近12个月明确现金分红记录÷现价计算，记录可能不完整，不是未来收益预测；分红记录日不等于到账日。" />
              </View>
            )}
          </ScrollView>
          <View style={[s.bottom, { paddingBottom: Math.max(inset.bottom, 12) }]}>
            <Button
              label={
                symbol && watchlist.includes(symbol) ? '已加入自选 · 点击移除' : '加入我的自选'
              }
              icon={Star}
              secondary={!!symbol && watchlist.includes(symbol)}
              onPress={() => symbol && onToggle(symbol)}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.card },
  inner: { flex: 1, width: '100%', maxWidth: 780, alignSelf: 'center' },
  header: {
    padding: 12,
    flexDirection: 'row',
    gap: 9,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  headerName: { fontSize: 15, fontWeight: '600', color: C.ink, marginBottom: 4 },
  code: { fontSize: 10, color: C.muted },
  quoteBox: {
    paddingHorizontal: 22,
    paddingTop: 26,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  latestLabel: { fontSize: 11, color: C.muted },
  bigPrice: {
    fontSize: 40,
    fontWeight: '600',
    marginTop: 7,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  changeRow: { flexDirection: 'row', gap: 14, alignItems: 'center', marginTop: 6 },
  change: { fontSize: 14, fontWeight: '500', fontVariant: ['tabular-nums'] },
  timestamp: { fontSize: 10, color: C.muted, paddingHorizontal: 22, marginVertical: 17 },
  notice: { paddingHorizontal: 18, paddingBottom: 12 },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 6,
    borderColor: C.bg,
  },
  metric: { width: '33.333%', paddingVertical: 12, gap: 7 },
  metricLabel: { fontSize: 10, color: C.muted },
  metricValue: { fontSize: 13, fontWeight: '500', color: C.ink, fontVariant: ['tabular-nums'] },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
  },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: C.ink },
  helper: { fontSize: 11, color: C.muted, lineHeight: 19, marginTop: 12 },
  conversionRow: { flexDirection: 'row', gap: 10, marginTop: 15 },
  conversionInput: {
    flex: 1,
    backgroundColor: C.bg,
    borderRadius: 9,
    paddingHorizontal: 11,
    fontSize: 12,
    minHeight: 43,
    color: C.ink,
  },
  feedback: { color: C.primary, fontSize: 11, marginTop: 9 },
  valuationRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  bottom: { padding: 15, paddingTop: 12, borderTopWidth: 1, borderColor: C.line },
});
