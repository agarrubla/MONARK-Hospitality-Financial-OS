/**
 * Executive dashboard — pixel-perfect port of "Monark Dashboard.dc.html".
 * Monark Score ring, Today, Cash position, MTD P&L, ratio tiles, AI insights;
 * location + month chip filters; drill-down bottom sheets on every number.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
  agg, buildSheet, fmt, insightData, locationNames, pctf,
  type LocFilter, type MonthKey, type Severity,
} from '../data/dashboardData';
import { colors, fMono, fSans } from '../theme/tokens';

const sevColor: Record<Severity, string> = {
  critical: colors.red,
  warning: colors.amber,
  info: colors.blue,
};

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 6,
        paddingVertical: 5,
        paddingHorizontal: 9,
        backgroundColor: active ? colors.gold : colors.inkSecondary,
      }}
    >
      <Text style={{ ...fMono(600, 10.5, 0.04), color: active ? colors.ink : colors.headerMuted }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, marginHorizontal: 2, marginBottom: 8 }}>
      {children}
    </Text>
  );
}

const card = {
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.cardBorder,
  borderRadius: 12,
} as const;

export default function DashboardScreen() {
  const [loc, setLoc] = useState<LocFilter>('all');
  const [month, setMonth] = useState<MonthKey>('aug');
  const [sheetKey, setSheetKey] = useState<string | null>(null);

  const a = useMemo(() => agg(loc, month), [loc, month]);
  const cogs = a.cogsF + a.cogsB;
  const profit = a.rev - cogs - a.labor - a.opex;
  const margin = (profit / a.rev) * 100;

  const score = a.score;
  const scoreColor = score >= 78 ? colors.success : score >= 65 ? colors.gold : colors.scoreLow;
  const ringCirc = 226.2;
  const scoreLabel = score >= 78 ? 'Healthy' : score >= 65 ? 'Stable — watch costs' : 'Needs attention';
  const scoreDriver =
    loc === 'mid' ? 'Labor 4 pts over target is the main drag on the score.'
    : loc === 'all' ? 'Margins healthy; Midtown labor is the biggest drag.'
    : loc === 'bkn' ? 'Deposit variance on Aug 14 batch under review.'
    : 'Strong margin; produce inflation worth watching.';

  const open = (key: string) => () => setSheetKey(key);
  const sheet = sheetKey ? buildSheet(sheetKey, a, month, loc) : null;

  const todayStats = [
    {
      label: 'Sales', val: fmt(a.todaySales),
      delta: (a.dToday >= 0 ? '▲ ' : '▼ ') + Math.abs(a.dToday).toFixed(1) + '% vs last Sun',
      up: a.dToday >= 0, open: open('sales_today'),
    },
    { label: 'Transactions', val: a.todayTxn.toLocaleString('en-US'), delta: '▲ 2.4% vs last Sun', up: true, open: open('txn_today') },
    { label: 'Avg check', val: '$' + (a.todaySales / a.todayTxn).toFixed(2), delta: '▲ 1.9% vs last Sun', up: true, open: open('avg_today') },
  ];

  const cashStats = [
    { label: 'Available cash', val: fmt(a.cash), color: colors.text, sub: '3 accounts · as of 9:41 AM', open: open('cash') },
    { label: 'Accounts payable', val: fmt(a.ap), color: colors.text, sub: '53 open invoices', open: open('ap') },
    { label: 'Due next 7 days', val: fmt(a.due7), color: a.due7 > a.cash * 0.4 ? colors.red : colors.text, sub: '14 scheduled payments', open: open('due') },
    { label: 'Projected · 30 days', val: fmt(a.proj), color: a.proj >= a.cash ? colors.green : colors.amber, sub: 'forecast confidence 0.84', open: open('proj') },
  ];

  const plRows = [
    { label: 'Revenue', pct: '100%', val: fmt(a.rev), key: 'revenue', strong: false },
    { label: 'COGS', pct: pctf((cogs / a.rev) * 100), val: '−' + fmt(cogs).substring(1), key: 'cogs', strong: false },
    { label: 'Labor', pct: pctf((a.labor / a.rev) * 100), val: '−' + fmt(a.labor).substring(1), key: 'labor', strong: false },
    { label: 'Operating expenses', pct: pctf((a.opex / a.rev) * 100), val: '−' + fmt(a.opex).substring(1), key: 'opex', strong: false },
    { label: 'Operating profit', pct: pctf(margin), val: fmt(profit), key: 'profit', strong: true },
  ];

  const ratioStats = [
    { label: 'Food cost', v: (a.cogsF / a.revF) * 100, target: 30, key: 'food' },
    { label: 'Bev cost', v: (a.cogsB / a.revB) * 100, target: 22, key: 'bev' },
    { label: 'Labor', v: (a.labor / a.rev) * 100, target: 31, key: 'laborpct' },
    { label: 'Prime cost', v: ((cogs + a.labor) / a.rev) * 100, target: 60, key: 'prime' },
  ];

  const insights = insightData.filter((i) => loc === 'all' || i.loc === loc || i.loc === 'all');

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg, overflow: 'hidden' }}>
      {/* Header */}
      <View style={{ backgroundColor: colors.ink, paddingTop: 14, paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ ...fMono(700, 15, 0.18), color: colors.appBg }}>MONARK</Text>
        <View style={{ borderWidth: 1, borderColor: colors.gold, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5 }}>
          <Text style={{ ...fMono(600, 8.5, 0.1), color: colors.gold }}>MOCK DATA</Text>
        </View>
        <View style={{ flex: 1 }} />
        <Text style={{ ...fSans(500, 11), color: colors.headerMuted }}>
          {month === 'aug' ? 'Aug 17 · 9:41 AM' : 'July 2026 · closed'}
        </Text>
      </View>

      {/* Filter chips */}
      <View style={{ backgroundColor: colors.ink, paddingHorizontal: 14, paddingBottom: 12, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', gap: 4, flex: 1 }}>
          {([['all', 'ALL'], ['soho', 'SOHO'], ['mid', 'MID'], ['bkn', 'BKN']] as Array<[LocFilter, string]>).map(([id, label]) => (
            <Chip key={id} label={label} active={loc === id} onPress={() => { setLoc(id); setSheetKey(null); }} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {([['aug', 'AUG'], ['jul', 'JUL']] as Array<[MonthKey, string]>).map(([id, label]) => (
            <Chip key={id} label={label} active={month === id} onPress={() => { setMonth(id); setSheetKey(null); }} />
          ))}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 28, gap: 18 }}>
        {/* Monark Score */}
        <Pressable onPress={open('score')} style={{ backgroundColor: colors.ink, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <View style={{ width: 84, height: 84 }}>
            <Svg width={84} height={84} viewBox="0 0 84 84">
              <Circle cx={42} cy={42} r={36} fill="none" stroke={colors.ringTrack} strokeWidth={7} />
              <Circle
                cx={42} cy={42} r={36} fill="none"
                stroke={scoreColor} strokeWidth={7} strokeLinecap="round"
                strokeDasharray={`${((score / 100) * ringCirc).toFixed(1)} ${ringCirc}`}
                transform="rotate(-90 42 42)"
              />
            </Svg>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ ...fMono(700, 26), color: colors.appBg, lineHeight: 26 }}>{score}</Text>
              <Text style={{ ...fSans(600, 7.5, 0.12), color: colors.scoreSub }}>/ 100</Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ ...fSans(600, 9.5, 0.14), color: colors.gold, marginBottom: 4 }}>
              MONARK SCORE · {locationNames[loc].toUpperCase()}
            </Text>
            <Text style={{ ...fSans(600, 15), lineHeight: 18.75, color: colors.appBg }}>{scoreLabel}</Text>
            <Text style={{ ...fSans(400, 11.5), lineHeight: 16.7, color: colors.headerMuted, marginTop: 4 }}>{scoreDriver}</Text>
          </View>
          <Text style={{ color: colors.chevron, fontSize: 18 }}>›</Text>
        </Pressable>

        {/* Today */}
        {month === 'aug' && (
          <View>
            <SectionLabel>TODAY · SUN AUG 17</SectionLabel>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {todayStats.map((s) => (
                <Pressable key={s.label} onPress={s.open} style={{ ...card, flex: 1, paddingTop: 12, paddingHorizontal: 12, paddingBottom: 10 }}>
                  <Text style={{ ...fSans(500, 10), color: colors.textSecondary2 }}>{s.label}</Text>
                  <Text style={{ ...fMono(600, 19, -0.02), color: colors.text, marginTop: 4, marginBottom: 3 }}>{s.val}</Text>
                  <Text style={{ ...fSans(500, 10), color: s.up ? colors.green : colors.red }}>{s.delta}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Cash position */}
        <View>
          <SectionLabel>CASH POSITION</SectionLabel>
          {[cashStats.slice(0, 2), cashStats.slice(2)].map((rowStats, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: i === 0 ? 8 : 0 }}>
              {rowStats.map((s) => (
                <Pressable key={s.label} onPress={s.open} style={{ ...card, flex: 1, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 11 }}>
                  <Text style={{ ...fSans(500, 10), color: colors.textSecondary2 }}>{s.label}</Text>
                  <Text style={{ ...fMono(600, 18, -0.02), color: s.color, marginTop: 3 }}>{s.val}</Text>
                  <Text style={{ ...fSans(400, 10.5), color: colors.muted, marginTop: 2 }}>{s.sub}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>

        {/* MTD P&L */}
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginHorizontal: 2, marginBottom: 8 }}>
            <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2 }}>
              {month === 'aug' ? 'MONTH TO DATE · AUG 1–17' : 'JULY 2026 · FULL MONTH'}
            </Text>
            <Text style={{ ...fSans(400, 10), color: colors.faint }}>accrual basis</Text>
          </View>
          <View style={{ ...card, paddingVertical: 4, paddingHorizontal: 14 }}>
            {plRows.map((r, i, arr) => {
              const last = i === arr.length - 1;
              return (
                <Pressable
                  key={r.key}
                  onPress={open(r.key)}
                  style={{
                    flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 10,
                    borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.divider,
                    borderTopWidth: last ? 1.5 : 0, borderTopColor: colors.text,
                    marginTop: last ? 2 : 0,
                  }}
                >
                  <Text style={{ ...fSans(r.strong ? 600 : 500, 12.5), color: colors.text, flex: 1 }}>{r.label}</Text>
                  <Text style={{ ...fMono(400, 11), color: colors.muted, width: 52, textAlign: 'right' }}>{r.pct}</Text>
                  <Text style={{ ...fMono(600, 13), color: r.strong ? (profit >= 0 ? colors.green : colors.red) : colors.text, minWidth: 84, textAlign: 'right' }}>
                    {r.val}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {ratioStats.map((s) => (
              <Pressable key={s.key} onPress={open(s.key)} style={{ ...card, flex: 1, paddingTop: 10, paddingHorizontal: 8, paddingBottom: 9, alignItems: 'center' }}>
                <Text style={{ ...fSans(500, 9), color: colors.textSecondary2 }} numberOfLines={1}>{s.label}</Text>
                <Text style={{ ...fMono(600, 15), color: s.v > s.target ? colors.red : colors.green, marginTop: 3, marginBottom: 2 }}>
                  {pctf(s.v)}
                </Text>
                <Text style={{ ...fSans(400, 9), color: colors.faint }}>tgt {s.target}%</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* AI insights */}
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginHorizontal: 2, marginBottom: 8 }}>
            <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, flex: 1 }}>AI INSIGHTS</Text>
            <Text style={{ ...fSans(500, 10), color: colors.muted }}>confidence shown</Text>
          </View>
          <View style={{ gap: 8 }}>
            {insights.map((i) => (
              <View key={i.title} style={{ ...card, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', gap: 10 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 4, backgroundColor: sevColor[i.sev] }} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                    <Text style={{ ...fSans(600, 11.5), color: colors.text, flex: 1 }}>{i.title}</Text>
                    <Text style={{ ...fMono(500, 9.5), color: colors.muted }}>conf {i.conf}</Text>
                  </View>
                  <Text style={{ ...fSans(400, 11), lineHeight: 16.5, color: colors.textSecondary, marginTop: 3 }}>{i.body}</Text>
                  <Text style={{ ...fSans(500, 10), color: colors.muted, marginTop: 5 }}>{i.meta}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <Text style={{ ...fSans(400, 10), color: colors.faint, textAlign: 'center', paddingTop: 4, paddingBottom: 8 }}>
          All figures are mock development data — not production financials.
        </Text>
      </ScrollView>

      {/* Drill-down bottom sheet */}
      {sheet && (
        <>
          <Pressable
            onPress={() => setSheetKey(null)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim, zIndex: 10 }}
          />
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 11, backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 14, paddingHorizontal: 18, paddingBottom: 26, maxHeight: '68%' }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.sheetHandle, alignSelf: 'center', marginBottom: 12 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <Text style={{ ...fSans(600, 15), color: colors.text, flex: 1 }}>{sheet.title}</Text>
              <View style={{ borderWidth: 1, borderColor: colors.mockBorder, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5 }}>
                <Text style={{ ...fMono(600, 8, 0.1), color: colors.mockText }}>MOCK</Text>
              </View>
              <Pressable onPress={() => setSheetKey(null)} style={{ backgroundColor: colors.sheetClose, borderRadius: 13, width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>✕</Text>
              </Pressable>
            </View>
            <Text style={{ ...fSans(400, 11), color: colors.muted, marginBottom: 10 }}>{sheet.sub}</Text>
            <ScrollView>
              {sheet.rows.map((r, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                  <Text style={{ ...fSans(500, 12.5), color: colors.text, flex: 1 }}>{r.label}</Text>
                  <Text style={{ ...fSans(400, 10.5), color: colors.muted }}>{r.sub}</Text>
                  <Text style={{ ...fMono(600, 12.5), color: colors.text, minWidth: 70, textAlign: 'right' }}>{r.val}</Text>
                </View>
              ))}
            </ScrollView>
            <Text style={{ ...fSans(400, 10), color: colors.faint, marginTop: 10 }}>
              Drill-down of mock data. Tapping through would open the full ledger view with source transactions.
            </Text>
          </View>
        </>
      )}
    </View>
  );
}
