/**
 * Bank txn AI — pixel-perfect port of "Monark AI Classification.dc.html".
 * Suggestion queue with confidence bars, 7-signal evidence detail,
 * Accept/Edit/Reject, rule creation after repeated confirmations,
 * reversible rules tab.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  AUTO_APPLY_FLOOR, classRules, classTxns, confColor, signedMoney,
  type Suggestion,
} from '../data/aiClassificationData';
import { colors, fMono, fSans } from '../theme/tokens';

type Decision = 'accept' | 'edit' | 'reject';

const card = {
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.cardBorder,
  borderRadius: 12,
} as const;

const FLOOR_LABEL = AUTO_APPLY_FLOOR.toFixed(2);

export default function AIClassificationScreen() {
  const [view, setView] = useState<'queue' | 'detail' | 'rules'>('queue');
  const [txnId, setTxnId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Partial<Suggestion>>({});
  const [ruleOfferFor, setRuleOfferFor] = useState<string | null>(null);
  const [ruleCreated, setRuleCreated] = useState(false);
  const [ruleStates, setRuleStates] = useState<Record<string, boolean>>({ r1: true, r2: true, r3: true, r4: true });

  const pending = classTxns.filter((t) => !t.auto);
  const d = classTxns.find((t) => t.id === txnId) ?? classTxns[0];
  const dec = decisions[d.id];
  const edited = Object.keys(drafts).length > 0;
  const ruleOfferTxn = classTxns.find((t) => t.id === ruleOfferFor);

  const suggestionFields: Array<[string, keyof Suggestion]> = [
    ['Vendor', 'vendor'], ['Category', 'category'], ['Location', 'location'], ['Treatment', 'treatment'],
  ];

  const allRules = [
    ...(ruleCreated
      ? [{ id: 'new', pattern: '"NYC WATER*" on Ops …4821', action: 'Vendor NYC Water Board · OpEx · Utilities · Water · MID', origin: 'From 3 confirmations · today · applied 0×' }]
      : []),
    ...classRules,
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg, overflow: 'hidden' }}>
      {/* Header */}
      <View style={{ backgroundColor: colors.ink, paddingTop: 14, paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {view === 'detail' && (
          <Pressable onPress={() => setView('queue')} style={{ backgroundColor: colors.inkSecondary, borderRadius: 8, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.gold, fontSize: 15 }}>‹</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ ...fMono(700, 15, 0.18), color: colors.appBg }} numberOfLines={1}>
            {view === 'detail' ? 'CLASSIFY' : view === 'rules' ? 'RULES' : 'AI CLASSIFICATION'}
          </Text>
          <Text style={{ ...fSans(500, 10), color: colors.headerMuted, marginTop: 1 }} numberOfLines={1}>
            {view === 'detail'
              ? d.meta.split(' · ').slice(0, 2).join(' · ') + ' · ' + d.desc
              : 'Bank transactions · Vela Group · Aug 17, 9:41 AM'}
          </Text>
        </View>
        <View style={{ borderWidth: 1, borderColor: colors.gold, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5 }}>
          <Text style={{ ...fMono(600, 8.5, 0.1), color: colors.gold }}>MOCK DATA</Text>
        </View>
      </View>

      {/* ── Queue ── */}
      {view === 'queue' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 14 }}>
          <View style={{ backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16 }}>
            <Text style={{ ...fSans(600, 9, 0.12), color: colors.gold, marginBottom: 7 }}>HOW CLASSIFICATION WORKS</Text>
            <Text style={{ ...fSans(400, 11), lineHeight: 17, color: '#c7d4cd' }}>
              Each suggestion is scored from merchant, description, amount pattern, this vendor's history, your rules, and location context. ≥ {FLOOR_LABEL} with a rule → auto-applied (reversible). Below that,{' '}
              <Text style={{ ...fSans(700, 11), color: colors.appBg }}>nothing is booked until you decide</Text>.
            </Text>
          </View>

          <View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginHorizontal: 2, marginBottom: 8 }}>
              <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, flex: 1 }}>
                AWAITING YOUR DECISION · {pending.filter((t) => !decisions[t.id]).length} OF {pending.length}
              </Text>
              <Text style={{ ...fSans(400, 9.5), color: colors.faint }}>newest first</Text>
            </View>
            <View style={{ gap: 8 }}>
              {pending.map((t) => {
                const tDec = decisions[t.id];
                return (
                  <Pressable key={t.id} onPress={() => { setTxnId(t.id); setEditing(false); setDrafts({}); setView('detail'); }} style={{ ...card, paddingVertical: 12, paddingHorizontal: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <Text style={{ ...fMono(600, 12), color: colors.text, flex: 1 }} numberOfLines={1}>{t.desc}</Text>
                      <Text style={{ ...fMono(600, 13), color: colors.text }}>{signedMoney(t.amount)}</Text>
                    </View>
                    <Text style={{ ...fSans(400, 10), color: colors.muted, marginTop: 3 }}>{t.meta}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <Text style={{ ...fSans(400, 10.5), color: colors.textSecondary, flex: 1 }} numberOfLines={1}>
                        → {t.suggest.vendor + ' · ' + t.suggest.category.split(' — ')[0]}
                      </Text>
                      <View style={{ width: 56, height: 5, borderRadius: 3, backgroundColor: colors.divider, overflow: 'hidden' }}>
                        <View style={{ height: '100%', borderRadius: 3, width: `${Math.round(t.conf * 100)}%`, backgroundColor: confColor(t.conf) }} />
                      </View>
                      <Text style={{ ...fMono(500, 9.5), color: confColor(t.conf) }}>{t.conf.toFixed(2)}</Text>
                    </View>
                    {!!tDec && (
                      <View style={{ marginTop: 8, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 7, backgroundColor: tDec === 'reject' ? colors.redBg : colors.greenBgLight }}>
                        <Text style={{ ...fSans(500, 10.5), color: tDec === 'reject' ? colors.red : colors.green }}>
                          {tDec === 'accept' ? '✓ Accepted — classified & logged' : tDec === 'edit' ? '✓ Accepted with edits — stored as training signal' : '✕ Rejected — back to Unclassified, correction logged'}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

          {!!ruleOfferTxn && !ruleCreated && (
            <View style={{ backgroundColor: colors.goldBg, borderWidth: 1.5, borderColor: colors.mockBorder, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 15 }}>
              <Text style={{ ...fSans(600, 11.5), color: '#7a5c26' }}>Create a rule?</Text>
              <Text style={{ ...fSans(400, 11), lineHeight: 16.5, color: '#7a5c26', marginTop: 3 }}>
                You've confirmed "{ruleOfferTxn.suggest.category}" for {ruleOfferTxn.suggest.vendor} {ruleOfferTxn.confirmations + 1} times. Create rule {ruleOfferTxn.rulePattern} → auto-classify at ≥ {FLOOR_LABEL}? You can edit or disable it anytime.
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Pressable onPress={() => { setRuleCreated(true); setRuleOfferFor(null); }} style={{ flex: 1, backgroundColor: colors.green, borderRadius: 8, paddingVertical: 10, alignItems: 'center' }}>
                  <Text style={{ ...fSans(600, 11.5), color: '#fff' }}>Create rule (reversible)</Text>
                </Pressable>
                <Pressable onPress={() => setRuleOfferFor(null)} style={{ borderWidth: 1.5, borderColor: colors.mockBorder, backgroundColor: colors.card, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' }}>
                  <Text style={{ ...fSans(600, 11.5), color: '#7a5c26' }}>Not now</Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── Detail ── */}
      {view === 'detail' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 14 }}>
          <View style={{ ...card, paddingVertical: 15, paddingHorizontal: 16 }}>
            <Text style={{ ...fMono(600, 13), color: colors.text }}>{d.desc}</Text>
            <Text style={{ ...fSans(400, 10.5), color: colors.muted, marginTop: 3 }}>{d.meta}</Text>
            <Text style={{ ...fMono(700, 24, -0.02), color: colors.text, marginTop: 10 }}>{signedMoney(d.amount)}</Text>
          </View>

          <View style={{ ...card, paddingVertical: 14, paddingHorizontal: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Text style={{ ...fSans(600, 10, 0.12), color: colors.textSecondary2, flex: 1 }}>AI SUGGESTION</Text>
              <View style={{ backgroundColor: confColor(d.conf), borderRadius: 5, paddingVertical: 3, paddingHorizontal: 8 }}>
                <Text style={{ ...fMono(600, 10), color: '#fff' }}>conf {d.conf.toFixed(2)}</Text>
              </View>
            </View>
            {suggestionFields.map(([label, key]) => (
              <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                <Text style={{ ...fSans(500, 11), color: colors.textSecondary2, width: 110 }}>{label}</Text>
                {editing && !dec ? (
                  <TextInput
                    value={drafts[key] ?? d.suggest[key]}
                    onChangeText={(t) => setDrafts({ ...drafts, [key]: t })}
                    style={{ flex: 1, borderWidth: 1.5, borderColor: colors.green, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 8, ...fMono(500, 11.5), color: colors.text }}
                  />
                ) : (
                  <Text style={{ ...fMono(500, 11.5), color: colors.text, flex: 1 }} numberOfLines={1}>
                    {drafts[key] ?? d.suggest[key]}
                  </Text>
                )}
              </View>
            ))}
            <View style={{ backgroundColor: '#f5f6f4', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 11, marginTop: 10 }}>
              <Text style={{ ...fSans(400, 10.5), lineHeight: 16.3, color: colors.textSecondary }}>
                <Text style={{ ...fSans(700, 10.5) }}>Why: </Text>
                {d.reason}
              </Text>
            </View>

            {!dec && !d.auto && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Pressable
                  onPress={() => {
                    setDecisions({ ...decisions, [d.id]: edited ? 'edit' : 'accept' });
                    setEditing(false);
                    setView('queue');
                    if (d.ruleQualify) setRuleOfferFor(d.id);
                  }}
                  style={{ flex: 1, backgroundColor: colors.green, borderRadius: 9, paddingVertical: 11, alignItems: 'center' }}
                >
                  <Text style={{ ...fSans(600, 12), color: '#fff' }}>{editing || edited ? 'Accept with edits' : 'Accept'}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setEditing(!editing)}
                  style={{ borderWidth: 1.5, borderColor: editing ? colors.green : colors.sheetHandle, backgroundColor: colors.card, borderRadius: 9, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center' }}
                >
                  <Text style={{ ...fSans(600, 12), color: editing ? colors.green : colors.textSecondary }}>{editing ? 'Done' : 'Edit'}</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setDecisions({ ...decisions, [d.id]: 'reject' }); setEditing(false); setView('queue'); }}
                  style={{ borderWidth: 1.5, borderColor: colors.scoreLow, backgroundColor: colors.card, borderRadius: 9, paddingVertical: 11, paddingHorizontal: 13, alignItems: 'center' }}
                >
                  <Text style={{ ...fSans(600, 12), color: colors.red }}>Reject</Text>
                </Pressable>
              </View>
            )}
            {(!!dec || d.auto) && (
              <View style={{ marginTop: 12, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8, backgroundColor: dec === 'reject' ? colors.redBg : colors.greenBgLight }}>
                <Text style={{ ...fSans(500, 11), lineHeight: 16.5, color: dec === 'reject' ? colors.red : colors.green }}>
                  {d.auto
                    ? '⚙ Auto-applied by ' + d.autoRule + ' (conf ' + d.conf.toFixed(2) + ' ≥ ' + FLOOR_LABEL + '). Reversible: rejecting reverts to Unclassified and weakens the rule.'
                    : dec === 'reject'
                      ? 'Rejected — returned to Unclassified. Your correction is stored as a training signal.'
                      : 'Accepted' + (dec === 'edit' ? ' with edits — differences stored as training signals for this merchant.' : ' — classification applied and audit-logged.')}
                </Text>
              </View>
            )}
          </View>

          <View>
            <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, marginHorizontal: 2, marginBottom: 8 }}>SIGNALS ANALYZED</Text>
            <View style={{ ...card, paddingVertical: 4, paddingHorizontal: 14 }}>
              {d.signals.map(([name, finding, w], i) => (
                <View key={name} style={{ flexDirection: 'row', gap: 10, paddingVertical: 9, borderBottomWidth: i === d.signals.length - 1 ? 0 : 1, borderBottomColor: colors.divider }}>
                  <View style={{ width: 5, borderRadius: 3, alignSelf: 'stretch', backgroundColor: w >= 0.7 ? colors.green : w >= 0.4 ? colors.gold : colors.cardBorder }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...fSans(600, 11), color: colors.text }}>{name}</Text>
                    <Text style={{ ...fSans(400, 10.5), lineHeight: 15.75, color: colors.textSecondary2, marginTop: 1 }}>{finding}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {/* ── Rules ── */}
      {view === 'rules' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 8 }}>
          <Text style={{ ...fSans(400, 11), lineHeight: 17.6, color: colors.textSecondary, paddingHorizontal: 2, paddingBottom: 6 }}>
            Rules are created from your repeated confirmations, always editable and reversible. Disabling a rule stops future auto-classification; already-classified transactions keep their category with the rule noted in their trail.
          </Text>
          {allRules.map((r) => {
            const on = r.id === 'new' ? true : ruleStates[r.id];
            return (
              <View key={r.id} style={{ ...card, paddingVertical: 13, paddingHorizontal: 15 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ ...fMono(600, 12), color: colors.text, flex: 1 }}>{r.pattern}</Text>
                  <Pressable
                    onPress={() => { if (r.id !== 'new') setRuleStates({ ...ruleStates, [r.id]: !on }); }}
                    style={{ width: 38, height: 22, borderRadius: 11, padding: 2, backgroundColor: on ? colors.green : colors.sheetHandle, alignItems: on ? 'flex-end' : 'flex-start' }}
                  >
                    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff' }} />
                  </Pressable>
                </View>
                <Text style={{ ...fSans(400, 10.5), color: colors.textSecondary2, marginTop: 4 }}>→ {r.action}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.divider }}>
                  <Text style={{ ...fMono(500, 9.5), color: colors.muted, flex: 1 }}>{r.origin}</Text>
                  <Text style={{ ...fMono(600, 8.5, 0.05), color: on ? colors.green : colors.amber }}>
                    {on ? 'ACTIVE' : 'DISABLED — history kept'}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Bottom tab bar */}
      <View style={{ backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.cardBorder, flexDirection: 'row', paddingTop: 6, paddingHorizontal: 8, paddingBottom: 4 }}>
        {([['queue', '◇', 'Queue'], ['rules', '⚖', 'Rules']] as const).map(([id, icon, label]) => {
          const active = view === id || (view === 'detail' && id === 'queue');
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
