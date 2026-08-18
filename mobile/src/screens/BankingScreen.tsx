/**
 * Banking — pixel-perfect port of "Monark Banking.dc.html".
 * Multi-account list with unclassified markers, transactions with the full
 * field set and account/match filters, transaction detail with match links,
 * suggestion accept flow (below the 0.90 auto-apply floor a human decides),
 * and the processing trail.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  bankAccounts, bankTxns, matchBadges, securityNotes, signedMoney,
  type BankTxnFixture,
} from '../data/bankingData';
import { colors, fMono, fSans } from '../theme/tokens';

type ViewKey = 'accounts' | 'txns' | 'detail';

const card = {
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.cardBorder,
  borderRadius: 12,
} as const;

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ borderRadius: 6, paddingVertical: 5, paddingHorizontal: 9, backgroundColor: active ? colors.gold : colors.inkSecondary }}
    >
      <Text style={{ ...fMono(600, 10, 0.03), color: active ? colors.ink : colors.headerMuted }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function MatchBadge({ kind, pending }: { kind: BankTxnFixture['match']; pending?: boolean }) {
  const [label, c, bg] = matchBadges[kind];
  return (
    <View style={{ backgroundColor: pending ? colors.sheetClose : bg, borderRadius: 4, paddingVertical: 2.5, paddingHorizontal: 6 }}>
      <Text style={{ ...fSans(600, 8, 0.04), color: pending ? colors.muted : c }} numberOfLines={1}>
        {pending ? 'PENDING' : label}
      </Text>
    </View>
  );
}

export default function BankingScreen() {
  const [view, setView] = useState<ViewKey>('accounts');
  const [txnId, setTxnId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [acct, setAcct] = useState('all');
  const [match, setMatch] = useState('all');
  const [classified, setClassified] = useState<Record<string, boolean>>({});

  const txns: BankTxnFixture[] = useMemo(
    () =>
      bankTxns.map((t) =>
        classified[t.id] && t.suggest
          ? {
              ...t,
              match: 'rule' as const,
              category: t.suggest[0],
              loc: t.suggest[2].split(' ')[0],
              matchNote: 'Classified by you · rule created',
              trail: [
                ['Classified by user', 'Category ' + t.suggest[0] + ' accepted from suggestion (was conf ' + t.suggest[1].toFixed(2) + '). Rule created for future ' + t.merchant + ' transactions. Audited.', 'Aug 17 · 9:41 AM'] as [string, string, string],
                ...t.trail,
              ],
            }
          : t,
      ),
    [classified],
  );

  const total = bankAccounts.reduce((a, x) => a + x.balance, 0);
  const q = query.toLowerCase();
  const visible = txns.filter(
    (t) =>
      (acct === 'all' || t.acct === acct) &&
      (match === 'all' || t.match === match) &&
      (!q || (t.desc + ' ' + t.merchant + ' ' + t.vendor + ' ' + Math.abs(t.amount)).toLowerCase().includes(q)),
  );

  const d = txns.find((t) => t.id === txnId) ?? txns[0];
  const acctName = bankAccounts.find((a) => a.id === d.acct)?.name ?? d.acct;
  const dFields: Array<[string, string]> = [
    ['Transaction ID', d.id],
    ['Bank account', acctName],
    ['Transaction date', d.txnDate + ', 2026'],
    ['Posting date', d.postDate === '—' ? 'Not posted (pending)' : d.postDate + ', 2026'],
    ['Description', d.desc],
    ['Amount', signedMoney(d.amount)],
    ['Debit / credit', d.dir.toUpperCase()],
    ['Merchant', d.merchant],
    ['Vendor', d.vendor],
    ['Category', d.category],
    ['Location', d.loc],
    ['Status', d.status],
    ['Match status', matchBadges[d.match][0]],
    ['Source', d.source],
    ['External ID', d.ext],
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg, overflow: 'hidden' }}>
      {/* Header */}
      <View style={{ backgroundColor: colors.ink, paddingTop: 14, paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {view === 'detail' && (
          <Pressable onPress={() => setView('txns')} style={{ backgroundColor: colors.inkSecondary, borderRadius: 8, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.gold, fontSize: 15 }}>‹</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ ...fMono(700, 15, 0.18), color: colors.appBg }} numberOfLines={1}>
            {view === 'accounts' ? 'BANKING' : view === 'txns' ? 'TRANSACTIONS' : 'TRANSACTION'}
          </Text>
          <Text style={{ ...fSans(500, 10), color: colors.headerMuted, marginTop: 1 }} numberOfLines={1}>
            {view === 'detail' ? d.id + ' · ' + d.source : 'Bank accounts · auto-sync · Aug 17, 9:41 AM'}
          </Text>
        </View>
        <View style={{ borderWidth: 1, borderColor: colors.gold, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5 }}>
          <Text style={{ ...fMono(600, 8.5, 0.1), color: colors.gold }}>MOCK DATA</Text>
        </View>
      </View>

      {/* ── Accounts ── */}
      {view === 'accounts' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 14 }}>
          <View style={{ backgroundColor: colors.ink, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 18 }}>
            <Text style={{ ...fSans(600, 9.5, 0.14), color: colors.gold }}>TOTAL CASH · ALL ACCOUNTS</Text>
            <Text style={{ ...fMono(700, 28, -0.02), color: colors.appBg, marginTop: 6, marginBottom: 2 }}>
              {'$' + total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </Text>
            <Text style={{ ...fSans(400, 11), color: colors.headerMuted }}>
              4 accounts · Plaid · last sync today 6:00 AM · next intraday webhook live
            </Text>
          </View>

          <View style={{ gap: 8 }}>
            {bankAccounts.map((a) => (
              <Pressable key={a.id} onPress={() => { setAcct(a.id); setMatch('all'); setView('txns'); }} style={{ ...card, paddingVertical: 13, paddingHorizontal: 15 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ ...fMono(700, 14), color: colors.gold }}>{a.initial}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...fSans(600, 12.5), color: colors.text }}>{a.name}</Text>
                    <Text style={{ ...fSans(400, 10), color: colors.muted, marginTop: 1 }}>{a.meta}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ ...fMono(600, 14), color: colors.text }}>
                      {(a.balance < 0 ? '−' : '') + '$' + Math.abs(a.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </Text>
                    <Text style={{ ...fMono(500, 8.5), color: colors.success, marginTop: 2 }}>SYNCED 6:00 AM</Text>
                  </View>
                </View>
                {a.unclassified > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.divider }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.amber }} />
                    <Text style={{ ...fSans(500, 10), color: colors.amber }}>
                      {a.unclassified} unclassified transaction{a.unclassified === 1 ? '' : 's'} need review
                    </Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>

          <View style={{ ...card, paddingVertical: 13, paddingHorizontal: 15 }}>
            <Text style={{ ...fSans(600, 10, 0.12), color: colors.textSecondary2, marginBottom: 8 }}>CONNECTION SECURITY</Text>
            <View style={{ gap: 6 }}>
              {securityNotes.map((s) => (
                <View key={s} style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}>
                  <Text style={{ ...fMono(600, 10), color: colors.green }}>✓</Text>
                  <Text style={{ ...fSans(400, 10.5), lineHeight: 15.75, color: colors.textSecondary, flex: 1 }}>{s}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {/* ── Transactions ── */}
      {view === 'txns' && (
        <>
          <View style={{ backgroundColor: colors.ink, paddingHorizontal: 14, paddingBottom: 12 }}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search description, merchant, vendor, amount…"
              placeholderTextColor={colors.headerMuted}
              style={{ backgroundColor: colors.inkSecondary, color: colors.appBg, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12, ...fSans(400, 12.5) }}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: 4, paddingBottom: 2 }}>
              {[['all', 'ALL'], ['ops', 'OPS …4821'], ['pay', 'PAYROLL …9310'], ['sav', 'RESERVE …1177'], ['amex', 'AMEX …3009']].map(([id, label]) => (
                <Chip key={id} label={label} active={acct === id} onPress={() => setAcct(id)} />
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }} contentContainerStyle={{ gap: 4 }}>
              {[['all', 'ALL'], ['unclassified', 'UNCLASSIFIED'], ['payment', 'PAYMENTS'], ['deposit', 'DEPOSITS'], ['rule', 'RULE'], ['excluded', 'EXCLUDED']].map(([id, label]) => (
                <Chip key={id} label={label} active={match === id} onPress={() => setMatch(id)} />
              ))}
            </ScrollView>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 14, paddingBottom: 20 }}>
            <Text style={{ ...fSans(500, 10.5), color: colors.muted, marginHorizontal: 2, marginBottom: 8 }}>
              {visible.length} of {txns.length} transactions · mock data
            </Text>
            <View style={{ gap: 8 }}>
              {visible.map((t) => (
                <Pressable key={t.id} onPress={() => { setTxnId(t.id); setView('detail'); }} style={{ ...card, paddingVertical: 11, paddingHorizontal: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={{ ...fSans(600, 12), color: colors.text, flex: 1 }} numberOfLines={1}>{t.desc}</Text>
                    <Text style={{ ...fMono(600, 13), color: t.amount > 0 ? colors.green : colors.text }}>{signedMoney(t.amount)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 }}>
                    <MatchBadge kind={t.match} pending={t.status === 'Pending'} />
                    <Text style={{ ...fSans(400, 10), color: colors.muted, flex: 1 }} numberOfLines={1}>
                      {(t.vendor !== '—' ? t.vendor : t.merchant !== '—' ? t.merchant : 'No merchant') + ' · ' + t.category}
                    </Text>
                    <Text style={{ ...fMono(500, 9), color: colors.faint }}>{t.txnDate}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </>
      )}

      {/* ── Detail ── */}
      {view === 'detail' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 14 }}>
          <View style={{ ...card, paddingVertical: 15, paddingHorizontal: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ ...fSans(600, 14), color: colors.text }}>{d.desc}</Text>
                <Text style={{ ...fMono(500, 10.5), color: colors.textSecondary2, marginTop: 3 }}>{acctName} · {d.id}</Text>
              </View>
              <View style={{ backgroundColor: d.dir === 'credit' ? colors.greenBgLight : colors.sheetClose, borderRadius: 4, paddingVertical: 2.5, paddingHorizontal: 6 }}>
                <Text style={{ ...fSans(600, 8.5, 0.05), color: d.dir === 'credit' ? colors.green : colors.textSecondary }}>{d.dir.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={{ ...fMono(700, 26, -0.02), color: d.amount > 0 ? colors.green : colors.text, marginTop: 10, marginBottom: 8 }}>
              {signedMoney(d.amount)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MatchBadge kind={d.match} />
              <Text style={{ ...fSans(400, 10.5), color: colors.muted, flex: 1 }}>{d.matchNote}</Text>
            </View>
          </View>

          {d.match === 'unclassified' && d.suggest && (
            <View style={{ backgroundColor: colors.amberBg, borderWidth: 1.5, borderColor: colors.amberBorder, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 15 }}>
              <Text style={{ ...fSans(600, 11), color: '#7a5c26', marginBottom: 4 }}>Unclassified — needs a category</Text>
              <Text style={{ ...fSans(400, 10.5), lineHeight: 15.75, color: '#7a5c26' }}>
                AI suggests {d.suggest[0]} at {d.suggest[2]} — confidence {d.suggest[1].toFixed(2)}, below the 0.90 auto-apply floor. Nothing is booked until you decide.
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Pressable onPress={() => setClassified({ ...classified, [d.id]: true })} style={{ flex: 1, backgroundColor: colors.green, borderRadius: 8, paddingVertical: 10, alignItems: 'center' }}>
                  <Text style={{ ...fSans(600, 11.5), color: '#fff' }}>Accept {d.suggest[0].split(' · ').pop()}</Text>
                </Pressable>
                <Pressable style={{ borderWidth: 1.5, borderColor: colors.sheetHandle, backgroundColor: colors.card, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center' }}>
                  <Text style={{ ...fSans(600, 11.5), color: colors.textSecondary }}>Pick other…</Text>
                </Pressable>
              </View>
              <Text style={{ ...fSans(400, 9.5), lineHeight: 14.25, color: '#a08650', marginTop: 8 }}>
                Accepting can also create a rule so future {d.merchant} transactions classify automatically.
              </Text>
            </View>
          )}

          <View style={{ ...card, paddingVertical: 4, paddingHorizontal: 14 }}>
            {dFields.map(([label, val], i) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 8, borderBottomWidth: i === dFields.length - 1 ? 0 : 1, borderBottomColor: colors.divider }}>
                <Text style={{ ...fSans(500, 11), color: colors.textSecondary2, width: 104 }}>{label}</Text>
                <Text style={{ ...fMono(500, 11.5), color: colors.text, flex: 1 }}>{val}</Text>
              </View>
            ))}
          </View>

          {d.link && (
            <View style={{ backgroundColor: colors.greenBgLight, borderWidth: 1, borderColor: '#bcd8ca', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 15 }}>
              <Text style={{ ...fSans(600, 9.5, 0.1), color: colors.green, marginBottom: 5 }}>{d.link[0]}</Text>
              <Text style={{ ...fSans(400, 11), lineHeight: 17, color: '#2e5548' }}>{d.link[1]}</Text>
            </View>
          )}

          <View>
            <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, marginHorizontal: 2, marginBottom: 8 }}>PROCESSING TRAIL</Text>
            <View style={{ ...card, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 6 }}>
              {d.trail.map(([action, detail, when], i) => (
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
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {/* Bottom tab bar */}
      <View style={{ backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.cardBorder, flexDirection: 'row', paddingTop: 6, paddingHorizontal: 8, paddingBottom: 4 }}>
        {([['accounts', '▤', 'Accounts'], ['txns', '≡', 'Transactions']] as const).map(([id, icon, label]) => {
          const active = view === id || (view === 'detail' && id === 'txns');
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
