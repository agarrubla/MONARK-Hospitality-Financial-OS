/**
 * POS (provider-neutral) — pixel-perfect port of "Monark POS.dc.html".
 * Daily sales per location (normalized schema, provider only a badge),
 * POS detail with tender balance check + provenance, deposits
 * (expected/received/variance), reconciliation with exceptions.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  depositBadges, money, moneyK, posDays, posDeposits, posProviders,
} from '../data/posData';
import { colors, fMono, fSans } from '../theme/tokens';

type ViewKey = 'daily' | 'detail' | 'deposits' | 'recon';

const card = {
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.cardBorder,
  borderRadius: 12,
} as const;

function SrcBadge({ src, color }: { src: string; color: string }) {
  return (
    <View style={{ backgroundColor: color, borderRadius: 4, paddingVertical: 2.5, paddingHorizontal: 6 }}>
      <Text style={{ ...fMono(600, 8, 0.08), color: '#fff' }}>{src}</Text>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ borderRadius: 6, paddingVertical: 4, paddingHorizontal: 9, backgroundColor: active ? colors.gold : colors.card, borderWidth: active ? 0 : 1, borderColor: colors.cardBorder }}
    >
      <Text style={{ ...fMono(600, 10, 0.03), color: active ? colors.ink : colors.textSecondary2 }}>{label}</Text>
    </Pressable>
  );
}

export default function POSScreen() {
  const [view, setView] = useState<ViewKey>('daily');
  const [locIdx, setLocIdx] = useState(0);
  const [day, setDay] = useState<'sat' | 'fri'>('sat');
  const [depFilter, setDepFilter] = useState<'all' | 'open' | 'matched'>('all');

  const dayData = posDays[day];
  const d = dayData[locIdx] ?? dayData[0];

  const salesRows: Array<[string, number, boolean]> = [
    ['Gross sales', d.gross, false],
    ['Discounts', -d.discounts, false],
    ['Comps', -d.comps, false],
    ['Refunds', -d.refunds, false],
    ['Net sales', d.net, true],
    ['— Food sales', d.food, false],
    ['— Beverage sales', d.bev, false],
    ['Taxes collected', d.tax, false],
    ['Tips', d.tips, false],
  ];
  const tenderTotal = d.cash + d.card + d.other;
  // Per the schema (§8.1 tender_breakdown trigger) and the section title:
  // tender must equal gross + tax + tips. The prototype's JS subtracted
  // discounts/comps/refunds too, which would flag every clean day as off.
  const target = d.gross + d.tax + d.tips;
  const tenderOk = Math.abs(tenderTotal - target) < 1;

  const deps = posDeposits.filter(
    (x) => depFilter === 'all' || (depFilter === 'open' ? ['Variance', 'Missing', 'Expected'].includes(x.status) : x.status === 'Matched'),
  );

  const reconRows = [
    { loc: 'Vela Trattoria Midtown', note: 'Aug 15 card batch $9,008.00 matched Aug 16 · cash verified', amt: '✓ closed', ok: true },
    { loc: 'Vela Soho', note: 'Aug 14 batch short $482.00 — held chargeback suspected · exception open', amt: '−$482.00', ok: false },
    { loc: 'Bar Vela Brooklyn', note: 'Cash drop Aug 12–13 not received · escalated to GM', amt: '−$1,840.00', ok: false },
  ];
  const exceptions = [
    { title: 'Soho card batch variance', amt: '−$482.00', note: 'Expected $6,214.00 (Aug 14 tender), received $5,732.00. Pattern matches a held chargeback. Booked as processor receivable — sales untouched.', owner: 'AI insight raised · assigned to Controller', color: colors.amber, border: colors.amberBorder },
    { title: 'Brooklyn cash deposit missing', amt: '−$1,840.00', note: 'Cash drops for Aug 12–13 never reached the bank. Cash-in-transit outstanding 2 days past window.', owner: 'Escalated to J. Osei (GM Brooklyn) · Aug 16', color: colors.red, border: colors.redBorder },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg, overflow: 'hidden' }}>
      {/* Header */}
      <View style={{ backgroundColor: colors.ink, paddingTop: 14, paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {view === 'detail' && (
          <Pressable onPress={() => setView('daily')} style={{ backgroundColor: colors.inkSecondary, borderRadius: 8, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.gold, fontSize: 15 }}>‹</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ ...fMono(700, 15, 0.18), color: colors.appBg }} numberOfLines={1}>
            {view === 'detail' ? 'POS DETAIL' : view === 'deposits' ? 'POS DEPOSITS' : view === 'recon' ? 'POS RECONCILIATION' : 'POS SALES'}
          </Text>
          <Text style={{ ...fSans(500, 10), color: colors.headerMuted, marginTop: 1 }} numberOfLines={1}>
            {view === 'detail' ? d.loc + ' · ' + d.date : 'Provider-neutral feed · Vela Group · Aug 17, 9:41 AM'}
          </Text>
        </View>
        <View style={{ borderWidth: 1, borderColor: colors.gold, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5 }}>
          <Text style={{ ...fMono(600, 8.5, 0.1), color: colors.gold }}>MOCK DATA</Text>
        </View>
      </View>

      {/* ── Daily sales ── */}
      {view === 'daily' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 14 }}>
          <View>
            <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, marginHorizontal: 2, marginBottom: 8 }}>
              CONNECTED PROVIDERS · NORMALIZED FEED
            </Text>
            <View style={{ gap: 6 }}>
              {posProviders.map((p) => (
                <View key={p.name} style={{ ...card, paddingVertical: 10, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: p.color, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ ...fMono(700, 13), color: '#fff' }}>{p.initial}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...fSans(600, 12), color: colors.text }}>{p.name}</Text>
                    <Text style={{ ...fSans(400, 9.5), color: colors.muted, marginTop: 1 }}>{p.meta}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ ...fMono(600, 8.5, 0.06), color: p.state === 'CONNECTED' ? colors.green : colors.faint }}>{p.state}</Text>
                    {!!p.sync && <Text style={{ ...fSans(400, 9), color: colors.faint, marginTop: 1 }}>{p.sync}</Text>}
                  </View>
                </View>
              ))}
            </View>
            <Text style={{ ...fSans(400, 10), lineHeight: 15, color: colors.muted, marginTop: 8, marginHorizontal: 2 }}>
              Every provider maps into one normalized sales schema through a per-provider adapter — screens below never know which POS produced the numbers. New providers are new adapters, not new screens.
            </Text>
          </View>

          <View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginHorizontal: 2, marginBottom: 8 }}>
              <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, flex: 1 }}>
                DAILY SALES · {day === 'sat' ? 'SAT AUG 16' : 'FRI AUG 15'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {([['sat', 'SAT 16'], ['fri', 'FRI 15']] as const).map(([id, label]) => (
                  <Chip key={id} label={label} active={day === id} onPress={() => setDay(id)} />
                ))}
              </View>
            </View>
            <View style={{ gap: 8 }}>
              {dayData.map((r, i) => (
                <Pressable key={r.loc} onPress={() => { setLocIdx(i); setView('detail'); }} style={{ ...card, paddingVertical: 12, paddingHorizontal: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={{ ...fSans(600, 12.5), color: colors.text, flex: 1 }}>{r.loc}</Text>
                    <SrcBadge src={r.src} color={r.srcColor} />
                    <Text style={{ ...fMono(600, 14), color: colors.text }}>{moneyK(r.net)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <Text style={{ ...fSans(400, 10), color: colors.muted, flex: 1 }}>
                      {r.txns} txns · avg {money(r.avg)} · gross {moneyK(r.gross)}
                    </Text>
                    <Text style={{ ...fSans(500, 10), color: r.delta >= 0 ? colors.green : colors.red }}>
                      {(r.delta >= 0 ? '▲ ' : '▼ ') + Math.abs(r.delta).toFixed(1) + '% vs last ' + (day === 'sat' ? 'Sat' : 'Fri')}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1.5, marginTop: 8 }}>
                    <View style={{ flex: r.food, backgroundColor: colors.green }} />
                    <View style={{ flex: r.bev, backgroundColor: colors.gold }} />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 5 }}>
                    <Text style={{ ...fSans(400, 9), color: colors.muted }}>
                      <Text style={{ color: colors.green }}>■</Text> Food {moneyK(r.food)}
                    </Text>
                    <Text style={{ ...fSans(400, 9), color: colors.muted }}>
                      <Text style={{ color: colors.gold }}>■</Text> Bev {moneyK(r.bev)}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {/* ── Detail ── */}
      {view === 'detail' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 14 }}>
          <View style={{ ...card, paddingVertical: 15, paddingHorizontal: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ ...fSans(600, 15), color: colors.text }}>{d.loc}</Text>
                <Text style={{ ...fMono(500, 10.5), color: colors.textSecondary2, marginTop: 2 }}>
                  {d.date} · business day {d.hours}
                </Text>
              </View>
              <SrcBadge src={d.src} color={d.srcColor} />
            </View>
            <Text style={{ ...fMono(700, 26, -0.02), color: colors.text, marginTop: 10, marginBottom: 2 }}>{moneyK(d.net)}</Text>
            <Text style={{ ...fSans(400, 10.5), color: colors.muted }}>
              net sales · {d.txns} transactions · avg check {money(d.avg)}
            </Text>
          </View>

          <View>
            <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, marginHorizontal: 2, marginBottom: 8 }}>
              SALES BREAKDOWN · NORMALIZED SCHEMA
            </Text>
            <View style={{ ...card, paddingVertical: 4, paddingHorizontal: 14 }}>
              {salesRows.map(([label, v, strong], i, arr) => (
                <View
                  key={label}
                  style={{
                    flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 8,
                    borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderBottomColor: colors.divider,
                    borderTopWidth: strong ? 1.5 : 0, borderTopColor: colors.text,
                  }}
                >
                  <Text style={{ ...fSans(strong ? 600 : 500, 12), color: label.startsWith('—') ? colors.textSecondary2 : colors.text, flex: 1, paddingLeft: label.startsWith('—') ? 8 : 0 }}>
                    {label}
                  </Text>
                  <Text style={{ ...fMono(600, 12.5), color: strong ? colors.green : colors.text, minWidth: 76, textAlign: 'right' }}>
                    {(v < 0 ? '−' : '') + money(Math.abs(v))}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <View>
            <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, marginHorizontal: 2, marginBottom: 8 }}>
              TENDER · MUST EQUAL GROSS + TAX + TIPS
            </Text>
            <View style={{ ...card, paddingVertical: 4, paddingHorizontal: 14 }}>
              {([['Cash', 'incl. cash tips', d.cash], ['Credit card', 'all card networks', d.card], ['Other', 'gift card · delivery apps', d.other]] as const).map(([label, sub, v]) => (
                <View key={label} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 8.5, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                  <Text style={{ ...fSans(500, 12), color: colors.text, flex: 1 }}>{label}</Text>
                  <Text style={{ ...fSans(400, 10), color: colors.muted }}>{sub}</Text>
                  <Text style={{ ...fMono(600, 12.5), color: colors.text, minWidth: 76, textAlign: 'right' }}>{money(v)}</Text>
                </View>
              ))}
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 9 }}>
                <Text style={{ ...fSans(600, 11), color: colors.textSecondary2, flex: 1 }}>Tender check</Text>
                <Text style={{ ...fMono(600, 11), color: tenderOk ? colors.green : colors.red }}>
                  {tenderOk ? '✓ balances to the penny' : '✗ off by ' + money(Math.abs(tenderTotal - target))}
                </Text>
              </View>
            </View>
          </View>

          <View style={{ backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16 }}>
            <Text style={{ ...fSans(600, 9, 0.12), color: colors.gold, marginBottom: 7 }}>PROVENANCE</Text>
            <Text style={{ ...fSans(400, 11), lineHeight: 17.6, color: '#c7d4cd' }}>{d.provenance}</Text>
          </View>
        </ScrollView>
      )}

      {/* ── Deposits ── */}
      {view === 'deposits' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 14 }}>
          <Text style={{ ...fSans(400, 11), lineHeight: 17.6, color: colors.textSecondary, paddingHorizontal: 2 }}>
            Expected deposits are derived from tender totals and each provider's settlement schedule. Revenue is booked from sales — a deposit match books nothing new; a variance opens an exception.
          </Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {([['all', 'ALL'], ['open', 'OPEN'], ['matched', 'MATCHED']] as const).map(([id, label]) => (
              <Chip key={id} label={label} active={depFilter === id} onPress={() => setDepFilter(id)} />
            ))}
          </View>
          <View style={{ gap: 8 }}>
            {deps.map((x) => {
              const [c, bg] = depositBadges[x.status];
              const varAmt = x.actual !== null ? x.actual - x.expected : null;
              return (
                <View key={x.id} style={{ ...card, paddingVertical: 12, paddingHorizontal: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={{ ...fSans(600, 12), color: colors.text, flex: 1 }}>{x.title}</Text>
                    <View style={{ backgroundColor: bg, borderRadius: 4, paddingVertical: 2.5, paddingHorizontal: 6 }}>
                      <Text style={{ ...fSans(600, 8.5, 0.04), color: c, textTransform: 'uppercase' }}>{x.status}</Text>
                    </View>
                  </View>
                  <Text style={{ ...fSans(400, 10), color: colors.muted, marginTop: 3 }}>{x.meta}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ ...fSans(400, 9), color: colors.faint }}>EXPECTED</Text>
                      <Text style={{ ...fMono(600, 12.5), color: colors.text }}>{money(x.expected)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ ...fSans(400, 9), color: colors.faint }}>RECEIVED</Text>
                      <Text style={{ ...fMono(600, 12.5), color: colors.text }}>{x.actual !== null ? money(x.actual) : '—'}</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={{ ...fSans(400, 9), color: colors.faint }}>VARIANCE</Text>
                      <Text style={{ ...fMono(600, 12.5), color: varAmt === null ? colors.faint : varAmt === 0 ? colors.green : colors.red }}>
                        {varAmt === null ? '—' : varAmt === 0 ? '$0.00' : '−' + money(Math.abs(varAmt))}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* ── Reconcile ── */}
      {view === 'recon' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 14 }}>
          <View style={{ ...card, paddingVertical: 14, paddingHorizontal: 16 }}>
            <Text style={{ ...fSans(600, 12), color: colors.text }}>Daily close · Sat Aug 16</Text>
            <Text style={{ ...fSans(400, 10.5), color: colors.muted, marginTop: 2 }}>POS sales vs bank deposits, all locations</Text>
            <View style={{ marginTop: 10 }}>
              {reconRows.map((r) => (
                <View key={r.loc} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.divider }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: r.ok ? colors.greenBgLight : colors.amberBg }}>
                    <Text style={{ ...fSans(700, 11), color: r.ok ? colors.green : colors.amber }}>{r.ok ? '✓' : '!'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...fSans(600, 11.5), color: colors.text }}>{r.loc}</Text>
                    <Text style={{ ...fSans(400, 10), lineHeight: 15, color: colors.textSecondary2, marginTop: 1 }}>{r.note}</Text>
                  </View>
                  <Text style={{ ...fMono(600, 11.5), color: r.ok ? colors.green : colors.red }}>{r.amt}</Text>
                </View>
              ))}
            </View>
          </View>

          <View>
            <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, marginHorizontal: 2, marginBottom: 8 }}>OPEN EXCEPTIONS</Text>
            <View style={{ gap: 8 }}>
              {exceptions.map((x) => (
                <View key={x.title} style={{ backgroundColor: colors.card, borderWidth: 1.5, borderColor: x.border, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={{ ...fSans(600, 11.5), color: colors.text, flex: 1 }}>{x.title}</Text>
                    <Text style={{ ...fMono(600, 12), color: x.color }}>{x.amt}</Text>
                  </View>
                  <Text style={{ ...fSans(400, 10.5), lineHeight: 15.75, color: colors.textSecondary2, marginTop: 3 }}>{x.note}</Text>
                  <Text style={{ ...fSans(500, 9.5), color: colors.muted, marginTop: 5 }}>{x.owner}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={{ backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16 }}>
            <Text style={{ ...fSans(600, 9, 0.12), color: colors.gold, marginBottom: 7 }}>RECONCILIATION PRINCIPLE</Text>
            <Text style={{ ...fSans(400, 11), lineHeight: 17.6, color: '#c7d4cd' }}>
              Sales are revenue events; deposits are cash events. Reconciliation links them — it never re-books either. A short deposit is a processor receivable, not a sales adjustment.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Bottom tab bar */}
      <View style={{ backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.cardBorder, flexDirection: 'row', paddingTop: 6, paddingHorizontal: 8, paddingBottom: 4 }}>
        {([['daily', '◈', 'Daily Sales'], ['deposits', '⏷', 'Deposits'], ['recon', '⇄', 'Reconcile']] as const).map(([id, icon, label]) => {
          const active = view === id || (view === 'detail' && id === 'daily');
          return (
            <Pressable key={id} onPress={() => setView(id)} style={{ flex: 1, paddingVertical: 6, alignItems: 'center' }}>
              <Text style={{ fontSize: 16, lineHeight: 16, color: active ? colors.green : colors.faint }}>{icon}</Text>
              <Text style={{ ...fSans(600, 9), color: active ? colors.green : colors.faint, marginTop: 3 }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
