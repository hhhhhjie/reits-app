import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  CheckCircle2,
  Database,
  Globe2,
  Heart,
  RefreshCw,
  Smartphone,
  UserRound,
} from 'lucide-react-native';
import { C } from './theme';
import type { DataMode } from '../shared/types';
import { api, getApiUrl } from './api';
import { Button, ModeBadge, Notice, Panel } from './components';

export default function SettingsScreen({
  mode,
  endpoint,
  onSave,
  watchCount,
  refresh,
}: {
  mode?: DataMode;
  endpoint: string;
  onSave: (value: string) => void;
  watchCount: number;
  refresh: () => void;
}) {
  const [url, setUrl] = useState(endpoint || getApiUrl());
  const [feedback, setFeedback] = useState('');
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    setUrl(endpoint || getApiUrl());
  }, [endpoint]);
  function save() {
    const value = url.trim().replace(/\/$/, '');
    if (!value) {
      onSave('');
      setFeedback('已恢复默认行情连接');
      return;
    }
    try {
      const parsed = new URL(value);
      if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        !parsed.hostname ||
        parsed.username ||
        parsed.password ||
        (parsed.pathname !== '/' && parsed.pathname !== '') ||
        parsed.search ||
        parsed.hash
      )
        throw new Error('invalid');
    } catch {
      setFeedback('请输入有效的 http(s) 服务地址，不含路径、账号或查询参数。');
      return;
    }
    onSave(value);
    setFeedback('服务地址已保存，正在重新连接行情。');
  }
  async function check() {
    setChecking(true);
    try {
      await api.health();
      setFeedback('行情服务连接成功；行情源状态请查看上方标记。');
    } catch {
      setFeedback('无法连接行情服务，请检查地址、网络或服务是否启动。');
    } finally {
      setChecking(false);
    }
  }
  return (
    <View style={{ gap: 18 }}>
      <Text style={s.eyebrow}>PERSONAL SPACE</Text>
      <Text style={s.heading}>
        我的知行<Text style={{ color: C.primary }}>.</Text>
      </Text>
      <Panel style={{ padding: 22 }}>
        <View style={s.profile}>
          <View style={s.avatar}>
            <UserRound size={27} color={C.primary} strokeWidth={1.5} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>知行观察者</Text>
            <Text style={s.profileSub}>不疾而速，看见长期的价值</Text>
          </View>
          <Text style={s.local}>本机</Text>
        </View>
        <View style={s.profileStats}>
          <View style={{ gap: 6 }}>
            <Text style={s.statNumber}>{watchCount}</Text>
            <Text style={s.label}>自选证券</Text>
          </View>
          <View style={{ width: 1, backgroundColor: C.line }} />
          <View style={{ gap: 6 }}>
            <Text style={s.statNumber}>
              15<Text style={{ fontSize: 12, color: C.muted }}> 秒</Text>
            </Text>
            <Text style={s.label}>前台自动刷新</Text>
          </View>
          <View style={{ width: 1, backgroundColor: C.line }} />
          <View style={{ gap: 6 }}>
            <Text style={s.statNumber}>A + H</Text>
            <Text style={s.label}>两地市场</Text>
          </View>
        </View>
      </Panel>
      <Panel style={{ padding: 20 }}>
        <View style={s.sectionHeader}>
          <View style={s.titleRow}>
            <Database size={18} color={C.primary} />
            <Text style={s.title}>行情与数据</Text>
          </View>
          <ModeBadge mode={mode} />
        </View>
        <Text style={s.description}>
          A股与港股价格来自腾讯公开行情。每条报价保留来源和更新时间；港股可能延迟。接口不可达时显示明确标识的固定演示数据。
        </Text>
        <View style={s.infoRow}>
          <Text style={s.label}>涨跌配色</Text>
          <Text style={s.infoValue}>
            <Text style={{ color: C.up }}>红涨</Text> / <Text style={{ color: C.down }}>绿跌</Text>
          </Text>
        </View>
        <View style={s.infoRow}>
          <Text style={s.label}>时间与币种</Text>
          <Text style={s.infoValue}>北京时间 · CNY / HKD</Text>
        </View>
        <View style={s.infoRow}>
          <Text style={s.label}>本机保存</Text>
          <Text style={s.infoValue}>自选 · 转股价 · 筛选方案</Text>
        </View>
        <Button label="刷新行情" secondary icon={RefreshCw} onPress={refresh} />
      </Panel>
      <Panel style={{ padding: 20 }}>
        <View style={s.titleRow}>
          <Globe2 size={18} color={C.primary} />
          <Text style={s.title}>行情服务地址</Text>
        </View>
        <Text style={s.description}>
          Android 默认直接连接公开行情，无需配置。也可填写自己的 HTTPS
          行情服务地址，清空并保存可恢复默认连接。
        </Text>
        <TextInput
          accessibilityLabel="行情服务地址"
          placeholder="https://your-api.example.com"
          placeholderTextColor={C.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={url}
          onChangeText={setUrl}
          style={s.input}
        />
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <Button label="保存地址" onPress={save} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={checking ? '检测中…' : '检测连接'}
              secondary
              onPress={() => {
                void check();
              }}
              disabled={checking}
            />
          </View>
        </View>
        {!!feedback && (
          <Text accessibilityRole="alert" style={s.feedback}>
            {feedback}
          </Text>
        )}
      </Panel>
      <Notice text="沪深可转债与公募REITs按完整目录加载，目录行情每60秒刷新。转债参数自动读取，可本机修正；REITs净值和历史现金分红独立加载，缺失留空。税前YTM为估算，历史分派率不代表未来收益。" />
      <View style={s.about}>
        <View style={s.titleRow}>
          <Heart size={12} color={C.primary} />
          <Text style={s.aboutText}>知行行情 · 让数据服务于思考</Text>
        </View>
        <Text style={s.version}>Android · v1.3.0</Text>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  eyebrow: { fontSize: 9, letterSpacing: 2, color: C.muted, fontWeight: '600', marginBottom: -10 },
  heading: { fontSize: 24, fontWeight: '700', color: C.ink },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  avatar: {
    backgroundColor: C.soft,
    width: 54,
    height: 54,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: { fontSize: 17, fontWeight: '600', color: C.ink },
  profileSub: { fontSize: 10, marginTop: 6, color: C.muted },
  local: {
    color: C.primary,
    fontSize: 10,
    backgroundColor: C.soft,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
  },
  profileStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28 },
  statNumber: { fontSize: 21, fontWeight: '600', color: C.ink },
  label: { fontSize: 11, color: C.muted },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '600', color: C.ink },
  description: { fontSize: 12, lineHeight: 22, color: C.muted, marginVertical: 15 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 17 },
  infoValue: { fontSize: 11, color: C.ink },
  input: { backgroundColor: C.bg, borderRadius: 10, padding: 14, fontSize: 12, color: C.ink },
  feedback: { color: C.primary, fontSize: 11, lineHeight: 18, marginTop: 12 },
  about: { alignItems: 'center', paddingVertical: 18, gap: 9 },
  aboutText: { fontSize: 11, color: C.muted },
  version: { fontSize: 9, color: '#a6b4af' },
});
