import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { AlertCircle, ArrowRight, Database, RefreshCw } from 'lucide-react-native';
import type { DataMode } from '../shared/types';
import { C } from './theme';

export function IconButton({
  icon: Icon,
  label,
  onPress,
  active = false,
  size = 20,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  active?: boolean;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        active && { backgroundColor: C.soft },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Icon size={size} color={active ? C.primary : C.muted} strokeWidth={1.8} />
    </Pressable>
  );
}
export function Button({
  label,
  onPress,
  icon: Icon,
  secondary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && { backgroundColor: C.soft },
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      {Icon && <Icon size={17} color={secondary ? C.primary : '#fff'} />}
      <Text style={[styles.buttonText, secondary && { color: C.primary }]}>{label}</Text>
    </Pressable>
  );
}
export function ModeBadge({ mode }: { mode?: DataMode }) {
  const demo = mode === 'demo';
  const label = demo
    ? '演示数据'
    : mode === 'cached'
      ? '缓存行情'
      : mode === 'live'
        ? '行情已连接'
        : '连接行情中';
  return (
    <View style={[styles.badge, (demo || mode === 'cached') && { backgroundColor: C.amberBg }]}>
      <View
        style={[styles.dot, { backgroundColor: demo || mode === 'cached' ? C.amber : C.primary }]}
      />
      <Text style={[styles.badgeText, (demo || mode === 'cached') && { color: C.amber }]}>
        {label}
      </Text>
    </View>
  );
}
export function EmptyState({
  title,
  description,
  action,
  onAction,
  loading = false,
}: {
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
  loading?: boolean;
}) {
  return (
    <View style={styles.empty}>
      {loading ? (
        <ActivityIndicator color={C.primary} size="large" />
      ) : (
        <View style={styles.emptyIcon}>
          <Database color={C.primary} size={29} strokeWidth={1.4} />
        </View>
      )}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {action && onAction && (
        <Button label={action} onPress={onAction} icon={ArrowRight} secondary />
      )}
    </View>
  );
}
export function Notice({
  text,
  error = false,
  onPress,
}: {
  text: string;
  error?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={[styles.notice, error && { backgroundColor: C.amberBg }]}
    >
      {error ? <AlertCircle size={15} color={C.amber} /> : <Database size={14} color={C.primary} />}
      <Text style={[styles.noticeText, error && { color: C.amber }]}>{text}</Text>
      {onPress && <RefreshCw size={14} color={error ? C.amber : C.primary} />}
    </Pressable>
  );
}
export function Panel({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}
export const styles = StyleSheet.create({
  panel: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    overflow: 'hidden',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    minHeight: 43,
    borderRadius: 11,
    paddingHorizontal: 18,
    paddingVertical: 11,
    backgroundColor: C.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: C.soft,
  },
  dot: { width: 5, height: 5, borderRadius: 3 },
  badgeText: { color: C.primary, fontSize: 10, fontWeight: '600' },
  empty: { padding: 30, paddingVertical: 44, alignItems: 'center', gap: 14 },
  emptyIcon: { padding: 18, borderRadius: 24, backgroundColor: C.soft },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: C.ink },
  emptyDescription: {
    fontSize: 13,
    lineHeight: 22,
    color: C.muted,
    maxWidth: 330,
    textAlign: 'center',
  },
  notice: {
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#edf6f3',
    gap: 8,
    borderRadius: 10,
  },
  noticeText: { fontSize: 11, lineHeight: 17, color: '#62867b', flex: 1 },
});
