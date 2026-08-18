/**
 * Approvals — pixel-perfect port of "Monark Approval Workflow.dc.html".
 * 9-stage lifecycle pipeline, approval chains with separation-of-duties
 * blocks, configurable rules (<$2.5K / $2.5–10K / >$10K tiers), notifications.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  alertKinds, hardRules, stageNames, stageOwners, workflowAlerts, workflowInvoices,
  type ChainState, type WorkflowInvoice,
} from '../data/approvalData';
import { colors, fMono, fSans } from '../theme/tokens';

type ViewKey = 'pipeline' | 'detail' | 'rules' | 'alerts';
type Decision = 'approve' | 'reject' | 'return';

const money = (n: number): string => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2 });

const card = {
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.cardBorder,
  borderRadius: 12,
} as const;

const stageBadgeColors: Record<number, [string, string]> = {
  3: ['#4a6b8a', '#edf2f7'], 4: ['#b07c1e', '#fdf6ec'], 5: ['#14584a', '#eaf3ee'],
  6: ['#14584a', '#eaf3ee'], 7: ['#14584a', '#eaf3ee'], 8: ['#5c6b64', '#f0efe9'], 9: ['#5c6b64', '#f0efe9'],
};

function SectionLabel({ children }: { children: string }) {
  return (
    <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, marginHorizontal: 2, marginBottom: 8 }}>
      {children}
    </Text>
  );
}

function applyDecision(v: WorkflowInvoice, dec: Decision | undefined): WorkflowInvoice {
  if (!dec) return v;
  const now: [string, string, string, string][] = {
    approve: [['Step 2 approved — chain complete', 'Approved from mobile · invoice moves to Approved → Treasury. Notification sent to creator & AP.', 'M. Okafor (Controller)', 'Aug 17 · 9:41 AM']],
    reject: [['Rejected', 'Rejected from mobile · vendor & creator notified · chain closed', 'M. Okafor (Controller)', 'Aug 17 · 9:41 AM']],
    return: [['Returned for correction', 'Sent back to AP Review from mobile · creator notified · chain will restart after fix', 'M. Okafor (Controller)', 'Aug 17 · 9:41 AM']],
  }[dec] as Array<[string, string, string, string]>;
  const nextState: ChainState = dec === 'approve' ? 'approved' : dec === 'reject' ? 'rejected' : 'returned';
  return {
    ...v,
    stage: dec === 'approve' ? 5 : dec === 'reject' ? 4 : 3,
    rejected: dec === 'reject',
    canAct: false,
    chain: v.chain.map((c) => (c.state === 'pending' ? { ...c, state: nextState } : c)),
    history: [...now, ...v.history],
  };
}

export default function ApprovalWorkflowScreen() {
  const [view, setView] = useState<ViewKey>('pipeline');
  const [invId, setInvId] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<number | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [sod, setSod] = useState<Record<'r1' | 'r2' | 'r3', boolean>>({ r1: true, r2: true, r3: true });

  const invs = useMemo(() => workflowInvoices.map((v) => applyDecision(v, decisions[v.id])), [decisions]);
  const flight = stageFilter
    ? invs.filter((v) => v.stage === stageFilter)
    : invs.filter((v) => v.stage >= 3 && v.stage <= 7);
  const d = invs.find((v) => v.id === invId) ?? invs[0];
  const [dBadgeColor, dBadgeBg] = stageBadgeColors[d.stage] ?? ['#4a6b8a', '#edf2f7'];

  const chainVisual: Record<ChainState, { bg: string; border?: string; color: string; mark: string; label: string; labelColor: string }> = {
    approved: { bg: colors.green, color: '#fff', mark: '✓', label: 'APPROVED', labelColor: colors.green },
    rejected: { bg: colors.red, color: '#fff', mark: '✕', label: 'REJECTED', labelColor: colors.red },
    returned: { bg: colors.card, border: colors.amber, color: colors.amber, mark: '↩', label: 'RETURNED', labelColor: colors.amber },
    active: { bg: colors.gold, color: colors.ink, mark: '●', label: 'IN PROGRESS', labelColor: colors.goldText },
    pending: { bg: colors.card, border: '#c5c1b4', color: colors.faint, mark: '·', label: 'PENDING', labelColor: colors.amber },
  };

  const headerTitle = view === 'detail' ? 'APPROVAL' : view === 'rules' ? 'APPROVAL RULES' : view === 'alerts' ? 'NOTIFICATIONS' : 'WORKFLOW';

  const ruleCards = [
    { id: 'r1' as const, range: 'Under $2,500', steps: '1 STEP', chain: [['1', 'Location GM', 'any GM of the invoice location']], sodNote: sod.r1 ? 'The invoice creator can never be its approver.' : 'Off: creator may approve their own invoice (not recommended).' },
    { id: 'r2' as const, range: '$2,500 – $10,000', steps: '2 STEPS', chain: [['1', 'Location GM', 'manager sign-off'], ['2', 'Controller', 'financial sign-off']], sodNote: sod.r2 ? 'Creator blocked from both steps; the same person cannot take both steps.' : 'Off: overlapping approvers allowed (not recommended).' },
    { id: 'r3' as const, range: 'Over $10,000', steps: '2 STEPS', chain: [['1', 'Location GM', 'manager sign-off'], ['2', 'Owner', 'R. Vela — required, no delegate']], sodNote: sod.r3 ? 'Creator blocked; owner step cannot be delegated below owner role.' : 'Off: not permitted for this tier — reverts on save.' },
  ];

  const tabs: Array<[Exclude<ViewKey, 'detail'>, string, string, boolean]> = [
    ['pipeline', '◈', 'Pipeline', false],
    ['rules', '⚖', 'Rules', false],
    ['alerts', '◉', 'Alerts', true],
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg, overflow: 'hidden' }}>
      {/* Header */}
      <View style={{ backgroundColor: colors.ink, paddingTop: 14, paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {view === 'detail' && (
          <Pressable onPress={() => setView('pipeline')} style={{ backgroundColor: colors.inkSecondary, borderRadius: 8, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.gold, fontSize: 15 }}>‹</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ ...fMono(700, 15, 0.18), color: colors.appBg }} numberOfLines={1}>{headerTitle}</Text>
          <Text style={{ ...fSans(500, 10), color: colors.headerMuted, marginTop: 1 }} numberOfLines={1}>
            {view === 'detail' ? d.meta : 'Invoice lifecycle · Vela Group · Aug 17, 9:41 AM'}
          </Text>
        </View>
        <View style={{ borderWidth: 1, borderColor: colors.gold, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5 }}>
          <Text style={{ ...fMono(600, 8.5, 0.1), color: colors.gold }}>MOCK DATA</Text>
        </View>
      </View>

      {/* ── Pipeline ── */}
      {view === 'pipeline' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 16 }}>
          <View style={{ ...card, padding: 14 }}>
            <Text style={{ ...fSans(600, 10, 0.12), color: colors.textSecondary2, marginBottom: 10 }}>
              INVOICE LIFECYCLE · 9 STAGES
            </Text>
            {stageNames.map((name, i) => {
              const list = invs.filter((v) => v.stage === i + 1);
              const has = list.length > 0;
              return (
                <Pressable
                  key={name}
                  onPress={() => setStageFilter(stageFilter === i + 1 ? null : i + 1)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 }}
                >
                  <View style={{ width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: has ? colors.ink : colors.sheetClose }}>
                    <Text style={{ ...fMono(700, 10), color: has ? colors.gold : colors.faint }}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...fSans(600, 12), color: colors.text }}>{name}</Text>
                    <Text style={{ ...fSans(400, 9.5), color: colors.muted }}>{stageOwners[i]}</Text>
                  </View>
                  <Text style={{ ...fMono(600, 11), minWidth: 18, textAlign: 'center', color: has ? colors.text : '#c5c1b4' }}>
                    {has ? list.length : '—'}
                  </Text>
                  <Text style={{ ...fMono(600, 12), color: colors.text, minWidth: 64, textAlign: 'right' }}>
                    {has ? money(list.reduce((a, v) => a + v.total, 0)).replace('.00', '') : ''}
                  </Text>
                </Pressable>
              );
            })}
            <Text style={{ ...fSans(400, 10), lineHeight: 15, color: colors.muted, marginTop: 8, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.divider }}>
              Stage 6 (Treasury) funds and sequences approved invoices; stage 9 closes the loop when the bank debit matches the payment. Expense hits the P&L at creation; cash only at payment.
            </Text>
          </View>

          <View>
            <SectionLabel>{'IN FLIGHT · ' + (stageFilter ? stageNames[stageFilter - 1].toUpperCase() : 'ACTIVE STAGES 3–7')}</SectionLabel>
            <View style={{ gap: 8 }}>
              {flight.map((v) => {
                const [c, bg] = v.rejected ? ['#b3402e', '#faeeeb'] : stageBadgeColors[v.stage] ?? ['#4a6b8a', '#edf2f7'];
                return (
                  <Pressable key={v.id} onPress={() => { setInvId(v.id); setView('detail'); }} style={{ ...card, paddingVertical: 12, paddingHorizontal: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <Text style={{ ...fSans(600, 12.5), color: colors.text, flex: 1 }} numberOfLines={1}>{v.vendor}</Text>
                      <Text style={{ ...fMono(600, 13), color: colors.text }}>{money(v.total)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <View style={{ backgroundColor: bg, borderRadius: 4, paddingVertical: 2.5, paddingHorizontal: 6 }}>
                        <Text style={{ ...fSans(600, 8.5, 0.04), color: c, textTransform: 'uppercase' }}>
                          {v.rejected ? 'Rejected' : stageNames[v.stage - 1]}
                        </Text>
                      </View>
                      <Text style={{ ...fSans(400, 10), color: colors.muted, flex: 1 }} numberOfLines={1}>{v.meta}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 3, marginTop: 9 }}>
                      {stageNames.map((_, i) => (
                        <View
                          key={i}
                          style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i + 1 < v.stage ? colors.green : i + 1 === v.stage ? colors.gold : colors.divider }}
                        />
                      ))}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
      )}

      {/* ── Detail ── */}
      {view === 'detail' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 14 }}>
          <View style={{ ...card, paddingVertical: 15, paddingHorizontal: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ ...fSans(600, 15), color: colors.text }}>{d.vendor}</Text>
                <Text style={{ ...fMono(500, 11), color: colors.textSecondary2, marginTop: 2 }}>{d.meta}</Text>
              </View>
              <View style={{ backgroundColor: d.rejected ? '#faeeeb' : dBadgeBg, borderRadius: 4, paddingVertical: 2.5, paddingHorizontal: 6 }}>
                <Text style={{ ...fSans(600, 8.5, 0.04), color: d.rejected ? '#b3402e' : dBadgeColor, textTransform: 'uppercase' }}>
                  {d.rejected ? 'Rejected' : stageNames[d.stage - 1]}
                </Text>
              </View>
            </View>
            <Text style={{ ...fMono(700, 24, -0.02), color: colors.text, marginTop: 10, marginBottom: 2 }}>{money(d.total)}</Text>
            <Text style={{ ...fSans(400, 10.5), color: colors.muted }}>
              Matched rule: {d.rule} · policy frozen at routing
            </Text>
          </View>

          <View>
            <SectionLabel>{'APPROVAL CHAIN · ' + d.chainLabel}</SectionLabel>
            <View style={{ ...card, paddingVertical: 4, paddingHorizontal: 14 }}>
              {d.chain.map((c, i) => {
                const vis = chainVisual[c.state];
                return (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: vis.bg, borderWidth: vis.border ? 1.5 : 0, borderColor: vis.border }}>
                      <Text style={{ ...fSans(700, 11), color: vis.color }}>{vis.mark}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ ...fSans(600, 12), color: colors.text }}>{c.who}</Text>
                      <Text style={{ ...fSans(400, 10), color: colors.muted, marginTop: 1 }}>{c.role}</Text>
                    </View>
                    <Text style={{ ...fMono(600, 9, 0.05), color: vis.labelColor }}>{vis.label}</Text>
                  </View>
                );
              })}
              <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 10, alignItems: 'baseline' }}>
                <Text style={{ fontSize: 11 }}>⛊</Text>
                <Text style={{ ...fSans(400, 10.5), lineHeight: 15.75, color: colors.textSecondary2, flex: 1 }}>
                  {d.blocked
                    ? 'Separation of duties: creator (M. Okafor) is barred from this chain.'
                    : 'Separation of duties on: the invoice creator (' + (d.createdBy ?? 'System') + ') cannot appear in this chain.'}
                </Text>
              </View>
            </View>
          </View>

          {d.canAct && (
            <View style={{ ...card, paddingVertical: 13, paddingHorizontal: 15 }}>
              <Text style={{ ...fSans(600, 10, 0.12), color: colors.textSecondary2, marginBottom: 9 }}>
                YOUR DECISION · AS M. OKAFOR (CONTROLLER)
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={() => setDecisions({ ...decisions, [d.id]: 'approve' })} style={{ flex: 1, backgroundColor: colors.green, borderRadius: 9, paddingVertical: 11, alignItems: 'center' }}>
                  <Text style={{ ...fSans(600, 12), color: '#fff' }}>Approve</Text>
                </Pressable>
                <Pressable onPress={() => setDecisions({ ...decisions, [d.id]: 'reject' })} style={{ flex: 1, borderWidth: 1.5, borderColor: colors.scoreLow, backgroundColor: colors.card, borderRadius: 9, paddingVertical: 11, alignItems: 'center' }}>
                  <Text style={{ ...fSans(600, 12), color: colors.red }}>Reject</Text>
                </Pressable>
                <Pressable onPress={() => setDecisions({ ...decisions, [d.id]: 'return' })} style={{ borderWidth: 1.5, borderColor: colors.sheetHandle, backgroundColor: colors.card, borderRadius: 9, paddingVertical: 11, paddingHorizontal: 12, alignItems: 'center' }}>
                  <Text style={{ ...fSans(600, 12), color: colors.textSecondary }}>Return</Text>
                </Pressable>
              </View>
            </View>
          )}

          {d.blocked && !decisions[d.id] && (
            <View style={{ backgroundColor: colors.redBg, borderWidth: 1.5, borderColor: colors.redBorder, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 15, flexDirection: 'row', gap: 9 }}>
              <Text style={{ fontSize: 13 }}>⛔</Text>
              <Text style={{ ...fSans(400, 11), lineHeight: 17, color: '#8a4a3c', flex: 1 }}>
                <Text style={{ ...fSans(700, 11) }}>You can't approve this one. </Text>
                {d.blockReason}
              </Text>
            </View>
          )}

          <View>
            <SectionLabel>APPROVAL & STAGE HISTORY</SectionLabel>
            <View style={{ ...card, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 6 }}>
              {d.history.map(([action, detail, actor, when], i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10, paddingBottom: 13 }}>
                  <View style={{ alignItems: 'center' }}>
                    <View style={{ width: 9, height: 9, borderRadius: 4.5, marginTop: 3, backgroundColor: i === 0 ? colors.gold : colors.sheetHandle }} />
                    {i < d.history.length - 1 && <View style={{ width: 1.5, flex: 1, backgroundColor: colors.cardBorder, marginTop: 3 }} />}
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

      {/* ── Rules ── */}
      {view === 'rules' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 14 }}>
          <Text style={{ ...fSans(400, 11), lineHeight: 17.6, color: colors.textSecondary, paddingHorizontal: 2 }}>
            Approval rules are evaluated top-down on invoice total. Changing a rule requires owner approval and is itself audited — chains already in flight keep the policy they started with.
          </Text>
          {ruleCards.map((r) => (
            <View key={r.id} style={{ ...card, paddingVertical: 14, paddingHorizontal: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ ...fMono(600, 13), color: colors.text, flex: 1 }}>{r.range}</Text>
                <View style={{ backgroundColor: colors.goldBg, borderRadius: 4, paddingVertical: 3, paddingHorizontal: 7 }}>
                  <Text style={{ ...fMono(600, 8.5, 0.06), color: colors.goldText }}>{r.steps}</Text>
                </View>
              </View>
              <View style={{ gap: 6, marginTop: 10 }}>
                {r.chain.map(([n, who, note]) => (
                  <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.sheetClose, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ ...fSans(700, 9), color: colors.textSecondary }}>{n}</Text>
                    </View>
                    <Text style={{ ...fSans(500, 11.5), color: colors.text, flex: 1 }}>{who}</Text>
                    <Text style={{ ...fSans(400, 10), color: colors.muted }}>{note}</Text>
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 11, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.divider }}>
                <Text style={{ ...fSans(400, 10.5), color: colors.textSecondary2, flex: 1 }}>Block self-approval</Text>
                <Pressable
                  onPress={() => setSod({ ...sod, [r.id]: !sod[r.id] })}
                  style={{ width: 38, height: 22, borderRadius: 11, padding: 2, backgroundColor: sod[r.id] ? colors.green : colors.sheetHandle, alignItems: sod[r.id] ? 'flex-end' : 'flex-start' }}
                >
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff' }} />
                </Pressable>
              </View>
              <Text style={{ ...fSans(400, 9.5), lineHeight: 14.25, color: colors.muted, marginTop: 6 }}>{r.sodNote}</Text>
            </View>
          ))}
          <View style={{ backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16 }}>
            <Text style={{ ...fSans(600, 9, 0.12), color: colors.gold, marginBottom: 7 }}>
              ALWAYS ENFORCED · NOT CONFIGURABLE
            </Text>
            <View style={{ gap: 5 }}>
              {hardRules.map((g) => (
                <View key={g} style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}>
                  <Text style={{ ...fMono(600, 10), color: colors.success }}>✓</Text>
                  <Text style={{ ...fSans(400, 11), lineHeight: 15.95, color: '#c7d4cd', flex: 1 }}>{g}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {/* ── Alerts ── */}
      {view === 'alerts' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 8 }}>
          <Text style={{ ...fSans(400, 11), lineHeight: 17.6, color: colors.textSecondary, paddingHorizontal: 2, paddingBottom: 6 }}>
            Notifications fire on: approval required, approved, rejected, returned for correction, payment scheduled, payment completed.
          </Text>
          {workflowAlerts.map(([kind, title, body, when, unread], i) => {
            const [c, mark] = alertKinds[kind];
            return (
              <View key={i} style={{ flexDirection: 'row', gap: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: unread ? colors.gold : colors.cardBorder, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 12 }}>{mark}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={{ ...fSans(600, 11.5), color: colors.text, flex: 1 }}>{title}</Text>
                    <Text style={{ ...fMono(500, 9), color: colors.faint }}>{when}</Text>
                  </View>
                  <Text style={{ ...fSans(400, 10.5), lineHeight: 15.75, color: colors.textSecondary2, marginTop: 2 }}>{body}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Bottom tab bar */}
      <View style={{ backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.cardBorder, flexDirection: 'row', paddingTop: 6, paddingHorizontal: 8, paddingBottom: 4 }}>
        {tabs.map(([id, icon, label, dot]) => {
          const active = view === id || (view === 'detail' && id === 'pipeline');
          return (
            <Pressable key={id} onPress={() => setView(id)} style={{ flex: 1, paddingVertical: 6, alignItems: 'center' }}>
              <Text style={{ fontSize: 16, lineHeight: 16, color: active ? colors.green : colors.faint }}>{icon}</Text>
              <Text style={{ ...fSans(600, 9), color: active ? colors.green : colors.faint, marginTop: 3 }}>{label}</Text>
              {dot && view !== 'alerts' && (
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.red, marginTop: 2 }} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
