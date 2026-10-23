import React, { useEffect, useState } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, SlidersHorizontal, X } from 'lucide-react-native';
import { C } from './theme';
import { Button, IconButton, Notice } from './components';
import {
  CREDIT_RATINGS,
  FILTER_FIELDS,
  activeFilterChips,
  canonicalFilters,
  emptyMarketFilters,
  filterErrors,
  type KindFilterSettings,
  type MarketFilters,
} from '../shared/screening';
import type { UniverseKind } from '../shared/types';
import { BOND_MODEL_KEYS } from '../shared/bond-model';

export default function FilterPanel({
  visible,
  kind,
  settings,
  onClose,
  onApply,
  onSave,
  onDelete,
  previewCount,
  searching,
  scope,
  loadingDistributions,
  onModelDemand,
  modelProgress,
}: {
  visible: boolean;
  kind: UniverseKind;
  settings: KindFilterSettings;
  onClose: () => void;
  onApply: (filters: MarketFilters) => Promise<void>;
  onSave: (name: string, filters: MarketFilters) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  previewCount: (filters: MarketFilters) => number;
  searching: boolean;
  scope: string;
  loadingDistributions: boolean;
  onModelDemand?: (value: boolean) => void;
  modelProgress?: string;
}) {
  const [draft, setDraft] = useState(emptyMarketFilters);
  const [name, setName] = useState('');
  const [feedback, setFeedback] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [allRatings, setAllRatings] = useState(false);
  const inset = useSafeAreaInsets();
  useEffect(() => {
    if (!visible) return;
    setDraft(settings.applied);
    setName('');
    setFeedback('');
    setShowErrors(false);
    setAllRatings(false);
  }, [visible]);
  const errors = filterErrors(draft, kind),
    valid = !Object.keys(errors).length;
  const count = valid ? previewCount(draft) : null;
  function edit(change: (previous: MarketFilters) => MarketFilters) {
    setDraft(change);
    setFeedback('');
  }
  async function apply() {
    setShowErrors(true);
    if (!valid) return;
    Keyboard.dismiss();
    setBusy(true);
    try {
      await onApply(canonicalFilters(draft, kind));
    } catch {
      /* 已应用的本次条件保留；外层显示本机保存失败提示。 */
    } finally {
      setBusy(false);
      onClose();
    }
  }
  async function save() {
    setShowErrors(true);
    if (!valid) return;
    if (!name.trim()) {
      setFeedback('请输入方案名称，或直接点击下方“应用筛选”。');
      return;
    }
    Keyboard.dismiss();
    setBusy(true);
    try {
      await onSave(name.trim(), canonicalFilters(draft, kind));
      setFeedback(`已保存本机方案「${name.trim()}」`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '方案未能保存');
    } finally {
      setBusy(false);
    }
  }
  const visibleRatings = allRatings
    ? CREDIT_RATINGS
    : CREDIT_RATINGS.filter((r, i) => i < 6 || r === '未评级' || draft.ratings.includes(r));
  const draftNeedsModels = BOND_MODEL_KEYS.some(
    (k) => !!(draft.ranges[k]?.min || draft.ranges[k]?.max),
  );
  useEffect(() => {
    onModelDemand?.(visible && kind === 'bond' && draftNeedsModels);
    return () => onModelDemand?.(false);
  }, [visible, kind, draftNeedsModels, onModelDemand]);
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <View style={[s.screen, { paddingTop: inset.top }]} testID="filter-panel">
        <View style={s.inner}>
          <View style={s.header}>
            <SlidersHorizontal size={21} color={C.primary} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.title}>{kind === 'bond' ? '可转债' : 'REITs'}筛选设置</Text>
              <Text style={s.sub}>多条件同时满足 · 留空不限</Text>
            </View>
            <IconButton
              icon={X}
              label="关闭筛选"
              onPress={() => {
                if (!busy) onClose();
              }}
            />
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 18, gap: 18, paddingBottom: 30 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.preview}>
              <Text style={s.previewCount}>{count == null ? '请检查范围' : `预计${count}只`}</Text>
              <Text style={s.sub}>
                {scope}
                {searching ? ' · 当前搜索范围' : ''} · {activeFilterChips(draft, kind).length}项条件
              </Text>
            </View>
            <View style={{ gap: 10 }}>
              <Text style={s.sectionTitle}>我的筛选方案</Text>
              {!!settings.presets.length && (
                <View style={s.wrap}>
                  {settings.presets.map((preset) => (
                    <View key={preset.id} style={s.preset}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`载入筛选方案${preset.name}`}
                        disabled={busy}
                        onPress={() => {
                          setDraft(preset.filters);
                          setName(preset.name);
                          setFeedback(`已载入「${preset.name}」，点击“应用筛选”生效。`);
                          setShowErrors(false);
                        }}
                        style={{ padding: 9 }}
                      >
                        <Text style={s.link}>{preset.name}</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`删除筛选方案${preset.name}`}
                        disabled={busy}
                        onPress={async () => {
                          setBusy(true);
                          try {
                            await onDelete(preset.id);
                            setFeedback(`已删除方案「${preset.name}」`);
                          } catch (error) {
                            setFeedback(error instanceof Error ? error.message : '删除未能保存');
                          } finally {
                            setBusy(false);
                          }
                        }}
                        style={{ padding: 9 }}
                      >
                        <X size={13} color={C.muted} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
              <View style={s.nameRow}>
                <TextInput
                  accessibilityLabel="筛选方案名称"
                  placeholder="方案名称（可选）"
                  placeholderTextColor={C.muted}
                  value={name}
                  onChangeText={setName}
                  maxLength={20}
                  editable={!busy}
                  style={[s.input, { flex: 1 }]}
                />
                <Button
                  label="保存方案"
                  secondary
                  disabled={busy}
                  onPress={() => {
                    void save();
                  }}
                />
              </View>
              <Text style={s.hint}>每类最多10套；同名会更新。保存方案后仍需点击“应用筛选”。</Text>
              {!!feedback && (
                <Text accessibilityRole="alert" style={s.feedback}>
                  {feedback}
                </Text>
              )}
            </View>
            <View style={{ gap: 10 }}>
              <Text style={s.sectionTitle}>范围</Text>
              <View style={s.wrap}>
                {(['all', 'SH', 'SZ'] as const).map((value, i) => (
                  <Choice
                    key={value}
                    label={['全部市场', '沪市', '深市'][i]}
                    selected={draft.market === value}
                    disabled={busy}
                    onPress={() => edit((prev) => ({ ...prev, market: value }))}
                  />
                ))}
              </View>
              <View style={s.wrap}>
                <Choice
                  label="仅自选"
                  selected={draft.watchOnly}
                  checkbox
                  disabled={busy}
                  onPress={() => edit((prev) => ({ ...prev, watchOnly: !prev.watchOnly }))}
                />
                {(['all', 'up', 'down'] as const).map((value, i) => (
                  <Choice
                    key={value}
                    label={['不限涨跌', '上涨', '下跌'][i]}
                    selected={draft.trend === value}
                    disabled={busy}
                    onPress={() => edit((prev) => ({ ...prev, trend: value }))}
                  />
                ))}
              </View>
            </View>
            {kind === 'bond' && modelProgress && <Notice text={modelProgress} />}
            {FILTER_FIELDS[kind].map((field, index, all) => (
              <View key={field.key} style={{ gap: 8 }}>
                {(index === 0 || all[index - 1].group !== field.group) && (
                  <Text style={[s.sectionTitle, { marginTop: index ? 8 : 0 }]}>{field.group}</Text>
                )}
                <Text style={s.label}>
                  {field.label}
                  <Text style={s.unit}>
                    （{field.unit}）{field.signed ? ' · 可填负数' : ''}
                  </Text>
                </Text>
                <View style={s.rangeRow}>
                  {(['min', 'max'] as const).map((side, index) => (
                    <React.Fragment key={side}>
                      {!!index && <Text style={s.unit}>—</Text>}
                      <TextInput
                        accessibilityLabel={`${field.label}${side === 'min' ? '最低值' : '最高值'}`}
                        value={draft.ranges[field.key]?.[side] ?? ''}
                        placeholder={side === 'min' ? '最低值，不限' : '最高值，不限'}
                        placeholderTextColor={C.muted}
                        maxLength={20}
                        keyboardType={field.signed ? 'default' : 'decimal-pad'}
                        autoCorrect={false}
                        editable={!busy}
                        onBlur={() => setShowErrors(true)}
                        onChangeText={(value) =>
                          edit((prev) => ({
                            ...prev,
                            ranges: {
                              ...prev.ranges,
                              [field.key]: {
                                min: prev.ranges[field.key]?.min ?? '',
                                max: prev.ranges[field.key]?.max ?? '',
                                [side]: value,
                              },
                            },
                          }))
                        }
                        style={[
                          s.input,
                          { flex: 1 },
                          showErrors && !!errors[field.key] && s.invalid,
                        ]}
                      />
                    </React.Fragment>
                  ))}
                </View>
                {showErrors && !!errors[field.key] && (
                  <Text accessibilityRole="alert" style={s.error}>
                    {errors[field.key]}
                  </Text>
                )}
              </View>
            ))}
            {kind === 'bond' && (
              <>
                <View style={{ gap: 10 }}>
                  <Text style={s.sectionTitle}>债项评级（可多选）</Text>
                  <View style={s.wrap}>
                    <Choice
                      label="全部评级"
                      selected={!draft.ratings.length}
                      disabled={busy}
                      onPress={() => edit((prev) => ({ ...prev, ratings: [] }))}
                    />
                    {visibleRatings.map((rating) => (
                      <Choice
                        key={rating}
                        label={rating}
                        selected={draft.ratings.includes(rating)}
                        checkbox
                        disabled={busy}
                        onPress={() =>
                          edit((prev) => ({
                            ...prev,
                            ratings: prev.ratings.includes(rating)
                              ? prev.ratings.filter((r) => r !== rating)
                              : [...prev.ratings, rating],
                          }))
                        }
                      />
                    ))}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setAllRatings((value) => !value)}
                  >
                    <Text style={s.link}>{allRatings ? '收起评级' : '更多评级'}</Text>
                  </Pressable>
                </View>
                <View style={{ gap: 10 }}>
                  <Text style={s.sectionTitle}>赎回公告与正股</Text>
                  <View style={s.wrap}>
                    {(['all', 'exclude_announced', 'only_announced'] as const).map((value, i) => (
                      <Choice
                        key={value}
                        label={['不限公告', '排除已公告赎回', '只看已公告赎回'][i]}
                        selected={draft.redemption === value}
                        disabled={busy}
                        onPress={() => edit((prev) => ({ ...prev, redemption: value }))}
                      />
                    ))}
                  </View>
                  <Choice
                    label="排除已标记ST正股"
                    selected={draft.excludeST}
                    checkbox
                    disabled={busy}
                    onPress={() => edit((prev) => ({ ...prev, excludeST: !prev.excludeST }))}
                  />
                  <Text style={s.hint}>
                    按已取得的赎回公告日期、正股名称标记筛选。没有公告字段不等于没有强赎风险；此处不计算15/30日触发天数。
                  </Text>
                </View>
              </>
            )}
            <Notice
              text={
                kind === 'bond'
                  ? '上下限均包含边界。设置数值条件后，缺少该指标的品种不纳入结果。税前到期收益率为合同现金流估算，发行规模不是剩余规模。'
                  : '上下限均包含边界。分红与净值独立加载，缺少所选指标时不纳入结果。历史现金分派率不是未来收益预测；净值溢价不是IOPV折溢价。'
              }
            />
            {kind === 'reit' && loadingDistributions && (
              <Text style={s.hint}>分红明细仍在补全，符合条件的数量会随数据更新。</Text>
            )}
          </ScrollView>
          <View style={[s.footer, { paddingBottom: Math.max(inset.bottom, 14) }]}>
            <Button
              label="重置筛选"
              secondary
              disabled={busy}
              onPress={() => {
                setDraft(emptyMarketFilters());
                setFeedback('已清空草稿条件，点击“应用筛选”生效。');
                setShowErrors(false);
              }}
            />
            <View style={{ flex: 1 }}>
              <Button
                label={
                  busy ? '正在保存…' : count == null ? '检查筛选范围' : `应用筛选（${count}只）`
                }
                disabled={busy}
                onPress={() => {
                  void apply();
                }}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
function Choice({
  label,
  selected,
  onPress,
  disabled,
  checkbox = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled: boolean;
  checkbox?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={checkbox ? 'checkbox' : 'button'}
      accessibilityState={checkbox ? { checked: selected } : { selected }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[s.choice, selected && s.selected]}
    >
      {checkbox && (
        <View style={[s.check, selected && { backgroundColor: C.primary, borderColor: C.primary }]}>
          {selected && <Check size={11} color="#fff" />}
        </View>
      )}
      <Text style={[s.choiceText, selected && { color: C.primary, fontWeight: '600' }]}>
        {label}
      </Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  inner: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center', backgroundColor: C.card },
  header: {
    paddingHorizontal: 18,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  title: { fontSize: 18, fontWeight: '700', color: C.ink },
  sub: { fontSize: 11, color: C.muted },
  preview: { padding: 14, borderRadius: 10, backgroundColor: C.soft, gap: 5 },
  previewCount: { fontSize: 20, fontWeight: '700', color: C.primary },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: C.ink },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
  },
  nameRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    minHeight: 43,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 10,
    fontSize: 12,
    color: C.ink,
    backgroundColor: C.bg,
    minWidth: 0,
  },
  hint: { fontSize: 11, color: C.muted, lineHeight: 18 },
  feedback: { fontSize: 12, color: C.primary, lineHeight: 19 },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 13, color: C.ink },
  unit: { fontSize: 11, color: C.muted },
  invalid: { borderColor: C.up },
  error: { fontSize: 11, color: C.up },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
    alignSelf: 'flex-start',
  },
  selected: { backgroundColor: C.soft, borderColor: '#b0d9cd' },
  choiceText: { fontSize: 12, color: C.muted },
  check: {
    width: 15,
    height: 15,
    borderWidth: 1,
    borderColor: '#bccbc4',
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: { fontSize: 12, color: C.primary },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
    paddingHorizontal: 18,
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.card,
  },
});
