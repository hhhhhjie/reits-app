import React, { useEffect, useRef, useState } from 'react';
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
import { ArrowLeft, Search, Star, X } from 'lucide-react-native';
import { api } from './api';
import { CATALOG, searchCatalog } from '../shared/catalog';
import type { Instrument } from '../shared/types';
import { C } from './theme';
import { EmptyState, IconButton } from './components';

export default function SearchModal({
  visible,
  onClose,
  watchlist,
  onToggle,
  onOpen,
}: {
  visible: boolean;
  onClose: () => void;
  watchlist: string[];
  onToggle: (symbol: string) => void;
  onOpen: (symbol: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState('local');
  const inset = useSafeAreaInsets();
  const input = useRef<TextInput>(null);
  useEffect(() => {
    if (!visible) {
      setQuery('');
      return;
    }
    const focus = setTimeout(() => input.current?.focus(), 150);
    return () => clearTimeout(focus);
  }, [visible]);
  useEffect(() => {
    if (!visible) return;
    const value = query.trim();
    setScope('local');
    setResults(value ? searchCatalog(value) : []);
    if (!value) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .search(value)
        .then((data) => {
          if (active) {
            setResults(data.results);
            setScope(data.scope);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, visible]);
  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType="slide"
      presentationStyle="fullScreen"
    >
      <View style={[s.screen, { paddingTop: inset.top }]}>
        <View style={s.inner}>
          <View style={s.header}>
            <IconButton icon={ArrowLeft} label="关闭搜索" onPress={onClose} />
            <View style={s.inputWrap}>
              <Search size={17} color={C.muted} />
              <TextInput
                ref={input}
                accessibilityLabel="搜索证券"
                placeholder="名称 / 代码 / 拼音"
                placeholderTextColor="#a2afaa"
                value={query}
                onChangeText={setQuery}
                maxLength={40}
                autoCapitalize="none"
                autoCorrect={false}
                style={s.input}
                returnKeyType="search"
              />
              {!!query && (
                <IconButton icon={X} size={15} label="清空搜索" onPress={() => setQuery('')} />
              )}
            </View>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {!query.trim() ? (
              <View style={{ padding: 23 }}>
                <Text style={s.section}>热门搜索</Text>
                <View style={s.hotList}>
                  {['腾讯控股', '贵州茅台', '兴业转债', '沪深300', 'REIT'].map((label) => (
                    <Pressable
                      key={label}
                      accessibilityRole="button"
                      onPress={() => setQuery(label)}
                      style={s.hot}
                    >
                      <Text style={s.hotText}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={[s.section, { marginTop: 35 }]}>按代码查找</Text>
                <Text style={s.hint}>
                  A股输入6位代码，港股输入5位代码。支持中文名称和拼音缩写，如「腾讯」「txkg」。常用目录包含{' '}
                  {CATALOG.length} 个品种；远端可达时补充全市场结果。
                </Text>
              </View>
            ) : (
              <>
                <View style={s.resultsHeader}>
                  <Text style={s.resultsText}>
                    {scope === 'remote' ? '全市场搜索结果' : '常用目录匹配'} · {results.length}
                  </Text>
                  {loading && <ActivityIndicator size="small" color={C.primary} />}
                </View>
                {results.map((item) => (
                  <View key={item.symbol} style={s.row}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`搜索结果${item.name}`}
                      onPress={() => onOpen(item.symbol)}
                      style={{ flex: 1, gap: 6 }}
                    >
                      <Text style={s.name}>{item.name}</Text>
                      <Text style={s.code}>
                        {item.market} · {item.code}
                      </Text>
                    </Pressable>
                    <IconButton
                      icon={Star}
                      label={`${watchlist.includes(item.symbol) ? '移除' : '添加'}${item.name}自选`}
                      active={watchlist.includes(item.symbol)}
                      onPress={() => onToggle(item.symbol)}
                    />
                  </View>
                ))}
                {!results.length && (
                  <EmptyState
                    loading={loading}
                    title={loading ? '正在查询证券' : '没有找到匹配证券'}
                    description="试试准确名称或证券代码。行情源未连接时，仅能搜索本地常用目录。"
                  />
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.card },
  inner: { width: '100%', maxWidth: 760, alignSelf: 'center', flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  inputWrap: {
    flex: 1,
    backgroundColor: C.bg,
    borderRadius: 12,
    paddingLeft: 13,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: { flex: 1, minHeight: 44, fontSize: 14, color: C.ink, paddingVertical: 10 },
  section: { color: C.ink, fontSize: 14, fontWeight: '600', marginBottom: 16 },
  hotList: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  hot: { paddingVertical: 9, paddingHorizontal: 13, backgroundColor: C.bg, borderRadius: 8 },
  hotText: { fontSize: 12, color: '#637a73' },
  hint: { color: C.muted, fontSize: 12, lineHeight: 25 },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
  },
  resultsText: { fontSize: 12, color: C.muted },
  row: {
    flexDirection: 'row',
    padding: 20,
    borderBottomWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
  },
  name: { fontSize: 15, fontWeight: '600', color: C.ink },
  code: { fontSize: 11, color: C.muted },
});
