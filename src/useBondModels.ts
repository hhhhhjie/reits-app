import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api } from './api';
import { modelKey } from '../shared/bond-model';
import type { BondModelRecords } from '../shared/types';

export function useBondModels(requests: { symbol: string; asOf: string }[], endpoint: string) {
  const [records, setRecords] = useState<BondModelRecords>({}),
    [attempt, setAttempt] = useState(0),
    [busy, setBusy] = useState(false);
  const cache = useRef<BondModelRecords>({});
  const key = [...new Set(requests.map((r) => modelKey(r.symbol, r.asOf)))].sort().join(',');
  useEffect(() => {
    cache.current = {};
    setRecords({});
  }, [endpoint]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (s) => {
      if (s === 'active') setAttempt((n) => n + 1);
    });
    const visible = () => {
      if (document.visibilityState === 'visible') setAttempt((n) => n + 1);
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visible);
    return () => {
      listener.remove();
      if (typeof document !== 'undefined')
        document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  useEffect(() => {
    let active = true;
    const needed = key
      .split(',')
      .filter(Boolean)
      .filter((k) => !cache.current[k]);
    if (!needed.length) {
      setBusy(false);
      return;
    }
    setBusy(true);
    const grouped = new Map<string, string[]>();
    for (const entry of needed) {
      const [symbol, day] = entry.split(':');
      grouped.set(day, [...(grouped.get(day) ?? []), symbol]);
    }
    void (async () => {
      for (const [asOf, symbols] of grouped) {
        for (let i = 0; active && i < symbols.length; i += 10) {
          if (
            AppState.currentState === 'background' ||
            AppState.currentState === 'inactive' ||
            (typeof document !== 'undefined' && document.visibilityState === 'hidden')
          )
            return;
          const batch = symbols.slice(i, i + 10);
          try {
            const response = await api.bondModels(batch, asOf);
            if (!active) return;
            for (const item of response.items)
              if (batch.includes(item.symbol) && item.asOf === asOf)
                cache.current[modelKey(item.symbol, asOf)] = item;
          } catch {
            if (!active) return;
          }
          for (const symbol of batch) {
            const id = modelKey(symbol, asOf);
            cache.current[id] ??= {
              symbol,
              asOf,
              available: false,
              volatility: null,
              volatilityStartDate: null,
              volatilityEndDate: null,
              returnCount: 0,
              treasuryCurve: [],
              treasuryDate: null,
              fetchedAt: new Date().toISOString(),
              message: '估值参数请求失败，可重新加载；不使用演示参数。',
            };
          }
          if (Object.keys(cache.current).length > 1000) {
            const keep = new Set(key.split(','));
            cache.current = Object.fromEntries(
              Object.entries(cache.current).filter(([k]) => keep.has(k)),
            );
          }
          setRecords({ ...cache.current });
        }
      }
    })().finally(() => {
      if (active) setBusy(false);
    });
    return () => {
      active = false;
    };
  }, [key, endpoint, attempt]);
  const retry = useCallback(() => {
    cache.current = Object.fromEntries(
      Object.entries(cache.current).filter(([, value]) => value.available),
    );
    setRecords({ ...cache.current });
    setAttempt((n) => n + 1);
  }, []);
  const keys = key.split(',').filter(Boolean);
  return {
    records,
    busy,
    total: keys.length,
    processed: keys.filter((k) => records[k]).length,
    available: keys.filter((k) => records[k]?.available).length,
    retry,
  };
}
export type BondModelsState = ReturnType<typeof useBondModels>;
