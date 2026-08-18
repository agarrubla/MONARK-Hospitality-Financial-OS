/**
 * Reporting — pixel-perfect port of "Monark Reports.dc.html".
 * P&L, Cash Flow, Accrual-vs-Cash bridge, Expense analysis, Revenue analysis;
 * period chips (day/week/month/quarter/year/custom) + location chips; every
 * line drills to source IDs via bottom sheets.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  fmt, lineSheet, locationNames, pct, reportAgg,
  type LocFilter, type PeriodKey,
} from '../data/reportsData';
import { colors, fMono, fSans } from '../theme/tokens';

type ViewKey = 'pl' | 'cash' | 'avc' | 'exp' | 'rev';

const card = {
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.cardBorder,
  borderRadius: 12,
} as const;

interface LineRow {
  label: string;
  val: string;
  pct?: string;
  strong?: boolean;
  top?: boolean;
  last?: boolean;
  indent?: boolean;
  color?: string;
  sheet?: string;
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ borderRadius: 6, paddingVertical: 5, paddingHorizontal: 9, backgroundColor: active ? colors.gold : colors.inkSecondary }}
    >
      <Text style={{ ...fMono(600, 10, 0.03), color: active ? colors.ink : colors.headerMuted }}>{label}</Text>
    </Pressable>
  );
}

function LineCard({ rows, showPct, onOpen }: { rows: LineRow[]; showPct: boolean; onOpen: (key: string) => void }) {
  return (
    <View style={{ ...card, paddingVertical: 6, paddingHorizontal: 14 }}>
      {rows.map((r, i) => (
        <Pressable
          key={r.label + i}
          onPress={() => r.sheet && onOpen(r.sheet)}
          style={{
            flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 10,
            borderBottomWidth: r.last || i === rows.length - 1 ? 0 : 1, borderBottomColor: colors.divider,
            borderTopWidth: r.top ? 1.5 : 0, borderTopColor: colors.text,
          }}
        >
          <Text style={{ ...fSans(r.strong ? 600 : 500, 12.5), color: r.indent ? colors.textSecondary2 : colors.text, flex: 1, paddingLeft: r.indent ? 8 : 0 }}>
            {r.label}
          </Text>
          {showPct && (
            <Text style={{ ...fMono(400, 10.5), color: colors.muted, width: 48, textAlign: 'right' }}>{r.pct ?? ''}</Text>
          )}
          <Text style={{ ...fMono(600, 13), color: r.color ?? colors.text, minWidth: 84, textAlign: 'right' }}>{r.val}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function ReportsScreen() {
  const [view, setView] = useState<ViewKey>('pl');
  const [period, setPeriod] = useState<PeriodKey>('mtd');
  const [loc, setLoc] = useState<LocFilter>('all');
  const [sheetKey, setSheetKey] = useState<string | null>(null);

  const a = reportAgg(loc, period);
  const gross = a.rev - a.cogs;
  const op = gross - a.labor - a.opex;
  const cashIn = a.deposits;
  const cashOut = a.payments + a.payroll + a.taxes + a.otherOut;
  const ending = a.begin + cashIn - cashOut;
  const sheet = sheetKey ? lineSheet(sheetKey, a, loc, period) : null;
  const openSheet = (key: string) => setSheetKey(key);

  const plRows: LineRow[] = [
    { label: 'Revenue', val: fmt(a.rev), pct: '100%', sheet: 'rev' },
    { label: 'COGS', val: fmt(-a.cogs), pct: pct(a.cogs, a.rev), sheet: 'cogs' },
    { label: 'Gross profit', val: fmt(gross), pct: pct(gross, a.rev), strong: true, top: true, color: colors.green },
    { label: 'Labor', val: fmt(-a.labor), pct: pct(a.labor, a.rev), sheet: 'labor' },
    { label: 'Operating expenses', val: fmt(-a.opex), pct: pct(a.opex, a.rev), sheet: 'opex' },
    { label: 'Operating profit', val: fmt(op), pct: pct(op, a.rev), strong: true, top: true, color: op >= 0 ? colors.green : colors.red },
    { label: 'Operating margin', val: pct(op, a.rev), pct: '', strong: true, last: true, color: op >= 0 ? colors.green : colors.red },
  ];

  const cashRows: LineRow[] = [
    { label: 'Beginning cash', val: fmt(a.begin) },
    { label: 'Cash received', val: fmt(cashIn), color: colors.green, sheet: 'deposits' },
    { label: 'Expected deposits (in transit)', val: fmt(a.expDeposits), indent: true, sheet: 'deposits' },
    { label: 'Vendor payments', val: fmt(-a.payments), sheet: 'payments' },
    { label: 'Payroll', val: fmt(-a.payroll), sheet: 'payroll' },
    { label: 'Taxes', val: fmt(-a.taxes), sheet: 'taxes' },
    { label: 'Other expenses', val: fmt(-a.otherOut), sheet: 'other' },
    { label: 'Ending cash', val: fmt(ending), strong: true, top: true, last: true, color: colors.green },
  ];

  const bridgeRows: LineRow[] = [
    { label: 'Operating profit (accrual)', val: fmt(op), strong: true },
    { label: '+ Expenses invoiced, not yet paid', val: fmt(a.payments * 0.32), color: colors.green, sheet: 'payments' },
    { label: '− Paid this period, expensed earlier', val: fmt(-(a.payments * 0.11)), color: colors.red, sheet: 'payments' },
    { label: '± Deposit timing (in transit)', val: fmt(-a.expDeposits * 0.4), sheet: 'deposits' },
    { label: '± Payroll & tax timing', val: fmt(-(a.payroll * 0.06)), sheet: 'payroll' },
    { label: 'Net cash change', val: fmt(cashIn - cashOut), strong: true, top: true, last: true, color: cashIn - cashOut >= 0 ? colors.green : colors.red },
  ];

  const expCats: Array<[string, number, number]> = [
    ['COGS · Food', a.cogs * 0.74, 4.1],
    ['COGS · Beverage', a.cogs * 0.26, -1.2],
    ['Labor', a.labor, 6.8],
    ['Rent & occupancy', a.opex * 0.48, 0],
    ['Card fees', a.opex * 0.15, 2.1],
    ['Utilities & other', a.opex * 0.37, 12.4],
  ];
  const maxExp = Math.max(...expCats.map((c) => c[1]));

  const vendorMoves = [
    { vendor: 'Hudson Valley Produce', note: 'unit prices +12% vs July', delta: '+$1,840', up: true },
    { vendor: 'Sysco', note: 'volume down, price flat', delta: '−$920', up: false },
    { vendor: 'ConEdison', note: 'summer peak rates', delta: '+$410', up: true },
  ];

  const weekPattern: Array<[number, number]> = [[0.58, 0.52], [0.66, 0.58], [0.72, 0.66], [0.9, 0.82], [1.0, 1.0], [0.96, 1.1], [0.7, 0.8]];
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const revRows: LineRow[] = [
    { label: 'Total revenue', val: fmt(a.rev), pct: '100%', strong: true, sheet: 'rev' },
    { label: 'Food', val: fmt(a.food), pct: pct(a.food, a.rev), sheet: 'rev' },
    { label: 'Beverage', val: fmt(a.bev), pct: pct(a.bev, a.rev), sheet: 'rev' },
    { label: 'Avg check', val: '$37.12', pct: '' },
    { label: 'Transactions', val: Math.round(a.rev / 37.12).toLocaleString('en-US'), pct: '', last: true },
  ];

  const viewNames: Record<ViewKey, string> = { pl: 'P&L', cash: 'CASH FLOW', avc: 'ACCRUAL VS CASH', exp: 'EXPENSE ANALYSIS', rev: 'REVENUE ANALYSIS' };

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg, overflow: 'hidden' }}>
      {/* Header */}
      <View style={{ backgroundColor: colors.ink, paddingTop: 14, paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ ...fMono(700, 15, 0.18), color: colors.appBg }} numberOfLines={1}>{viewNames[view]}</Text>
          <Text style={{ ...fSans(500, 10), color: colors.headerMuted, marginTop: 1 }} numberOfLines={1}>
            {locationNames[loc]} · {a.label}
          </Text>
        </View>
        <View style={{ borderWidth: 1, borderColor: colors.gold, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5 }}>
          <Text style={{ ...fMono(600, 8.5, 0.1), color: colors.gold }}>MOCK DATA</Text>
        </View>
      </View>

      {/* Filter chips */}
      <View style={{ backgroundColor: colors.ink, paddingHorizontal: 14, paddingBottom: 12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingBottom: 2 }}>
          {([['day', 'DAY'], ['week', 'WEEK'], ['mtd', 'MONTH'], ['q', 'QUARTER'], ['yr', 'YEAR'], ['custom', 'CUSTOM']] as const).map(([id, label]) => (
            <Chip key={id} label={label} active={period === id} onPress={() => { setPeriod(id); setSheetKey(null); }} />
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
          {([['all', 'ALL'], ['soho', 'SOHO'], ['mid', 'MID'], ['bkn', 'BKN']] as const).map(([id, label]) => (
            <Chip key={id} label={label} active={loc === id} onPress={() => { setLoc(id); setSheetKey(null); }} />
          ))}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 24, gap: 16 }}>
        {view === 'pl' && (
          <>
            <LineCard rows={plRows} showPct onOpen={openSheet} />
            <Text style={{ ...fSans(400, 10), lineHeight: 15, color: colors.muted, paddingHorizontal: 2 }}>
              Accrual basis: expenses at expense date, revenue at business date. Tap any line to trace it to its transactions.
            </Text>
          </>
        )}

        {view === 'cash' && (
          <>
            <LineCard rows={cashRows} showPct={false} onOpen={openSheet} />
            <Text style={{ ...fSans(400, 10), lineHeight: 15, color: colors.muted, paddingHorizontal: 2 }}>
              Cash basis: money in and out by payment date. The AUG P&L expense for an invoice paid in SEP appears here only in SEP.
            </Text>
          </>
        )}

        {view === 'avc' && (
          <>
            <View style={{ backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16 }}>
              <Text style={{ ...fSans(600, 9, 0.12), color: colors.gold, marginBottom: 8 }}>WHY THESE DIFFER</Text>
              <Text style={{ ...fSans(400, 11), lineHeight: 17.6, color: '#c7d4cd' }}>
                Accrual answers "did we make money this period?" Cash answers "where did the money go?" One invoice contributes to each exactly once — on different dates.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ ...card, flex: 1, paddingVertical: 12, paddingHorizontal: 14 }}>
                <Text style={{ ...fSans(600, 9, 0.1), color: colors.green }}>ACCRUAL · P&L</Text>
                <Text style={{ ...fMono(700, 19), color: colors.text, marginTop: 6, marginBottom: 2 }}>{fmt(op)}</Text>
                <Text style={{ ...fSans(400, 9.5), color: colors.muted }}>operating profit</Text>
              </View>
              <View style={{ ...card, flex: 1, paddingVertical: 12, paddingHorizontal: 14 }}>
                <Text style={{ ...fSans(600, 9, 0.1), color: colors.amber }}>CASH · NET CHANGE</Text>
                <Text style={{ ...fMono(700, 19), color: colors.text, marginTop: 6, marginBottom: 2 }}>{fmt(cashIn - cashOut)}</Text>
                <Text style={{ ...fSans(400, 9.5), color: colors.muted }}>cash movement</Text>
              </View>
            </View>
            <View>
              <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, marginHorizontal: 2, marginBottom: 8 }}>
                BRIDGE · ACCRUAL → CASH
              </Text>
              <LineCard rows={bridgeRows} showPct={false} onOpen={openSheet} />
            </View>
            <View style={{ backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.mockBorder, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 }}>
              <Text style={{ ...fSans(600, 10.5), color: '#7a5c26' }}>Worked example in this period</Text>
              <Text style={{ ...fSans(400, 10.5), lineHeight: 16.8, color: '#7a5c26', marginTop: 4 }}>
                Hudson Valley HVP-90187 ($5,000, Aug 12) sits in August accrual COGS. Its ACH is scheduled Sep 3 — so it's{' '}
                <Text style={{ ...fSans(700, 10.5) }}>not</Text> in August cash out, and in September it will appear{' '}
                <Text style={{ ...fSans(700, 10.5) }}>only</Text> as cash, never as a second expense.
              </Text>
            </View>
          </>
        )}

        {view === 'exp' && (
          <>
            <View style={{ ...card, padding: 14 }}>
              <Text style={{ ...fSans(600, 10, 0.12), color: colors.textSecondary2, marginBottom: 10 }}>
                EXPENSES BY CATEGORY · {a.label}
              </Text>
              <View style={{ gap: 9 }}>
                {expCats.map(([label, v, delta]) => (
                  <Pressable
                    key={label}
                    onPress={() => openSheet(label.startsWith('COGS') ? 'cogs' : label === 'Labor' ? 'labor' : 'opex')}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <Text style={{ ...fSans(500, 11.5), color: colors.text, flex: 1 }}>{label}</Text>
                      <Text style={{ ...fSans(500, 9.5), color: delta > 0 ? colors.red : delta < 0 ? colors.green : colors.faint }}>
                        {delta === 0 ? 'flat' : (delta > 0 ? '▲ ' : '▼ ') + Math.abs(delta).toFixed(1) + '%'}
                      </Text>
                      <Text style={{ ...fMono(600, 12), color: colors.text, minWidth: 70, textAlign: 'right' }}>{fmt(v)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <View style={{ flex: 1, height: 7, borderRadius: 4, backgroundColor: colors.divider, overflow: 'hidden' }}>
                        <View style={{ height: '100%', borderRadius: 4, width: `${Math.round((v / maxExp) * 100)}%`, backgroundColor: label.startsWith('COGS') ? colors.green : label === 'Labor' ? colors.gold : '#8ba694' }} />
                      </View>
                      <Text style={{ ...fMono(400, 9.5), color: colors.muted, width: 40, textAlign: 'right' }}>{pct(v, a.rev)}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={{ ...card, paddingVertical: 13, paddingHorizontal: 15 }}>
              <Text style={{ ...fSans(600, 10, 0.12), color: colors.textSecondary2, marginBottom: 8 }}>TOP VENDOR MOVEMENTS</Text>
              {vendorMoves.map((v, i) => (
                <View key={v.vendor} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 7, borderBottomWidth: i === vendorMoves.length - 1 ? 0 : 1, borderBottomColor: colors.divider }}>
                  <Text style={{ ...fSans(500, 11.5), color: colors.text, flex: 1 }}>{v.vendor}</Text>
                  <Text style={{ ...fSans(400, 10), color: colors.muted }}>{v.note}</Text>
                  <Text style={{ ...fMono(600, 11), color: v.up ? colors.red : colors.green }}>{v.delta}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {view === 'rev' && (
          <>
            <View style={{ ...card, padding: 14 }}>
              <Text style={{ ...fSans(600, 10, 0.12), color: colors.textSecondary2, marginBottom: 10 }}>
                REVENUE · {a.label}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 110 }}>
                {weekDays.map((label, i) => {
                  const [f, b] = weekPattern[i]!;
                  return (
                    <View key={label} style={{ flex: 1, justifyContent: 'flex-end', height: '100%', gap: 1.5 }}>
                      <View style={{ width: '100%', borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: colors.gold, height: Math.round(b * 34) }} />
                      <View style={{ width: '100%', borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: colors.green, height: Math.round(f * 52) }} />
                      <Text style={{ ...fMono(400, 8), color: colors.faint, textAlign: 'center', marginTop: 3 }}>{label}</Text>
                    </View>
                  );
                })}
              </View>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                <Text style={{ ...fSans(400, 9.5), color: colors.muted }}>
                  <Text style={{ color: colors.green }}>■</Text> Food {fmt(a.food)}
                </Text>
                <Text style={{ ...fSans(400, 9.5), color: colors.muted }}>
                  <Text style={{ color: colors.gold }}>■</Text> Beverage {fmt(a.bev)}
                </Text>
              </View>
            </View>
            <LineCard rows={revRows} showPct onOpen={openSheet} />
          </>
        )}
      </ScrollView>

      {/* Drill-down bottom sheet */}
      {sheet && (
        <>
          <Pressable
            onPress={() => setSheetKey(null)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim, zIndex: 10 }}
          />
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 11, backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 14, paddingHorizontal: 18, paddingBottom: 26, maxHeight: '70%' }}>
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
            <Text style={{ ...fSans(400, 11), color: colors.muted, marginBottom: 10 }}>
              {sheet.sub} · {locationNames[loc]}
            </Text>
            <ScrollView>
              {sheet.rows.map((r, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...fSans(500, 12), color: colors.text }}>{r.label}</Text>
                    <Text style={{ ...fMono(400, 9.5), color: colors.faint, marginTop: 1 }}>{r.trace}</Text>
                  </View>
                  {!!r.sub && <Text style={{ ...fSans(400, 10.5), color: colors.muted }}>{r.sub}</Text>}
                  <Text style={{ ...fMono(600, 12.5), color: colors.text, minWidth: 70, textAlign: 'right' }}>{r.val}</Text>
                </View>
              ))}
            </ScrollView>
            <Text style={{ ...fSans(400, 10), lineHeight: 15, color: colors.faint, marginTop: 10 }}>
              Every line carries source IDs — tapping through in production opens the underlying invoice, payment or POS day.
            </Text>
          </View>
        </>
      )}

      {/* Bottom tab bar */}
      <View style={{ backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.cardBorder, flexDirection: 'row', paddingTop: 6, paddingHorizontal: 8, paddingBottom: 4 }}>
        {([['pl', '▤', 'P&L'], ['cash', '≋', 'Cash'], ['avc', '⇄', 'A vs C'], ['exp', '◔', 'Expense'], ['rev', '◉', 'Revenue']] as const).map(([id, icon, label]) => {
          const active = view === id;
          return (
            <Pressable key={id} onPress={() => { setView(id); setSheetKey(null); }} style={{ flex: 1, paddingVertical: 6, alignItems: 'center' }}>
              <Text style={{ fontSize: 15, lineHeight: 15, color: active ? colors.green : colors.faint }}>{icon}</Text>
              <Text style={{ ...fSans(600, 8.5), color: active ? colors.green : colors.faint, marginTop: 3 }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
