/**
 * Reconciliation — pixel-perfect port of "Monark Reconciliation.dc.html".
 * 4 match types (Invoice→Payment, Payment→Bank, POS→Bank, Transfers),
 * 4 statuses, per-signal evidence (✓/✕/~), confirm/reject with
 * duplicate-match guards, audit trail.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  reconItems, statusMeta, typeMeta,
  type EvidenceSym, type MatchStatus, type MatchType, type ReconItem,
} from '../data/reconciliationData';
import { colors, fMono, fSans } from '../theme/tokens';

const card = {
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.cardBorder,
  borderRadius: 12,
} as const;

function StatusBadge({ status }: { status: MatchStatus }) {
  const [c, bg] = statusMeta[status];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 4, paddingVertical: 2.5, paddingHorizontal: 6 }}>
      <Text style={{ ...fSans(600, 8, 0.04), color: c, textTransform: 'uppercase' }} numberOfLines={1}>{status}</Text>
    </View>
  );
}

function TypeIcon({ type, size = 24 }: { type: MatchType; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size === 24 ? 7 : 8, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.gold, fontSize: size === 24 ? 11 : 12 }}>{typeMeta[type][0]}</Text>
    </View>
  );
}

const evMarkColors: Record<EvidenceSym, [string, string]> = {
  '✓': ['#eaf3ee', '#14584a'],
  '✕': ['#faeeeb', '#b3402e'],
  '~': ['#f0efe9', '#8b978f'],
};

export default function ReconciliationScreen() {
  const [view, setView] = useState<'board' | 'detail'>('board');
  const [itemId, setItemId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | MatchStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | MatchType>('all');
  const [decisions, setDecisions] = useState<Record<string, 'confirm' | 'reject'>>({});

  const items: ReconItem[] = useMemo(
    () =>
      reconItems.map((it) => {
        const dec = decisions[it.id];
        if (!dec) return it;
        if (dec === 'confirm') {
          return {
            ...it, status: 'Matched' as const, canAct: false,
            trail: [[
              'Match confirmed',
              'Confirmed from mobile. ' + (it.id === 'm2' ? 'Scheduled Aug 28 ACH cancelled — duplicate payment prevented. ' : '') + 'Links locked; both records now reconciled.',
              'M. Okafor (Controller)', 'Aug 17 · 9:41 AM',
            ] as [string, string, string, string], ...it.trail],
          };
        }
        return {
          ...it, status: 'Unmatched' as const, canAct: false,
          trail: [[
            'Match rejected',
            'Marked not-a-match from mobile. Candidate suppressed; both records returned to unmatched pools. Decision logged.',
            'M. Okafor (Controller)', 'Aug 17 · 9:41 AM',
          ] as [string, string, string, string], ...it.trail],
        };
      }),
    [decisions],
  );

  const statuses: MatchStatus[] = ['Matched', 'Possible Match', 'Unmatched', 'Exception'];
  const visible = items.filter(
    (i) => (statusFilter === 'all' || i.status === statusFilter) && (typeFilter === 'all' || i.type === typeFilter),
  );

  const d = items.find((i) => i.id === itemId) ?? items[0];
  const dec = decisions[d.id];
  const [dColor] = statusMeta[d.status];

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg, overflow: 'hidden' }}>
      {/* Header */}
      <View style={{ backgroundColor: colors.ink, paddingTop: 14, paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {view === 'detail' && (
          <Pressable onPress={() => setView('board')} style={{ backgroundColor: colors.inkSecondary, borderRadius: 8, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.gold, fontSize: 15 }}>‹</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ ...fMono(700, 15, 0.18), color: colors.appBg }} numberOfLines={1}>
            {view === 'board' ? 'RECONCILIATION' : 'MATCH REVIEW'}
          </Text>
          <Text style={{ ...fSans(500, 10), color: colors.headerMuted, marginTop: 1 }} numberOfLines={1}>
            {view === 'board' ? 'Matching engine · all accounts · Aug 17, 9:41 AM' : d.title}
          </Text>
        </View>
        <View style={{ borderWidth: 1, borderColor: colors.gold, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5 }}>
          <Text style={{ ...fMono(600, 8.5, 0.1), color: colors.gold }}>MOCK DATA</Text>
        </View>
      </View>

      {/* ── Board ── */}
      {view === 'board' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 14 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {statuses.map((s) => {
              const n = items.filter((i) => i.status === s).length;
              const [c] = statusMeta[s];
              const on = statusFilter === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => setStatusFilter(on ? 'all' : s)}
                  style={{ flex: 1, backgroundColor: colors.card, borderWidth: 1.5, borderColor: on ? c : colors.cardBorder, borderRadius: 12, paddingTop: 10, paddingBottom: 9, paddingHorizontal: 6, alignItems: 'center' }}
                >
                  <Text style={{ ...fMono(600, 17), color: c }}>{n}</Text>
                  <Text style={{ ...fSans(500, 8.5), color: colors.textSecondary2, marginTop: 2 }} numberOfLines={1}>
                    {s.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingBottom: 2 }}>
            {([['all', 'ALL'], ['inv_pay', 'INV→PAY'], ['pay_bank', 'PAY→BANK'], ['pos_bank', 'POS→BANK'], ['transfer', 'TRANSFERS']] as const).map(([id, label]) => {
              const on = typeFilter === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => setTypeFilter(id)}
                  style={{ borderRadius: 6, paddingVertical: 5, paddingHorizontal: 9, backgroundColor: on ? colors.gold : colors.card, borderWidth: on ? 0 : 1, borderColor: colors.cardBorder }}
                >
                  <Text style={{ ...fMono(600, 10, 0.03), color: on ? colors.ink : colors.textSecondary2 }}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={{ gap: 8 }}>
            {visible.map((i) => {
              const [c] = statusMeta[i.status];
              return (
                <Pressable key={i.id} onPress={() => { setItemId(i.id); setView('detail'); }} style={{ ...card, paddingVertical: 12, paddingHorizontal: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TypeIcon type={i.type} />
                    <Text style={{ ...fSans(600, 11.5), color: colors.text, flex: 1 }} numberOfLines={1}>{i.title}</Text>
                    <StatusBadge status={i.status} />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ ...fMono(500, 10), color: colors.textSecondary }} numberOfLines={1}>{i.left.title}</Text>
                      <Text style={{ ...fSans(400, 9), color: colors.faint, marginTop: 1 }}>{i.left.kind}</Text>
                    </View>
                    <Text style={{ ...fMono(600, 12), color: c }}>{i.status === 'Unmatched' ? '⇢?' : '⇢'}</Text>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={{ ...fMono(500, 10), color: colors.textSecondary }} numberOfLines={1}>{i.right.title}</Text>
                      <Text style={{ ...fSans(400, 9), color: colors.faint, marginTop: 1 }}>{i.right.kind}</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* ── Detail ── */}
      {view === 'detail' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TypeIcon type={d.type} size={26} />
            <Text style={{ ...fSans(600, 12), color: colors.text, flex: 1 }}>{typeMeta[d.type][1]}</Text>
            <StatusBadge status={d.status} />
          </View>

          <View style={{ gap: 8 }}>
            <View style={{ ...card, paddingVertical: 13, paddingHorizontal: 15 }}>
              <Text style={{ ...fSans(600, 9, 0.1), color: colors.goldText, marginBottom: 6 }}>{d.left.kind}</Text>
              <Text style={{ ...fSans(600, 13), color: colors.text }}>{d.left.title}</Text>
              <Text style={{ ...fSans(400, 10.5), color: colors.muted, marginTop: 2 }}>{d.left.sub}</Text>
              <Text style={{ ...fMono(700, 18), color: colors.text, marginTop: 6 }}>{d.left.amt}</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: dColor, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ ...fMono(700, 12), color: '#fff' }}>{d.status === 'Unmatched' ? '?' : '⇅'}</Text>
              </View>
            </View>
            <View style={{ ...card, paddingVertical: 13, paddingHorizontal: 15 }}>
              <Text style={{ ...fSans(600, 9, 0.1), color: colors.blue, marginBottom: 6 }}>{d.right.kind}</Text>
              <Text style={{ ...fSans(600, 13), color: colors.text }}>{d.right.title}</Text>
              <Text style={{ ...fSans(400, 10.5), color: colors.muted, marginTop: 2 }}>{d.right.sub}</Text>
              {!!d.right.amt && <Text style={{ ...fMono(700, 18), color: colors.text, marginTop: 6 }}>{d.right.amt}</Text>}
            </View>
          </View>

          <View>
            <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, marginHorizontal: 2, marginBottom: 8 }}>MATCH EVIDENCE</Text>
            <View style={{ ...card, paddingVertical: 4, paddingHorizontal: 14 }}>
              {d.evidence.map((e, i) => {
                const [bg, c] = evMarkColors[e.sym];
                return (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8.5, borderBottomWidth: i === d.evidence.length - 1 ? 0 : 1, borderBottomColor: colors.divider }}>
                    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ ...fSans(700, 10), color: c }}>{e.sym}</Text>
                    </View>
                    <Text style={{ ...fSans(500, 11), color: colors.textSecondary2, width: 88 }}>{e.label}</Text>
                    <Text style={{ ...fSans(400, 10.5), lineHeight: 15.2, color: colors.text, flex: 1 }}>{e.finding}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {!!d.guard && (
            <View style={{ backgroundColor: colors.redBg, borderWidth: 1.5, borderColor: colors.redBorder, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', gap: 9 }}>
              <Text style={{ fontSize: 12 }}>⛔</Text>
              <Text style={{ ...fSans(400, 10.5), lineHeight: 16.3, color: '#8a4a3c', flex: 1 }}>{d.guard}</Text>
            </View>
          )}

          {d.canAct && !dec && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setDecisions({ ...decisions, [d.id]: 'confirm' })} style={{ flex: 1, backgroundColor: colors.green, borderRadius: 9, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ ...fSans(600, 12.5), color: '#fff' }}>Confirm match</Text>
              </Pressable>
              <Pressable onPress={() => setDecisions({ ...decisions, [d.id]: 'reject' })} style={{ flex: 1, borderWidth: 1.5, borderColor: colors.scoreLow, backgroundColor: colors.card, borderRadius: 9, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ ...fSans(600, 12.5), color: colors.red }}>Not a match</Text>
              </Pressable>
            </View>
          )}

          {!!dec && (
            <View style={{ paddingVertical: 10, paddingHorizontal: 13, borderRadius: 9, backgroundColor: dec === 'confirm' ? colors.greenBgLight : colors.redBg }}>
              <Text style={{ ...fSans(500, 11), lineHeight: 16.5, color: dec === 'confirm' ? colors.green : colors.red }}>
                {dec === 'confirm'
                  ? '✓ Match confirmed and locked. Every linked record is now reconciled; the decision, evidence snapshot and actor are in the audit trail.'
                  : '✕ Marked not-a-match. Candidate suppressed for this pair; both sides returned to their unmatched pools.'}
              </Text>
            </View>
          )}

          <View>
            <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, marginHorizontal: 2, marginBottom: 8 }}>
              RECONCILIATION AUDIT TRAIL
            </Text>
            <View style={{ ...card, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 6 }}>
              {d.trail.map(([action, detail, actor, when], i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10, paddingBottom: 13 }}>
                  <View style={{ alignItems: 'center' }}>
                    <View style={{ width: 9, height: 9, borderRadius: 4.5, marginTop: 3, backgroundColor: i === 0 ? colors.gold : colors.sheetHandle }} />
                    {i < d.trail.length - 1 && <View style={{ width: 1.5, flex: 1, backgroundColor: colors.cardBorder, marginTop: 3 }} />}
                  </View>
                  <View style={{ flex: 1, marginTop: -2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <Text style={{ ...fSans(600, 11.5), color: colors.text, flex: 1 }}>{action}</Text>
                      <Text style={{ ...fMono(500, 9), color: colors.faint }}>{when}</Text>
                    </View>
                    {!!detail && <Text style={{ ...fSans(400, 10.5), lineHeight: 15.75, color: colors.textSecondary2, marginTop: 2 }}>{detail}</Text>}
                    <Text style={{ ...fSans(500, 9.5), color: colors.muted, marginTop: 2 }}>{actor}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
