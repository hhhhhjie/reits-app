import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ExternalLink, RefreshCw } from 'lucide-react-native';
import type { IPOResponse } from '../shared/types';
import { api } from './api';
import { C, price } from './theme';
import { Button, EmptyState, IconButton, Notice, Panel } from './components';

export default function IPOPanel() {
  const [data, setData] = useState<IPOResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .ipo()
      .then((value) => {
        if (active) setData(value);
      })
      .catch(() => {
        if (active)
          setData({
            items: [],
            available: false,
            fetchedAt: '',
            message: '无法连接发行日历服务，请查看交易所官方公告。',
          });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  return (
    <Panel>
      <View style={s.header}>
        <View style={{ gap: 6 }}>
          <Text style={s.title}>A股新股申购日历</Text>
          <Text style={s.subtitle}>申购与上市日期 · 东方财富公开数据</Text>
        </View>
        <IconButton icon={RefreshCw} label="刷新发行日历" onPress={() => setRetry((v) => v + 1)} />
      </View>
      {loading ? (
        <EmptyState loading title="查询发行日历" description="正在连接新股数据源" />
      ) : data?.available ? (
        <ScrollView horizontal contentContainerStyle={{ minWidth: '100%' }}>
          <View style={{ minWidth: 610, flex: 1 }}>
            <View style={[s.row, { backgroundColor: C.bg }]}>
              {['名称 / 代码', '申购日期', '申购代码', '发行价', '上市日期'].map((item, i) => (
                <Text key={item} style={[s.cell, i === 0 && { width: 150 }, s.subtitle]}>
                  {item}
                </Text>
              ))}
            </View>
            {data.items.map((item) => (
              <View key={item.code} style={s.row}>
                <View style={[s.cell, { width: 150, gap: 6 }]}>
                  <Text style={s.name}>{item.name}</Text>
                  <Text style={s.subtitle}>{item.code}</Text>
                </View>
                <Text style={s.cell}>{item.applyDate || '—'}</Text>
                <Text style={s.cell}>{item.applyCode || '—'}</Text>
                <Text style={s.cell}>{price(item.issuePrice)}</Text>
                <Text style={s.cell}>{item.listingDate || '待公告'}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <EmptyState
          title="发行日历暂不可用"
          description={data?.message || '当前无法取得新股日历，请稍后重试。'}
        />
      )}
      <View style={{ padding: 18, gap: 11 }}>
        <Notice text="发行安排可能调整。申购日期、发行价格及申购资格请以交易所和发行人最新公告为准。港股新上市资料请见香港交易所。" />
        {[
          ['上海证券交易所', 'https://www.sse.com.cn/ipo/'],
          ['深圳证券交易所', 'https://www.szse.cn/disclosure/notice/company/'],
          [
            '香港交易所 · 新上市',
            'https://www.hkex.com.hk/Listing/Market-Consultations-and-Reports/New-Listings?sc_lang=zh-HK',
          ],
        ].map(([label, url]) => (
          <Button
            key={label}
            label={label}
            icon={ExternalLink}
            secondary
            onPress={() => {
              void Linking.openURL(url).catch(() => {});
            }}
          />
        ))}
      </View>
    </Panel>
  );
}
const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
  },
  title: { fontSize: 16, color: C.ink, fontWeight: '600' },
  subtitle: { fontSize: 10, color: C.muted },
  row: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
  },
  cell: { width: 108, fontSize: 11, color: C.ink, textAlign: 'left' },
  name: { fontSize: 12, color: C.ink, fontWeight: '600' },
});
