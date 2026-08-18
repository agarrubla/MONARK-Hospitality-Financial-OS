/**
 * Accounts payable — pixel-perfect port of "Monark AP.dc.html".
 * Four views: overview (aging, expense-vs-payment-month), invoice list
 * (search, 10 status chips, EXP/PAY month lens), invoice detail (6 dates,
 * line items, approve/reject/hold, audit history) and upload with OCR.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  apInvoices, approvalLabel, money, statusColors, uploadFields,
  type APInvoice, type InvoiceStatus,
} from '../data/apData';
import { colors, fMono, fSans } from '../theme/tokens';

type ViewKey = 'dash' | 'list' | 'detail' | 'upload';

const card = {
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.cardBorder,
  borderRadius: 12,
} as const;

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const [color, bg] = statusColors[status];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 4, paddingVertical: 2.5, paddingHorizontal: 6 }}>
      <Text style={{ ...fSans(600, 8.5, 0.04), color, textTransform: 'uppercase' }} numberOfLines={1}>
        {status}
      </Text>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ borderRadius: 6, paddingVertical: 5, paddingHorizontal: 9, backgroundColor: active ? colors.gold : colors.inkSecondary }}
    >
      <Text style={{ ...fMono(600, 10, 0.03), color: active ? colors.ink : colors.headerMuted }} numberOfLines={1}>
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

export default function APScreen() {
  const [view, setView] = useState<ViewKey>('dash');
  const [from, setFrom] = useState<Exclude<ViewKey, 'detail'>>('dash');
  const [invId, setInvId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | InvoiceStatus>('all');
  const [loc, setLoc] = useState<'all' | 'SOHO' | 'MID' | 'BKN'>('all');
  const [monthLens, setMonthLens] = useState<'expense' | 'payment'>('expense');
  const [uploadStage, setUploadStage] = useState(0);
  const [decisions, setDecisions] = useState<Record<string, InvoiceStatus>>({});

  const invs: APInvoice[] = useMemo(
    () => apInvoices.map((v) => ({ ...v, status: decisions[v.id] ?? v.status })),
    [decisions],
  );

  const openInv = (v: APInvoice, source: Exclude<ViewKey, 'detail'>) => () => {
    setInvId(v.id);
    setFrom(source);
    setView('detail');
  };

  // Dashboard aggregates (ported verbatim).
  const open = invs.filter((v) => !['Paid', 'Rejected'].includes(v.status));
  const openTotal = open.reduce((a, v) => a + v.total, 0);
  const pendCount = invs.filter((v) => ['Pending Approval', 'Review Required'].includes(v.status)).length;
  const dashStats = [
    { label: 'Open AP', val: money(openTotal), color: colors.text, sub: open.length + ' open invoices', go: () => { setStatus('all'); setView('list'); } },
    { label: 'Needs approval / review', val: String(pendCount), color: pendCount ? colors.amber : colors.text, sub: 'blocking payment scheduling', go: () => { setStatus('Pending Approval'); setView('list'); } },
    { label: 'Due next 7 days', val: money(open.filter((v) => ['Aug 23', 'Aug 27', 'Aug 28', 'Aug 30', 'Aug 31', 'Aug 11'].includes(v.due)).reduce((a, v) => a + v.total, 0)), color: colors.text, sub: 'by due date', go: () => { setStatus('all'); setView('list'); } },
    { label: 'Held / disputed', val: money(invs.filter((v) => ['On Hold', 'Disputed'].includes(v.status)).reduce((a, v) => a + v.total, 0)), color: colors.red, sub: '2 invoices frozen', go: () => { setStatus('On Hold'); setView('list'); } },
  ];
  const aging: Array<[string, number, string]> = [
    ['Current', 0.52, colors.success],
    ['1–15 days', 0.28, colors.gold],
    ['16–30 days', 0.14, colors.amber],
    ['30+ days', 0.06, colors.scoreLow],
  ];
  const augExp = invs.filter((v) => v.expMonth === 'AUG 2026' && v.status !== 'Rejected').reduce((a, v) => a + v.total, 0);
  const augCash = invs.filter((v) => v.payMonth === 'AUG 2026').reduce((a, v) => a + v.total, 0);
  const attention = invs.filter((v) => ['Pending Approval', 'Review Required', 'On Hold', 'Disputed'].includes(v.status));

  // List filtering.
  const q = query.toLowerCase();
  const filtered = invs.filter(
    (v) =>
      (status === 'all' || v.status === status) &&
      (loc === 'all' || v.loc === loc) &&
      (!q || (v.vendor + ' ' + v.number + ' ' + v.po).toLowerCase().includes(q)),
  );
  const statuses: Array<'all' | InvoiceStatus> = ['all', 'Received', 'Processing', 'Review Required', 'Pending Approval', 'Approved', 'Scheduled', 'Paid', 'Rejected', 'On Hold', 'Disputed'];

  // Detail.
  const d = invs.find((v) => v.id === invId) ?? invs[0];
  const decided = decisions[d.id];
  const dFields: Array<[string, string]> = [
    ['Invoice date', d.invDate],
    ['Service date', d.svcDate],
    ['Expense date', d.expDate + '  →  ' + d.expMonth],
    ['Due date', d.due],
    ['Payment status', d.payStatus + (d.payMonth !== '—' ? '  →  ' + d.payMonth : '')],
    ['Payment terms', d.terms],
    ['PO number', d.po],
    ['Category', d.cat],
    ['Location', d.loc],
    ['Approval', approvalLabel[d.status]],
  ];
  const dAudit = (decided
    ? [[
        decided === 'Approved' ? 'Approved · step 1 of 2' : decided === 'Rejected' ? 'Rejected' : 'Placed on hold',
        decided === 'Approved' ? 'Approved from mobile · awaiting Controller (step 2)' : 'Decision recorded from mobile · vendor will be notified',
        'You', 'Aug 17 · 9:41 AM',
      ] as [string, string, string, string], ...d.audit]
    : d.audit);

  const headerTitle = { dash: 'AP · OVERVIEW', list: 'AP · INVOICES', detail: 'INVOICE', upload: 'AP · UPLOAD' }[view];
  const headerSub = view === 'detail'
    ? d.number + ' · ' + d.vendor
    : 'Accounts payable · All locations · Aug 17, 9:41 AM';

  const tabs: Array<[Exclude<ViewKey, 'detail'>, string, string]> = [
    ['dash', '◈', 'Overview'],
    ['list', '☰', 'Invoices'],
    ['upload', '↑', 'Upload'],
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg, overflow: 'hidden' }}>
      {/* Header */}
      <View style={{ backgroundColor: colors.ink, paddingTop: 14, paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {view === 'detail' && (
          <Pressable
            onPress={() => setView(from)}
            style={{ backgroundColor: colors.inkSecondary, borderRadius: 8, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: colors.gold, fontSize: 15 }}>‹</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ ...fMono(700, 15, 0.18), color: colors.appBg }} numberOfLines={1}>{headerTitle}</Text>
          <Text style={{ ...fSans(500, 10), color: colors.headerMuted, marginTop: 1 }} numberOfLines={1}>{headerSub}</Text>
        </View>
        <View style={{ borderWidth: 1, borderColor: colors.gold, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5 }}>
          <Text style={{ ...fMono(600, 8.5, 0.1), color: colors.gold }}>MOCK DATA</Text>
        </View>
      </View>

      {/* ── Overview ── */}
      {view === 'dash' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 16 }}>
          <View style={{ gap: 8 }}>
            {[dashStats.slice(0, 2), dashStats.slice(2)].map((row, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                {row.map((s) => (
                  <Pressable key={s.label} onPress={s.go} style={{ ...card, flex: 1, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 11 }}>
                    <Text style={{ ...fSans(500, 10), color: colors.textSecondary2 }}>{s.label}</Text>
                    <Text style={{ ...fMono(600, 18, -0.02), color: s.color, marginTop: 3 }}>{s.val}</Text>
                    <Text style={{ ...fSans(400, 10.5), color: colors.muted, marginTop: 2 }}>{s.sub}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>

          <View>
            <SectionLabel>AGING · OPEN AP BY DUE DATE</SectionLabel>
            <View style={{ ...card, padding: 14 }}>
              <View style={{ flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', gap: 2 }}>
                {aging.map(([label, p, c]) => (
                  <View key={label} style={{ flex: p, backgroundColor: c }} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
                {aging.map(([label, p, c]) => (
                  <View key={label} style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: c }} />
                      <Text style={{ ...fSans(500, 9.5), color: colors.textSecondary2 }}>{label}</Text>
                    </View>
                    <Text style={{ ...fMono(600, 12.5), color: colors.text, marginTop: 2 }}>{money(openTotal * p)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View>
            <SectionLabel>EXPENSE MONTH VS PAYMENT MONTH</SectionLabel>
            <View style={{ ...card, padding: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[
                  { label: 'AUG EXPENSES · P&L', color: colors.green, val: money(augExp), sub: 'invoices expense-dated in August, paid or not' },
                  { label: 'AUG CASH OUT · AP', color: colors.amber, val: money(augCash), sub: 'payments landing in August, incl. July invoices' },
                ].map((c) => (
                  <View key={c.label} style={{ flex: 1, borderWidth: 1, borderColor: colors.divider, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 }}>
                    <Text style={{ ...fSans(600, 9, 0.1), color: c.color }}>{c.label}</Text>
                    <Text style={{ ...fMono(600, 17), color: colors.text, marginTop: 4, marginBottom: 2 }}>{c.val}</Text>
                    <Text style={{ ...fSans(400, 10), lineHeight: 14, color: colors.muted }}>{c.sub}</Text>
                  </View>
                ))}
              </View>
              <Text style={{ ...fSans(400, 10.5), lineHeight: 15.75, color: colors.textSecondary2, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.divider }}>
                One invoice = one expense (its expense month) + one cash outflow (its payment month). Paying an August invoice in September never creates a September expense.
              </Text>
            </View>
          </View>

          <View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginHorizontal: 2, marginBottom: 8 }}>
              <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, flex: 1 }}>NEEDS ATTENTION</Text>
              <Pressable onPress={() => { setStatus('all'); setView('list'); }}>
                <Text style={{ ...fSans(600, 10.5), color: colors.green }}>All invoices ›</Text>
              </Pressable>
            </View>
            <View style={{ gap: 8 }}>
              {attention.map((v) => (
                <Pressable key={v.id} onPress={openInv(v, 'dash')} style={{ ...card, paddingVertical: 11, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <Text style={{ ...fSans(600, 12), color: colors.text, flexShrink: 1 }} numberOfLines={1}>{v.vendor}</Text>
                      <StatusBadge status={v.status} />
                    </View>
                    <Text style={{ ...fSans(400, 10.5), color: colors.muted, marginTop: 3 }}>
                      {v.number} · {v.loc} · due {v.due}
                    </Text>
                  </View>
                  <Text style={{ ...fMono(600, 13), color: colors.text }}>{money(v.total)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {/* ── Invoice list ── */}
      {view === 'list' && (
        <>
          <View style={{ backgroundColor: colors.ink, paddingHorizontal: 14, paddingBottom: 12 }}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search vendor, number, PO…"
              placeholderTextColor={colors.headerMuted}
              style={{ backgroundColor: colors.inkSecondary, color: colors.appBg, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12, ...fSans(400, 12.5) }}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: 4, paddingBottom: 2 }}>
              {statuses.map((s) => (
                <Chip key={s} label={s === 'all' ? 'ALL' : s.toUpperCase()} active={status === s} onPress={() => setStatus(s)} />
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
              {(['all', 'SOHO', 'MID', 'BKN'] as const).map((l) => (
                <Chip key={l} label={l.toUpperCase()} active={loc === l} onPress={() => setLoc(l)} />
              ))}
              <View style={{ flex: 1 }} />
              {([['expense', 'EXP MO'], ['payment', 'PAY MO']] as const).map(([id, label]) => (
                <Chip key={id} label={label} active={monthLens === id} onPress={() => setMonthLens(id)} />
              ))}
            </View>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 14, paddingBottom: 20 }}>
            <Text style={{ ...fSans(500, 10.5), color: colors.muted, marginHorizontal: 2, marginBottom: 8 }}>
              {filtered.length} of {invs.length} invoices · mock data
            </Text>
            <View style={{ gap: 8 }}>
              {filtered.map((v) => (
                <Pressable key={v.id} onPress={openInv(v, 'list')} style={{ ...card, paddingVertical: 12, paddingHorizontal: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={{ ...fSans(600, 12.5), color: colors.text, flex: 1 }} numberOfLines={1}>{v.vendor}</Text>
                    <Text style={{ ...fMono(600, 13), color: colors.text }}>{money(v.total)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 }}>
                    <StatusBadge status={v.status} />
                    <Text style={{ ...fSans(400, 10.5), color: colors.muted, flex: 1 }} numberOfLines={1}>
                      {v.number} · {v.loc} · due {v.due}
                    </Text>
                    <Text style={{ ...fMono(600, 9), color: monthLens === 'expense' ? colors.green : colors.amber }}>
                      {monthLens === 'expense' ? 'EXP ' + v.expMonth.slice(0, 3) : 'PAY ' + (v.payMonth === '—' ? '—' : v.payMonth.slice(0, 3))}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </>
      )}

      {/* ── Invoice detail ── */}
      {view === 'detail' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 14 }}>
          <View style={{ ...card, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ ...fSans(600, 16), color: colors.text }}>{d.vendor}</Text>
                <Text style={{ ...fMono(500, 11), color: colors.textSecondary2, marginTop: 3 }}>
                  {d.number} · PO {d.po}
                </Text>
              </View>
              <StatusBadge status={d.status} />
            </View>
            <Text style={{ ...fMono(700, 26, -0.02), color: colors.text, marginTop: 12, marginBottom: 2 }}>{money(d.total)}</Text>
            <Text style={{ ...fSans(400, 11), color: colors.muted }}>
              Subtotal {money(d.sub)} + tax {money(d.tax)} · {d.terms} · {d.cat} · {d.loc}
            </Text>
            {d.status === 'Pending Approval' && !decided && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                <Pressable
                  onPress={() => setDecisions({ ...decisions, [d.id]: 'Approved' })}
                  style={{ flex: 1, backgroundColor: colors.green, borderRadius: 9, paddingVertical: 11, alignItems: 'center' }}
                >
                  <Text style={{ ...fSans(600, 12.5), color: '#fff' }}>Approve</Text>
                </Pressable>
                <Pressable
                  onPress={() => setDecisions({ ...decisions, [d.id]: 'Rejected' })}
                  style={{ flex: 1, borderWidth: 1.5, borderColor: colors.scoreLow, backgroundColor: colors.card, borderRadius: 9, paddingVertical: 11, alignItems: 'center' }}
                >
                  <Text style={{ ...fSans(600, 12.5), color: colors.red }}>Reject</Text>
                </Pressable>
                <Pressable
                  onPress={() => setDecisions({ ...decisions, [d.id]: 'On Hold' })}
                  style={{ borderWidth: 1.5, borderColor: colors.sheetHandle, backgroundColor: colors.card, borderRadius: 9, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center' }}
                >
                  <Text style={{ ...fSans(600, 12.5), color: colors.textSecondary }}>Hold</Text>
                </Pressable>
              </View>
            )}
          </View>

          <View style={{ backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16 }}>
            <Text style={{ ...fSans(600, 9, 0.12), color: colors.gold, marginBottom: 10 }}>
              ONE INVOICE · ONE EXPENSE · ONE CASH EVENT
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, backgroundColor: colors.inkSecondary, borderRadius: 9, paddingVertical: 10, paddingHorizontal: 12 }}>
                <Text style={{ ...fSans(600, 9, 0.08), color: colors.headerMuted }}>EXPENSE MONTH · P&L</Text>
                <Text style={{ ...fMono(600, 15), color: colors.appBg, marginTop: 4 }}>{d.expMonth}</Text>
                <Text style={{ ...fSans(400, 9.5), color: colors.scoreSub, marginTop: 2 }}>from expense date {d.expDate}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: colors.inkSecondary, borderRadius: 9, paddingVertical: 10, paddingHorizontal: 12 }}>
                <Text style={{ ...fSans(600, 9, 0.08), color: colors.headerMuted }}>PAYMENT MONTH · CASH</Text>
                <Text style={{ ...fMono(600, 15), color: colors.appBg, marginTop: 4 }}>{d.payMonth}</Text>
                <Text style={{ ...fSans(400, 9.5), color: colors.scoreSub, marginTop: 2 }}>
                  {d.payMonth === '—' ? 'not yet paid — no cash event exists' : 'from payment ' + d.payDate}
                </Text>
              </View>
            </View>
            {d.crossDemo && d.payMonth !== '—' && d.expMonth !== d.payMonth && (
              <Text style={{ ...fSans(400, 10.5), lineHeight: 15.75, color: colors.headerMuted, marginTop: 10 }}>
                Cross-month: this hits the {d.expMonth.split(' ')[0]} P&L and the {d.payMonth.split(' ')[0]} cash flow. It will never appear as a {d.payMonth.split(' ')[0]} expense.
              </Text>
            )}
          </View>

          <View style={{ ...card, paddingVertical: 4, paddingHorizontal: 14 }}>
            {dFields.map(([label, val], i) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 8.5, borderBottomWidth: i === dFields.length - 1 ? 0 : 1, borderBottomColor: colors.divider }}>
                <Text style={{ ...fSans(500, 11), color: colors.textSecondary2, width: 110 }}>{label}</Text>
                <Text style={{ ...fMono(500, 12), color: colors.text, flex: 1 }}>{val}</Text>
              </View>
            ))}
          </View>

          <View>
            <SectionLabel>LINE ITEMS</SectionLabel>
            <View style={{ ...card, paddingVertical: 4, paddingHorizontal: 14 }}>
              {d.lines.map(([desc, cat, amt], i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 9, borderBottomWidth: i === d.lines.length - 1 ? 0 : 1, borderBottomColor: colors.divider }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...fSans(500, 12), color: colors.text }}>{desc}</Text>
                    <Text style={{ ...fSans(400, 10), color: colors.muted, marginTop: 1 }}>{cat}</Text>
                  </View>
                  <Text style={{ ...fMono(600, 12), color: colors.text }}>{money(amt)}</Text>
                </View>
              ))}
            </View>
          </View>

          <View>
            <SectionLabel>AUDIT HISTORY</SectionLabel>
            <View style={{ ...card, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 6 }}>
              {dAudit.map(([action, detail, actor, when], i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10, paddingBottom: 14 }}>
                  <View style={{ alignItems: 'center' }}>
                    <View style={{ width: 9, height: 9, borderRadius: 4.5, marginTop: 3, backgroundColor: i === 0 ? colors.gold : colors.sheetHandle }} />
                    {i < dAudit.length - 1 && <View style={{ width: 1.5, flex: 1, backgroundColor: colors.cardBorder, marginTop: 3 }} />}
                  </View>
                  <View style={{ flex: 1, marginTop: -2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <Text style={{ ...fSans(600, 11.5), color: colors.text, flex: 1 }}>{action}</Text>
                      <Text style={{ ...fMono(500, 9.5), color: colors.faint }}>{when}</Text>
                    </View>
                    {!!detail && (
                      <Text style={{ ...fSans(400, 10.5), lineHeight: 15.75, color: colors.textSecondary2, marginTop: 2 }}>{detail}</Text>
                    )}
                    <Text style={{ ...fSans(500, 9.5), color: colors.muted, marginTop: 2 }}>{actor}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {/* ── Upload ── */}
      {view === 'upload' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 14 }}>
          <View style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: '#c5c1b4', borderRadius: 14, paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center', backgroundColor: '#fbfaf6' }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              <Text style={{ color: colors.gold, fontSize: 20 }}>↑</Text>
            </View>
            <Text style={{ ...fSans(600, 13.5), color: colors.text }}>Snap or upload an invoice</Text>
            <Text style={{ ...fSans(400, 11), lineHeight: 16.5, color: colors.muted, marginTop: 4, textAlign: 'center' }}>
              PDF or photo. OCR extracts vendor, dates and amounts — you confirm before anything is booked.
            </Text>
            <Pressable onPress={() => setUploadStage(1)} style={{ marginTop: 14, backgroundColor: colors.green, borderRadius: 9, paddingVertical: 11, paddingHorizontal: 22 }}>
              <Text style={{ ...fSans(600, 12.5), color: '#fff' }}>Simulate upload (mock)</Text>
            </Pressable>
          </View>

          {uploadStage === 1 && (
            <View style={{ ...card, paddingVertical: 14, paddingHorizontal: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Text style={{ ...fSans(600, 12.5), color: colors.text, flex: 1 }}>OCR extraction · hudson-inv-90233.pdf</Text>
                <Text style={{ ...fMono(500, 9.5), color: colors.muted }}>conf 0.94</Text>
              </View>
              {uploadFields.map(([label, val, conf], i) => (
                <View key={label} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 7, borderBottomWidth: i === uploadFields.length - 1 ? 0 : 1, borderBottomColor: colors.divider }}>
                  <Text style={{ ...fSans(500, 11), color: colors.textSecondary2, width: 110 }}>{label}</Text>
                  <Text style={{ ...fMono(500, 12), color: colors.text, flex: 1 }}>{val}</Text>
                  <Text style={{ ...fMono(500, 9), color: conf === 'derived' ? colors.muted : parseFloat(conf) >= 0.9 ? colors.green : colors.amber }}>
                    {conf}
                  </Text>
                </View>
              ))}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: colors.amberBg, borderWidth: 1, borderColor: colors.amberBorder, borderRadius: 9 }}>
                <Text style={{ fontSize: 13 }}>⚠︎</Text>
                <Text style={{ ...fSans(400, 10.5), lineHeight: 15.75, color: '#7a5c26', flex: 1 }}>
                  Duplicate guard: no existing invoice matches Hudson Valley Produce + #90233. Document hash is new. Safe to create.
                </Text>
              </View>
              <Pressable onPress={() => setUploadStage(2)} style={{ marginTop: 12, backgroundColor: colors.green, borderRadius: 9, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ ...fSans(600, 13), color: '#fff' }}>Create invoice · status Received</Text>
              </Pressable>
            </View>
          )}

          {uploadStage === 2 && (
            <View style={{ backgroundColor: colors.greenBgLight, borderWidth: 1, borderColor: '#bcd8ca', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 13 }}>✓</Text>
              </View>
              <Text style={{ ...fSans(500, 12), lineHeight: 18, color: colors.green, flex: 1 }}>
                Invoice created as <Text style={{ ...fSans(700, 12) }}>Received</Text> and added to the queue. Audit entry logged (source: upload, actor: you).
              </Text>
            </View>
          )}

          <Text style={{ ...fSans(400, 10.5), lineHeight: 16.8, color: colors.muted, paddingHorizontal: 4 }}>
            Invoices can also arrive by email capture (ap@yourgroup.monark.app) or vendor integration. Every path runs the same duplicate guards: vendor + invoice number, and document fingerprint.
          </Text>
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
