/**
 * Treasury — pixel-perfect port of "Monark Treasury.dc.html".
 * Ready-for-payment queue, payment calendar (3 weeks, ACH/wire bars, payroll
 * markers), payment history, detail with schedule/record/reference/note
 * actions. The invoice amount is locked — Treasury never edits it.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  calendarDays, money, PAYROLL_AMOUNT, paymentBadgeColors, treasuryPayments,
  type PaymentStatus, type TreasuryPayment,
} from '../data/treasuryData';
import { colors, fMono, fSans } from '../theme/tokens';

type ViewKey = 'ready' | 'calendar' | 'history' | 'detail';

interface Action {
  status?: PaymentStatus;
  schedDate?: string;
  method?: string;
  ref?: string;
  extraHistory: Array<[string, string, string, string]>;
}

const card = {
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.cardBorder,
  borderRadius: 12,
} as const;

const prioColor: Record<string, string> = { critical: '#b3402e', high: '#b07c1e', normal: '#5aa584' };

function Badge({ status, suffix }: { status: PaymentStatus; suffix?: string }) {
  const [c, bg] = paymentBadgeColors[status];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 4, paddingVertical: 2.5, paddingHorizontal: 6 }}>
      <Text style={{ ...fSans(600, 8.5, 0.04), color: c, textTransform: 'uppercase' }}>{status}{suffix ?? ''}</Text>
    </View>
  );
}

function Timeline({ items }: { items: Array<[string, string, string, string]> }) {
  return (
    <View style={{ ...card, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 6 }}>
      {items.map(([action, detail, actor, when], i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10, paddingBottom: 13 }}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 9, height: 9, borderRadius: 4.5, marginTop: 3, backgroundColor: i === 0 ? colors.gold : colors.sheetHandle }} />
            {i < items.length - 1 && <View style={{ width: 1.5, flex: 1, backgroundColor: colors.cardBorder, marginTop: 3 }} />}
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
  );
}

export default function TreasuryScreen() {
  const [view, setView] = useState<ViewKey>('ready');
  const [from, setFrom] = useState<Exclude<ViewKey, 'detail'>>('ready');
  const [payId, setPayId] = useState<string | null>(null);
  const [calSel, setCalSel] = useState('Sep 3');
  const [histFilter, setHistFilter] = useState<'all' | 'paid' | 'failed'>('all');
  const [method, setMethod] = useState<'ach' | 'check' | 'wire'>('ach');
  const [dateOpt, setDateOpt] = useState<'due' | 'now' | 'eom'>('due');
  const [actions, setActions] = useState<Record<string, Action>>({});
  const [refDraft, setRefDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');

  const pays: TreasuryPayment[] = useMemo(
    () =>
      treasuryPayments.map((p) => {
        const a = actions[p.id];
        if (!a) return p;
        return {
          ...p,
          status: a.status ?? p.status,
          schedDate: a.schedDate ?? p.schedDate,
          method: a.method ?? p.method,
          ref: a.ref ?? p.ref,
          history: [...a.extraHistory, ...p.history],
        };
      }),
    [actions],
  );

  const openPay = (p: TreasuryPayment, source: Exclude<ViewKey, 'detail'>) => () => {
    setPayId(p.id);
    setFrom(source);
    setView('detail');
    setRefDraft('');
    setNoteDraft('');
  };

  const ready = pays.filter((p) => p.status === 'Ready');
  const scheduled = pays.filter((p) => p.status === 'Scheduled');
  const done = pays.filter((p) => p.status === 'Paid' || p.status === 'Failed');
  const histVisible = done.filter((p) => histFilter === 'all' || (histFilter === 'paid' ? p.status === 'Paid' : p.status === 'Failed'));

  const d = pays.find((p) => p.id === payId) ?? pays[0];
  const methodLabel = { ach: 'ACH', check: 'Check', wire: 'Wire' }[method];
  const dateLabel = { due: d.due, now: 'Aug 18', eom: 'Aug 31' }[dateOpt];
  // Exact-day matching (the prototype's substring match leaked "Sep 1"
  // payments onto Sep 12/15 — one payment must appear on exactly one day).
  const calSelPays = scheduled.filter((p) => p.schedDate === calSel);

  const act = (extra: Partial<Action> & { extraHistory: Array<[string, string, string, string]> }) => {
    const prev = actions[d.id];
    setActions({
      ...actions,
      [d.id]: {
        ...(prev ?? { extraHistory: [] }),
        ...extra,
        extraHistory: [...extra.extraHistory, ...(prev?.extraHistory ?? [])],
      },
    });
    setRefDraft('');
    setNoteDraft('');
  };

  const pFields: Array<[string, string]> = [
    ['Vendor', d.vendor],
    ['Invoice', d.invoice],
    ['Amount', money(d.amount) + ' (locked)'],
    ['Due date', d.due],
    ['Payment terms', d.terms],
    ['Priority', d.prio.toUpperCase()],
    ['Approved by', d.approvedBy],
    ['Approval date', d.approvedDate],
    ['Method', d.method || '—'],
    ['Payment status', d.status + (d.schedDate ? ' · ' + d.schedDate : '') + (d.paidDate ? ' · ' + d.paidDate : '')],
    ['Reference', d.ref || '—'],
    ['Exp / cash month', d.expM + ' / ' + (d.payM || '—')],
  ];

  const selChip = (on: boolean) =>
    ({
      flex: 1,
      borderRadius: 8,
      paddingVertical: 8,
      alignItems: 'center' as const,
      borderWidth: 1.5,
      borderColor: on ? colors.green : colors.cardBorder,
      backgroundColor: on ? colors.greenBgLight : colors.card,
    });

  const tabs: Array<[Exclude<ViewKey, 'detail'>, string, string]> = [
    ['ready', '◈', 'Ready'],
    ['calendar', '▦', 'Calendar'],
    ['history', '≡', 'History'],
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg, overflow: 'hidden' }}>
      {/* Header */}
      <View style={{ backgroundColor: colors.ink, paddingTop: 14, paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {view === 'detail' && (
          <Pressable onPress={() => setView(from)} style={{ backgroundColor: colors.inkSecondary, borderRadius: 8, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.gold, fontSize: 15 }}>‹</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ ...fMono(700, 15, 0.18), color: colors.appBg }} numberOfLines={1}>
            {view === 'detail' ? 'PAYMENT' : view === 'calendar' ? 'PAYMENT CALENDAR' : view === 'history' ? 'PAYMENT HISTORY' : 'TREASURY'}
          </Text>
          <Text style={{ ...fSans(500, 10), color: colors.headerMuted, marginTop: 1 }} numberOfLines={1}>
            {view === 'detail' ? d.invoice + ' · ' + d.vendor : 'Payments · Vela Group · Aug 17, 9:41 AM'}
          </Text>
        </View>
        <View style={{ borderWidth: 1, borderColor: colors.gold, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5 }}>
          <Text style={{ ...fMono(600, 8.5, 0.1), color: colors.gold }}>MOCK DATA</Text>
        </View>
      </View>

      {/* ── Ready queue ── */}
      {view === 'ready' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 14 }}>
          <View style={{ backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, flexDirection: 'row', gap: 8 }}>
            {[
              { val: '$84,300', label: 'operating cash', color: colors.appBg },
              { val: money(ready.reduce((a, p) => a + p.amount, 0)).replace('.00', ''), label: 'ready · ' + ready.length + ' invoices', color: colors.gold },
              { val: money(scheduled.reduce((a, p) => a + p.amount, 0)).replace('.00', ''), label: 'scheduled · ' + scheduled.length, color: colors.success },
            ].map((s) => (
              <View key={s.label} style={{ flex: 1, backgroundColor: colors.inkSecondary, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 11 }}>
                <Text style={{ ...fMono(600, 15), color: s.color }}>{s.val}</Text>
                <Text style={{ ...fSans(400, 9), color: colors.headerMuted, marginTop: 1 }}>{s.label}</Text>
              </View>
            ))}
          </View>

          <View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginHorizontal: 2, marginBottom: 8 }}>
              <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, flex: 1 }}>
                READY FOR PAYMENT · {ready.length} INVOICES
              </Text>
              <Text style={{ ...fSans(400, 9.5), color: colors.faint }}>approved chains only</Text>
            </View>
            <View style={{ gap: 8 }}>
              {ready.map((p) => {
                const urgent = p.prio === 'high' || p.prio === 'critical';
                return (
                  <Pressable key={p.id} onPress={openPay(p, 'ready')} style={{ ...card, paddingVertical: 12, paddingHorizontal: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: prioColor[p.prio] }} />
                      <Text style={{ ...fSans(600, 12.5), color: colors.text, flex: 1 }} numberOfLines={1}>{p.vendor}</Text>
                      <Text style={{ ...fMono(600, 13), color: colors.text }}>{money(p.amount)}</Text>
                    </View>
                    <Text style={{ ...fSans(400, 10), color: colors.muted, marginTop: 4 }}>
                      {p.invoice} · {p.terms} · expense {p.expM}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <View style={{ backgroundColor: urgent ? colors.redBg : colors.sheetClose, borderRadius: 4, paddingVertical: 2.5, paddingHorizontal: 6 }}>
                        <Text style={{ ...fMono(600, 8.5, 0.05), color: urgent ? colors.red : colors.textSecondary2 }}>
                          DUE {p.due.toUpperCase()}
                        </Text>
                      </View>
                      <Text style={{ ...fSans(400, 9.5), color: colors.muted, flex: 1 }}>
                        Approved by {p.approvedBy} · {p.approvedDate}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
      )}

      {/* ── Calendar ── */}
      {view === 'calendar' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 14 }}>
          <View style={{ ...card, padding: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 10 }}>
              <Text style={{ ...fSans(600, 12), color: colors.text, flex: 1 }}>August → September 2026</Text>
              <Text style={{ ...fSans(400, 9.5), color: colors.faint }}>next 3 weeks</Text>
            </View>
            <View style={{ gap: 2 }}>
              {calendarDays.map(([label, payroll]) => {
                const dp = scheduled.filter((p) => p.schedDate && label.endsWith(p.schedDate));
                const total = dp.reduce((a, p) => a + p.amount, 0) + (payroll ? PAYROLL_AMOUNT : 0);
                const sel = label.endsWith(calSel);
                return (
                  <Pressable
                    key={label}
                    onPress={() => setCalSel(label.split(' ').slice(1).join(' '))}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 8, backgroundColor: sel ? colors.goldBg : 'transparent' }}
                  >
                    <Text style={{ ...fMono(600, 10.5), color: total ? colors.text : colors.faint, width: 86 }}>{label}</Text>
                    <View style={{ flex: 1, flexDirection: 'row', gap: 3, alignItems: 'center' }}>
                      {dp.map((p) => (
                        <View
                          key={p.id}
                          style={{ width: Math.max(14, Math.min(90, p.amount / 250)), height: 10, borderRadius: 3, backgroundColor: p.method === 'Wire' ? colors.amber : colors.green }}
                        />
                      ))}
                      {payroll && (
                        <View style={{ backgroundColor: colors.blueBg, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5 }}>
                          <Text style={{ ...fSans(600, 8, 0.06), color: colors.blue }}>PAYROLL</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ ...fMono(600, 11), minWidth: 64, textAlign: 'right', color: total > 10000 ? colors.red : total ? colors.text : '#c5c1b4' }}>
                      {total ? money(total).replace('.00', '') : '—'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.divider }}>
              {[
                { label: 'ACH', c: colors.green },
                { label: 'Wire', c: colors.amber },
                { label: 'Payroll (info)', c: colors.blue },
              ].map((l) => (
                <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: l.c }} />
                  <Text style={{ ...fSans(500, 9.5), color: colors.textSecondary2 }}>{l.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {calSelPays.length > 0 && (
            <View>
              <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, marginHorizontal: 2, marginBottom: 8 }}>
                {calSel.toUpperCase()} · {calSelPays.length} PAYMENT{calSelPays.length === 1 ? '' : 'S'}
              </Text>
              <View style={{ gap: 8 }}>
                {calSelPays.map((p) => (
                  <Pressable key={p.id} onPress={openPay(p, 'calendar')} style={{ ...card, paddingVertical: 11, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ ...fSans(600, 12), color: colors.text }}>{p.vendor}</Text>
                      <Text style={{ ...fSans(400, 10), color: colors.muted, marginTop: 2 }}>
                        {p.invoice} · ref {p.ref ?? 'pending'}
                      </Text>
                    </View>
                    <Badge status="Scheduled" />
                    <Text style={{ ...fMono(600, 12.5), color: colors.text }}>{money(p.amount)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── History ── */}
      {view === 'history' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 4, marginBottom: 6 }}>
            {([['all', 'ALL'], ['paid', 'PAID'], ['failed', 'FAILED']] as const).map(([id, label]) => {
              const on = histFilter === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => setHistFilter(id)}
                  style={{ borderRadius: 6, paddingVertical: 5, paddingHorizontal: 10, backgroundColor: on ? colors.gold : colors.card, borderWidth: on ? 0 : 1, borderColor: colors.cardBorder }}
                >
                  <Text style={{ ...fMono(600, 10, 0.03), color: on ? colors.ink : colors.textSecondary2 }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          {histVisible.map((p) => (
            <Pressable key={p.id} onPress={openPay(p, 'history')} style={{ ...card, paddingVertical: 12, paddingHorizontal: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={{ ...fSans(600, 12.5), color: colors.text, flex: 1 }} numberOfLines={1}>{p.vendor}</Text>
                <Text style={{ ...fMono(600, 13), color: colors.text }}>{money(p.amount)}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <Badge status={p.status} suffix={p.reconciled ? ' · reconciled' : ''} />
                <Text style={{ ...fSans(400, 10), color: colors.muted, flex: 1 }} numberOfLines={1}>
                  {p.invoice} · {p.paidDate ? 'paid ' + p.paidDate : 'due ' + p.due} · exp {p.expM}
                  {p.payM !== '—' ? ' / cash ' + p.payM : ''}
                </Text>
                <Text style={{ ...fMono(500, 9.5), color: colors.faint }}>{p.ref ?? ''}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* ── Detail ── */}
      {view === 'detail' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 14 }}>
          <View style={{ ...card, paddingVertical: 15, paddingHorizontal: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ ...fSans(600, 15), color: colors.text }}>{d.vendor}</Text>
                <Text style={{ ...fMono(500, 11), color: colors.textSecondary2, marginTop: 2 }}>{d.invoice}</Text>
              </View>
              <Badge status={d.status} />
            </View>
            <Text style={{ ...fMono(700, 24, -0.02), color: colors.text, marginTop: 10 }}>{money(d.amount)}</Text>
          </View>

          <View style={{ ...card, paddingVertical: 4, paddingHorizontal: 14 }}>
            {pFields.map(([label, val], i) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 8, borderBottomWidth: i === pFields.length - 1 ? 0 : 1, borderBottomColor: colors.divider }}>
                <Text style={{ ...fSans(500, 11), color: colors.textSecondary2, width: 104 }}>{label}</Text>
                <Text style={{ ...fMono(500, 11.5), color: colors.text, flex: 1 }}>{val}</Text>
              </View>
            ))}
          </View>

          {d.status === 'Ready' && (
            <View style={{ ...card, paddingVertical: 13, paddingHorizontal: 15 }}>
              <Text style={{ ...fSans(600, 10, 0.12), color: colors.textSecondary2, marginBottom: 9 }}>SCHEDULE PAYMENT</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                {([['ach', 'ACH'], ['check', 'Check'], ['wire', 'Wire']] as const).map(([id, label]) => (
                  <Pressable key={id} onPress={() => setMethod(id)} style={selChip(method === id)}>
                    <Text style={{ ...fSans(600, 11), color: method === id ? colors.green : colors.textSecondary2 }}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                {([['due', 'On due date'], ['now', 'Tomorrow'], ['eom', 'Month end']] as const).map(([id, label]) => (
                  <Pressable key={id} onPress={() => setDateOpt(id)} style={selChip(dateOpt === id)}>
                    <Text style={{ ...fSans(600, 11), color: dateOpt === id ? colors.green : colors.textSecondary2 }}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={{ ...fSans(400, 10), lineHeight: 15, color: colors.muted, marginBottom: 10 }}>
                Funding check: Chase …4821 projected balance on {dateLabel} covers this payment (incl. payroll sweep). Cash month will be {dateLabel.startsWith('Sep') ? 'SEP' : 'AUG'} 2026; the {d.expM} expense is unchanged.
              </Text>
              <Pressable
                onPress={() =>
                  act({
                    status: 'Scheduled', schedDate: dateLabel, method: methodLabel, ref: methodLabel.toUpperCase() + '-PENDING',
                    extraHistory: [[
                      'Payment scheduled',
                      methodLabel + ' ' + money(d.amount) + ' · ' + dateLabel + ' from Chase …4821 · scheduled from mobile. Notification sent to approvers & AP.',
                      'M. Okafor (Controller)', 'Aug 17 · 9:41 AM',
                    ]],
                  })
                }
                style={{ backgroundColor: colors.green, borderRadius: 9, paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ ...fSans(600, 12.5), color: '#fff' }}>Schedule {methodLabel} · {dateLabel}</Text>
              </Pressable>
            </View>
          )}

          {d.status === 'Scheduled' && (
            <View style={{ ...card, paddingVertical: 13, paddingHorizontal: 15 }}>
              <Text style={{ ...fSans(600, 10, 0.12), color: colors.textSecondary2, marginBottom: 9 }}>RECORD PAYMENT / REFERENCE</Text>
              <TextInput
                value={refDraft}
                onChangeText={setRefDraft}
                placeholder="Payment reference (check #, ACH trace…)"
                placeholderTextColor={colors.muted}
                style={{ borderWidth: 1, borderColor: colors.sheetHandle, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 11, ...fMono(500, 12), color: colors.text, marginBottom: 8 }}
              />
              <TextInput
                value={noteDraft}
                onChangeText={setNoteDraft}
                placeholder="Note (optional)"
                placeholderTextColor={colors.muted}
                style={{ borderWidth: 1, borderColor: colors.sheetHandle, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 11, ...fSans(400, 12), color: colors.text, marginBottom: 10 }}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() =>
                    act({
                      status: 'Paid', ref: refDraft || d.ref,
                      extraHistory: [[
                        'Payment recorded as paid',
                        'Reference ' + (refDraft || d.ref || '—') + (noteDraft ? ' · note: ' + noteDraft : '') + ' · cash event dated today (AUG 2026). Awaiting bank match.',
                        'M. Okafor (Controller)', 'Aug 17 · 9:41 AM',
                      ]],
                    })
                  }
                  style={{ flex: 1, backgroundColor: colors.green, borderRadius: 9, paddingVertical: 11, alignItems: 'center' }}
                >
                  <Text style={{ ...fSans(600, 12), color: '#fff' }}>Record as paid</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (noteDraft || refDraft) {
                      act({
                        ref: refDraft || d.ref,
                        extraHistory: [[
                          'Note added',
                          (refDraft ? 'Reference ' + refDraft + ' attached. ' : '') + (noteDraft || ''),
                          'M. Okafor (Controller)', 'Aug 17 · 9:41 AM',
                        ]],
                      });
                    }
                  }}
                  style={{ borderWidth: 1.5, borderColor: colors.sheetHandle, backgroundColor: colors.card, borderRadius: 9, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center' }}
                >
                  <Text style={{ ...fSans(600, 12), color: colors.textSecondary }}>Add note only</Text>
                </Pressable>
              </View>
            </View>
          )}

          <View style={{ backgroundColor: colors.redBg, borderWidth: 1, borderColor: colors.redBorder, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, flexDirection: 'row', gap: 9 }}>
            <Text style={{ fontSize: 12 }}>🔒</Text>
            <Text style={{ ...fSans(400, 10.5), lineHeight: 16.3, color: '#8a4a3c', flex: 1 }}>
              Invoice amount is locked at <Text style={{ ...fSans(700, 10.5) }}>{money(d.amount)}</Text>. Treasury cannot edit it — corrections require an audited adjustment (credit memo or reversal) through AP, which appears in this history.
            </Text>
          </View>

          <View>
            <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, marginHorizontal: 2, marginBottom: 8 }}>
              PAYMENT AUDIT HISTORY
            </Text>
            <Timeline items={d.history} />
          </View>
        </ScrollView>
      )}

      {/* Bottom tab bar */}
      <View style={{ backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.cardBorder, flexDirection: 'row', paddingTop: 6, paddingHorizontal: 8, paddingBottom: 4 }}>
        {tabs.map(([id, icon, label]) => {
          const active = view === id || (view === 'detail' && from === id);
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
