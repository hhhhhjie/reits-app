import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { CATALOG, DEFAULT_WATCHLIST, validSymbol, registerInstruments } from '../shared/catalog';
import type { QuoteResponse, UniverseKind, UniverseResponse } from '../shared/types';
import { api, setApiUrl } from './api';
import { demoQuote } from '../shared/demo';

export function usePreferences() {
  const [watchlist, setWatchlist] = useState<string[]>(DEFAULT_WATCHLIST);
  const [conversions, setConversions] = useState<Record<string, number>>({});
  const [endpoint, setEndpoint] = useState('');
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  useEffect(() => {
    let mounted = true;
    AsyncStorage.multiGet(['zx.watchlist', 'zx.conversions', 'zx.endpoint'])
      .then((entries) => {
        if (!mounted) return;
        const saved = Object.fromEntries(entries);
        if (saved['zx.watchlist']) {
          const list: unknown = JSON.parse(saved['zx.watchlist']);
          if (
            Array.isArray(list) &&
            list.every((x) => typeof x === 'string' && validSymbol(x)) &&
            list.length <= 50
          )
            setWatchlist(list);
        }
        if (saved['zx.conversions']) {
          const data = JSON.parse(saved['zx.conversions']);
          if (data && typeof data === 'object' && !Array.isArray(data)) {
            setConversions(
              Object.fromEntries(
                Object.entries(data).filter(
                  ([key, value]) =>
                    validSymbol(key) &&
                    typeof value === 'number' &&
                    Number.isFinite(value) &&
                    value > 0,
                ),
              ) as Record<string, number>,
            );
          }
        }
        const url = saved['zx.endpoint'];
        if (url && /^https?:\/\//.test(url)) {
          setEndpoint(url);
          setApiUrl(url);
        }
      })
      .catch(() => {
        if (mounted) setStorageError('本地偏好未能读取，本次修改可能无法保存。');
      })
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    AsyncStorage.multiSet([
      ['zx.watchlist', JSON.stringify(watchlist)],
      ['zx.conversions', JSON.stringify(conversions)],
      ['zx.endpoint', endpoint],
    ]).catch(() => setStorageError('本地存储不可用，自选与参数未能保存。'));
  }, [watchlist, conversions, endpoint, ready]);
  const saveEndpoint = useCallback((value: string) => {
    setApiUrl(value);
    setEndpoint(value);
  }, []);
  return {
    watchlist,
    setWatchlist,
    conversions,
    setConversions,
    endpoint,
    saveEndpoint,
    ready,
    storageError,
  };
}

export function useMarket(watchlist: string[], ready: boolean, endpoint: string) {
  const [data, setData] = useState<QuoteResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const symbolKey = [...new Set([...CATALOG.map((x) => x.symbol), ...watchlist])].sort().join(',');
  useEffect(() => {
    if (!ready) return;
    const current = ++generation.current;
    let busy = false;
    let active = true;
    async function refresh() {
      if (busy) return;
      busy = true;
      setLoading(true);
      try {
        const response = await api.quotes(symbolKey.split(','));
        if (active && generation.current === current) {
          setData(response);
          setError('');
        }
      } catch (failure) {
        if (active && generation.current === current) {
          setError('无法连接行情服务，请检查网络或服务地址。');
          setData((previous) =>
            previous && previous.mode !== 'demo'
              ? { ...previous, mode: 'cached' }
              : {
                  quotes: symbolKey.split(',').flatMap((symbol) => {
                    const q = demoQuote(symbol);
                    return q ? [q] : [];
                  }),
                  mode: 'demo',
                  fetchedAt: new Date().toISOString(),
                  message: '离线演示，非实时行情',
                  missing: symbolKey.split(',').filter((symbol) => !demoQuote(symbol)),
                },
          );
        }
      } finally {
        busy = false;
        if (active && generation.current === current) setLoading(false);
      }
    }
    refreshRef.current = refresh;
    void refresh();
    const interval = setInterval(() => {
      if (
        AppState.currentState === 'active' &&
        (typeof document === 'undefined' || document.visibilityState !== 'hidden')
      )
        void refresh();
    }, 15_000);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      active = false;
      clearInterval(interval);
      listener.remove();
    };
  }, [symbolKey, ready, endpoint]);
  return { data, error, loading, refresh: () => refreshRef.current() };
}

export function useFullMarkets(ready: boolean, endpoint: string) {
  const [data, setData] = useState<Partial<Record<UniverseKind, UniverseResponse>>>({});
  const [loading, setLoading] = useState(false);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    if (!ready) return;
    let active = true,
      busy = false;
    setData({});
    async function refresh() {
      if (busy) return;
      busy = true;
      setLoading(true);
      await Promise.allSettled(
        (['bond', 'reit'] as const).map(async (kind) => {
          try {
            const result = await api.universe(kind);
            if (!active) return;
            registerInstruments(result.items);
            setData((previous) => ({ ...previous, [kind]: result }));
          } catch {
            if (active)
              setData((previous) => {
                const saved = previous[kind];
                return saved
                  ? {
                      ...previous,
                      [kind]: {
                        ...saved,
                        mode: saved.mode === 'demo' ? 'demo' : 'cached',
                        complete: false,
                        message: '更新失败，保留上次目录与行情。',
                      },
                    }
                  : previous;
              });
          }
        }),
      );
      busy = false;
      if (active) setLoading(false);
    }
    refreshRef.current = refresh;
    void refresh();
    const timer = setInterval(() => {
      if (
        AppState.currentState === 'active' &&
        (typeof document === 'undefined' || document.visibilityState !== 'hidden')
      )
        void refresh();
    }, 60_000);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      active = false;
      clearInterval(timer);
      listener.remove();
    };
  }, [ready, endpoint]);
  return { data, loading, refresh: () => refreshRef.current() };
}
