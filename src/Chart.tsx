import React, { useId, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Path,
  Line,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import type { Candle } from '../shared/types';
import { C, compact, price } from './theme';

export default function Chart({ candles, rising = true }: { candles: Candle[]; rising?: boolean }) {
  const [style, setStyle] = useState<'line' | 'candle'>('line');
  const [range, setRange] = useState(30);
  const id = useId().replace(/:/g, '');
  const rows = candles.slice(-range);
  if (rows.length < 2) return <Text style={{ color: C.muted, padding: 30 }}>暂无可用历史数据</Text>;
  const width = 680,
    height = 270,
    pad = 50,
    top = 18,
    chartHeight = 176;
  const low = Math.min(...rows.map((x) => x.low)) * 0.996;
  const high = Math.max(...rows.map((x) => x.high)) * 1.004;
  const x = (i: number) => pad + (i / Math.max(rows.length - 1, 1)) * (width - pad - 10);
  const y = (value: number) => top + ((high - value) / (high - low || 1)) * chartHeight;
  const color = rising ? C.up : C.down;
  const path = rows.map((row, i) => `${i ? 'L' : 'M'}${x(i)},${y(row.close)}`).join(' ');
  const maxVolume = Math.max(...rows.map((row) => row.volume), 1);
  return (
    <View>
      <View style={s.toolbar}>
        <View style={s.ranges}>
          {[30, 60, 90].map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={`${value}日走势`}
              onPress={() => setRange(value)}
              style={[s.range, range === value && s.selected]}
            >
              <Text
                style={[s.rangeText, range === value && { color: C.primary, fontWeight: '600' }]}
              >
                {value}日
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={style === 'line' ? '切换K线' : '切换折线'}
          onPress={() => setStyle((v) => (v === 'line' ? 'candle' : 'line'))}
          style={s.styleButton}
        >
          <Text style={s.styleText}>{style === 'line' ? '日K' : '折线'}</Text>
        </Pressable>
      </View>
      <View
        accessibilityLabel={`${rows.length}日历史行情图，${rows[0].date}至${rows.at(-1)?.date}`}
        style={{ width: '100%', aspectRatio: width / height }}
      >
        <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity="0.18" />
              <Stop offset="1" stopColor={color} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          {[0, 1, 2, 3].map((i) => {
            const level = top + (chartHeight / 3) * i;
            return (
              <React.Fragment key={i}>
                <Line
                  x1={pad}
                  y1={level}
                  x2={width - 8}
                  y2={level}
                  stroke={C.line}
                  strokeDasharray="4 5"
                />
                <SvgText x={pad - 8} y={level + 4} fill={C.muted} fontSize="10" textAnchor="end">
                  {price(high - ((high - low) / 3) * i)}
                </SvgText>
              </React.Fragment>
            );
          })}
          {style === 'line' ? (
            <>
              <Path
                d={`${path} L${x(rows.length - 1)},${top + chartHeight} L${pad},${top + chartHeight} Z`}
                fill={`url(#${id})`}
              />
              <Path d={path} stroke={color} strokeWidth="2" fill="none" />
            </>
          ) : (
            rows.map((row, i) => {
              const positive = row.close >= row.open;
              const stroke = positive ? C.up : C.down;
              const bodyWidth = Math.max(2, ((width - pad) / rows.length) * 0.5);
              return (
                <React.Fragment key={row.date}>
                  <Line x1={x(i)} y1={y(row.high)} x2={x(i)} y2={y(row.low)} stroke={stroke} />
                  <Rect
                    x={x(i) - bodyWidth / 2}
                    y={Math.min(y(row.open), y(row.close))}
                    width={bodyWidth}
                    height={Math.max(1.2, Math.abs(y(row.open) - y(row.close)))}
                    fill={positive ? '#fff' : stroke}
                    stroke={stroke}
                  />
                </React.Fragment>
              );
            })
          )}
          {rows.map((row, i) => (
            <Rect
              key={row.date}
              x={x(i) - 2}
              y={235 - (row.volume / maxVolume) * 25}
              width={Math.max(2, ((width - pad) / rows.length) * 0.5)}
              height={(row.volume / maxVolume) * 25}
              fill={row.close >= row.open ? '#f1bbb6' : '#a9d9c9'}
            />
          ))}
          <SvgText x={pad} y="260" fontSize="11" fill={C.muted}>
            {rows[0].date.slice(5)}
          </SvgText>
          <SvgText x={width - 10} y="260" fontSize="11" fill={C.muted} textAnchor="end">
            {rows.at(-1)?.date.slice(5)}
          </SvgText>
        </Svg>
      </View>
      <Text style={s.caption}>
        日线 · 前复权（源支持时） · 区间成交量{' '}
        {compact(rows.reduce((sum, row) => sum + row.volume, 0))}（源口径）
      </Text>
    </View>
  );
}
const s = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginTop: 8,
    marginBottom: 12,
  },
  ranges: { flexDirection: 'row', gap: 10 },
  range: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 7 },
  selected: { backgroundColor: C.soft },
  rangeText: { fontSize: 12, color: C.muted },
  styleButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 7,
  },
  styleText: { fontSize: 12, color: C.primary },
  caption: { color: C.muted, fontSize: 10, margin: 16, marginTop: 0 },
});
