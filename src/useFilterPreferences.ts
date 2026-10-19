import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  decodeFilterPreferences,
  emptyFilterPreferences,
  type KindFilterSettings,
} from '../shared/screening';
import type { UniverseKind } from '../shared/types';

export const FILTER_STORAGE_KEY = 'zx.filters.v1';
export function useFilterPreferences() {
  const [settings, setSettings] = useState(emptyFilterPreferences);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const current = useRef(settings),
    mounted = useRef(true),
    queue = useRef(Promise.resolve());
  useEffect(() => {
    mounted.current = true;
    AsyncStorage.getItem(FILTER_STORAGE_KEY)
      .then((raw) => {
        if (!mounted.current) return;
        if (raw) {
          const decoded = decodeFilterPreferences(raw);
          if (decoded) {
            current.current = decoded;
            setSettings(decoded);
          } else setError('筛选配置无法读取，已使用默认条件；自选不受影响。');
        }
      })
      .catch(() => {
        if (mounted.current) setError('筛选配置未能读取，本次修改可能无法保存。');
      })
      .finally(() => {
        if (mounted.current) setReady(true);
      });
    return () => {
      mounted.current = false;
    };
  }, []);
  const update = useCallback(
    (
      kind: UniverseKind,
      change: (previous: KindFilterSettings) => KindFilterSettings,
    ): Promise<void> => {
      const next = { ...current.current, [kind]: change(current.current[kind]) };
      current.current = next;
      setSettings(next);
      const json = JSON.stringify(next);
      const operation = queue.current
        .catch(() => {})
        .then(() => AsyncStorage.setItem(FILTER_STORAGE_KEY, json));
      queue.current = operation.catch(() => {});
      return operation
        .then(() => {
          if (mounted.current) setError('');
        })
        .catch(() => {
          if (mounted.current) setError('筛选在本次会话中已生效，但未能保存到本机。');
          throw new Error('本次会话可用，但未能保存到本机。');
        });
    },
    [],
  );
  return { settings, ready, error, update };
}
export type FilterPreferenceState = ReturnType<typeof useFilterPreferences>;
