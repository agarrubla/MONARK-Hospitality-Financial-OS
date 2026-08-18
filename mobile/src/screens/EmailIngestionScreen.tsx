/**
 * Email intake — pixel-perfect port of "Monark Email Ingestion.dc.html".
 * Dedicated AP inbox, 8-step pipeline timeline per email (received →
 * validated → OCR → vendor match → duplicate check → classify → AP record),
 * full provenance (Message-ID, .eml archived).
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  confColor, emailBadges, emails, outcomeStyles,
  type StepStatus,
} from '../data/emailData';
import { colors, fMono, fSans } from '../theme/tokens';

const card = {
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.cardBorder,
  borderRadius: 12,
} as const;

const stepDot: Record<StepStatus, { bg: string; border?: string; color: string; mark: string }> = {
  done: { bg: colors.green, color: '#fff', mark: '✓' },
  warn: { bg: colors.amberBg, border: colors.amber, color: colors.amber, mark: '!' },
  stop: { bg: colors.red, color: '#fff', mark: '✕' },
  hold: { bg: colors.card, border: colors.amber, color: colors.amber, mark: '⏸' },
  active: { bg: colors.gold, color: colors.ink, mark: '●' },
  todo: { bg: colors.divider, color: colors.faint, mark: '·' },
};

export default function EmailIngestionScreen() {
  const [view, setView] = useState<'inbox' | 'detail'>('inbox');
  const [emailId, setEmailId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'created' | 'review' | 'held'>('all');

  const cat = (e: (typeof emails)[number]) =>
    e.status === 'Pending Approval' ? 'created' : e.status === 'Review Required' ? 'review' : e.processing ? 'all' : 'held';
  const visible = emails.filter((e) => filter === 'all' || cat(e) === filter);

  const d = emails.find((e) => e.id === emailId) ?? emails[0];
  const [ocBg, ocBorder, ocColor, ocMark] = outcomeStyles[d.outcome.kind];
  const dMeta: Array<[string, string]> = [
    ['Received', d.time === 'Yesterday' || d.time === 'Aug 15' ? d.time + ' 2026' : 'Aug 17, 2026 · ' + d.time],
    ['From', d.sender.replace(' (fwd)', '')],
    ['To', 'ap@velagroup.monark.app'],
    ['Message-ID', d.msgId],
    ['Attachment', d.attachment],
    ['Status', d.status],
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg, overflow: 'hidden' }}>
      {/* Header */}
      <View style={{ backgroundColor: colors.ink, paddingTop: 14, paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {view === 'detail' && (
          <Pressable onPress={() => setView('inbox')} style={{ backgroundColor: colors.inkSecondary, borderRadius: 8, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.gold, fontSize: 15 }}>‹</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ ...fMono(700, 15, 0.18), color: colors.appBg }} numberOfLines={1}>
            {view === 'inbox' ? 'EMAIL INGESTION' : 'EMAIL PIPELINE'}
          </Text>
          <Text style={{ ...fSans(500, 10), color: colors.headerMuted, marginTop: 1 }} numberOfLines={1}>
            {view === 'inbox' ? 'AP inbox · automated intake · Aug 17, 9:41 AM' : d.attachment + ' · ' + d.sender}
          </Text>
        </View>
        <View style={{ borderWidth: 1, borderColor: colors.gold, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5 }}>
          <Text style={{ ...fMono(600, 8.5, 0.1), color: colors.gold }}>MOCK DATA</Text>
        </View>
      </View>

      {/* ── Inbox ── */}
      {view === 'inbox' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 16 }}>
          <View style={{ backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.inkSecondary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.gold, fontSize: 16 }}>✉</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ ...fMono(600, 12.5), color: colors.appBg }} numberOfLines={1}>
                  ap@velagroup.monark.app
                </Text>
                <Text style={{ ...fSans(400, 10), color: colors.headerMuted, marginTop: 2 }}>
                  Dedicated invoice address · forwarding-safe · vendors can send directly
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.success }} />
                <Text style={{ ...fSans(600, 9.5), color: colors.success }}>LIVE</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {[
                { val: '31', label: 'emails this week' },
                { val: '26', label: 'invoices created' },
                { val: '94%', label: 'auto-extracted clean' },
              ].map((s) => (
                <View key={s.label} style={{ flex: 1, backgroundColor: colors.inkSecondary, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 11 }}>
                  <Text style={{ ...fMono(600, 16), color: colors.appBg }}>{s.val}</Text>
                  <Text style={{ ...fSans(400, 9), color: colors.headerMuted, marginTop: 1 }}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginHorizontal: 2, marginBottom: 8 }}>
              <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, flex: 1 }}>RECEIVED EMAILS · TODAY</Text>
              <Text style={{ ...fSans(400, 9.5), color: colors.faint }}>tap for pipeline</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 4, marginBottom: 8 }}>
              {([['all', 'ALL'], ['created', 'CREATED'], ['review', 'REVIEW'], ['held', 'HELD/STOPPED']] as const).map(([id, label]) => {
                const on = filter === id;
                return (
                  <Pressable key={id} onPress={() => setFilter(id)} style={{ borderRadius: 6, paddingVertical: 5, paddingHorizontal: 9, backgroundColor: on ? colors.gold : colors.card, borderWidth: on ? 0 : 1, borderColor: colors.cardBorder }}>
                    <Text style={{ ...fMono(600, 10, 0.03), color: on ? colors.ink : colors.textSecondary2 }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ gap: 8 }}>
              {visible.map((e) => {
                const [c, bg] = emailBadges[e.status] ?? [colors.green, colors.greenBgLight];
                return (
                  <Pressable key={e.id} onPress={() => { setEmailId(e.id); setView('detail'); }} style={{ ...card, paddingVertical: 12, paddingHorizontal: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <Text style={{ ...fSans(600, 12), color: colors.text, flex: 1 }} numberOfLines={1}>{e.sender}</Text>
                      <Text style={{ ...fMono(500, 9.5), color: colors.faint }}>{e.time}</Text>
                    </View>
                    <Text style={{ ...fSans(400, 10.5), color: colors.textSecondary2, marginTop: 2 }} numberOfLines={1}>{e.subject}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 }}>
                      <View style={{ backgroundColor: colors.sheetClose, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 4 }}>
                        <Text style={{ ...fMono(600, 7.5), color: colors.textSecondary }}>{e.ext}</Text>
                      </View>
                      <Text style={{ ...fMono(400, 10), color: colors.muted, flex: 1 }} numberOfLines={1}>
                        {e.attachment + (e.size ? ' · ' + e.size : '')}
                      </Text>
                      <View style={{ backgroundColor: bg, borderRadius: 4, paddingVertical: 2.5, paddingHorizontal: 6 }}>
                        <Text style={{ ...fSans(600, 8, 0.04), color: c, textTransform: 'uppercase' }} numberOfLines={1}>{e.status}</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
      )}

      {/* ── Pipeline detail ── */}
      {view === 'detail' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 14 }}>
          <View style={{ ...card, paddingVertical: 4, paddingHorizontal: 14 }}>
            {dMeta.map(([label, val]) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                <Text style={{ ...fSans(500, 11), color: colors.textSecondary2, width: 96 }}>{label}</Text>
                <Text style={{ ...fMono(500, 11.5), color: colors.text, flex: 1 }}>{val}</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
              <Text style={{ ...fSans(500, 11), color: colors.textSecondary2, width: 96 }}>Provenance</Text>
              <Text style={{ ...fSans(400, 10.5), lineHeight: 15.75, color: colors.textSecondary, flex: 1 }}>
                Original email (.eml) and attachment are stored immutably and linked to the AP record — the invoice can always be traced back to exactly who sent it and when.
              </Text>
            </View>
          </View>

          <View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginHorizontal: 2, marginBottom: 8 }}>
              <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, flex: 1 }}>PROCESSING PIPELINE</Text>
              <Text style={{ ...fMono(600, 9.5), color: d.processing ? colors.blue : confColor(d.overall) }}>
                {d.processing ? 'running' : 'overall conf ' + d.overall.toFixed(2)}
              </Text>
            </View>
            <View style={{ ...card, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 6 }}>
              {d.steps.map((s, i) => {
                const vis = stepDot[s.status];
                return (
                  <View key={i} style={{ flexDirection: 'row', gap: 10, paddingBottom: 14 }}>
                    <View style={{ alignItems: 'center', width: 18 }}>
                      <View style={{ width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: vis.bg, borderWidth: vis.border ? 1.5 : 0, borderColor: vis.border }}>
                        <Text style={{ ...fSans(700, 10), color: vis.color }}>{vis.mark}</Text>
                      </View>
                      {i < d.steps.length - 1 && <View style={{ width: 1.5, flex: 1, backgroundColor: colors.cardBorder, marginTop: 3 }} />}
                    </View>
                    <View style={{ flex: 1, marginTop: -1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                        <Text style={{ ...fSans(600, 11.5), color: s.status === 'todo' ? colors.faint : colors.text, flex: 1 }}>{s.title}</Text>
                        <Text style={{ ...fMono(500, 9), color: colors.faint }}>{s.when}</Text>
                      </View>
                      <Text style={{ ...fSans(400, 10.5), lineHeight: 15.75, color: colors.textSecondary2, marginTop: 2 }}>{s.detail}</Text>
                      {s.conf !== undefined && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 }}>
                          <View style={{ flex: 1, maxWidth: 120, height: 4, borderRadius: 2, backgroundColor: colors.divider, overflow: 'hidden' }}>
                            <View style={{ height: '100%', borderRadius: 2, width: `${Math.round(s.conf * 100)}%`, backgroundColor: confColor(s.conf) }} />
                          </View>
                          <Text style={{ ...fMono(500, 9), color: confColor(s.conf) }}>conf {s.conf.toFixed(2)}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={{ backgroundColor: ocBg, borderWidth: 1.5, borderColor: ocBorder, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 15 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: ocColor, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 12 }}>{ocMark}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ ...fSans(600, 12), color: colors.text }}>{d.outcome.title}</Text>
                <Text style={{ ...fSans(400, 10.5), lineHeight: 15.75, color: colors.textSecondary, marginTop: 2 }}>{d.outcome.note}</Text>
              </View>
            </View>
            {!!d.outcome.action && (
              <Pressable style={{ marginTop: 11, backgroundColor: colors.green, borderRadius: 9, paddingVertical: 11, alignItems: 'center' }}>
                <Text style={{ ...fSans(600, 12), color: '#fff' }}>{d.outcome.action}</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
