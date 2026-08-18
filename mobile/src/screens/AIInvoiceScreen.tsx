/**
 * AI invoice intake — pixel-perfect port of "Monark AI Invoice Processing.dc.html".
 * Queue (4 channels, guardrails), review screen with per-field confidence,
 * inline corrections (stored as training signals), duplicate gate, subtotal
 * math check. The AI proposes; humans confirm.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  aiDocs, aiGuardrails, confColor, intakeChannels, REVIEW_THRESHOLD, stageBadges,
  type AIDoc, type DocStage,
} from '../data/aiInvoiceData';
import { colors, fMono, fSans } from '../theme/tokens';

const card = {
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.cardBorder,
  borderRadius: 12,
} as const;

function StageBadge({ stage }: { stage: DocStage }) {
  const [c, bg] = stageBadges[stage];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 4, paddingVertical: 2.5, paddingHorizontal: 6 }}>
      <Text style={{ ...fSans(600, 8.5, 0.04), color: c, textTransform: 'uppercase' }}>{stage}</Text>
    </View>
  );
}

export default function AIInvoiceScreen() {
  const [view, setView] = useState<'queue' | 'review'>('queue');
  const [docId, setDocId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'review' | 'dupe' | 'ready'>('all');
  const [editing, setEditing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [corrections, setCorrections] = useState<Record<string, Record<string, string>>>({});
  const [dupeResolved, setDupeResolved] = useState<Record<string, 'new'>>({});
  const [accepted, setAccepted] = useState<Record<string, 'confirmed' | 'discarded'>>({});

  const stageOf = (d: AIDoc): DocStage =>
    accepted[d.id] === 'confirmed' ? 'Ready to confirm' : dupeResolved[d.id] === 'new' ? 'Ready to confirm' : d.stage;

  const visible = aiDocs.filter((d) => {
    if (accepted[d.id] === 'discarded') return false;
    const s = stageOf(d);
    if (filter === 'review') return s === 'Human review';
    if (filter === 'dupe') return s === 'Duplicate check';
    if (filter === 'ready') return s === 'Ready to confirm';
    return true;
  });

  const d = aiDocs.find((x) => x.id === docId) ?? aiDocs[0];
  const corr = corrections[d.id] ?? {};
  const corrList = Object.entries(corr);
  const dupeOpen = !!d.dupe && !dupeResolved[d.id];
  const isConfirmed = accepted[d.id] === 'confirmed';
  const acceptDisabled = dupeOpen || !!d.processing;
  const acceptLabel = isConfirmed
    ? '✓ Created as Received'
    : dupeOpen
      ? 'Resolve duplicate first'
      : d.overall < REVIEW_THRESHOLD && corrList.length === 0
        ? 'Confirm after corrections'
        : 'Confirm → create as Received';

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg, overflow: 'hidden' }}>
      {/* Header */}
      <View style={{ backgroundColor: colors.ink, paddingTop: 14, paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {view === 'review' && (
          <Pressable onPress={() => { setView('queue'); setEditing(null); }} style={{ backgroundColor: colors.inkSecondary, borderRadius: 8, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.gold, fontSize: 15 }}>‹</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ ...fMono(700, 15, 0.18), color: colors.appBg }} numberOfLines={1}>
            {view === 'queue' ? 'AI PROCESSING' : 'REVIEW'}
          </Text>
          <Text style={{ ...fSans(500, 10), color: colors.headerMuted, marginTop: 1 }} numberOfLines={1}>
            {view === 'queue' ? 'Invoice intake · all channels · Aug 17, 9:41 AM' : d.file + ' · ' + d.vendor}
          </Text>
        </View>
        <View style={{ borderWidth: 1, borderColor: colors.gold, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5 }}>
          <Text style={{ ...fMono(600, 8.5, 0.1), color: colors.gold }}>MOCK DATA</Text>
        </View>
      </View>

      {/* ── Queue ── */}
      {view === 'queue' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 16 }}>
          <View>
            <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, marginHorizontal: 2, marginBottom: 8 }}>
              INTAKE CHANNELS · LAST 7 DAYS
            </Text>
            <View style={{ gap: 8 }}>
              {[intakeChannels.slice(0, 2), intakeChannels.slice(2)].map((row, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                  {row.map((c) => (
                    <View key={c.label} style={{ ...card, flex: 1, paddingVertical: 11, paddingHorizontal: 13 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                        <Text style={{ fontSize: 13 }}>{c.icon}</Text>
                        <Text style={{ ...fSans(500, 10.5), color: colors.textSecondary2, flex: 1 }}>{c.label}</Text>
                        <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.success }} />
                      </View>
                      <Text style={{ ...fMono(600, 17), color: colors.text, marginTop: 4, marginBottom: 1 }}>{c.count}</Text>
                      <Text style={{ ...fSans(400, 9.5), color: colors.muted }}>{c.sub}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </View>

          <View style={{ backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16 }}>
            <Text style={{ ...fSans(600, 9, 0.12), color: colors.gold, marginBottom: 8 }}>AI GUARDRAILS — ALWAYS ON</Text>
            <View style={{ gap: 6 }}>
              {aiGuardrails.map((g) => (
                <View key={g} style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}>
                  <Text style={{ ...fMono(600, 10), color: colors.success }}>✓</Text>
                  <Text style={{ ...fSans(400, 11), lineHeight: 15.95, color: '#c7d4cd', flex: 1 }}>{g}</Text>
                </View>
              ))}
            </View>
          </View>

          <View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginHorizontal: 2, marginBottom: 8 }}>
              <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, flex: 1 }}>PROCESSING QUEUE</Text>
              <Text style={{ ...fSans(500, 10), color: colors.muted }}>{visible.length} documents · mock data</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 4, marginBottom: 8 }}>
              {([['all', 'ALL'], ['review', 'HUMAN REVIEW'], ['dupe', 'DUPLICATES'], ['ready', 'READY']] as const).map(([id, label]) => {
                const on = filter === id;
                return (
                  <Pressable key={id} onPress={() => setFilter(id)} style={{ borderRadius: 6, paddingVertical: 5, paddingHorizontal: 9, backgroundColor: on ? colors.gold : colors.card, borderWidth: on ? 0 : 1, borderColor: colors.cardBorder }}>
                    <Text style={{ ...fMono(600, 10, 0.03), color: on ? colors.ink : colors.textSecondary2 }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ gap: 8 }}>
              {visible.map((q) => {
                const s = stageOf(q);
                return (
                  <Pressable key={q.id} onPress={() => { setDocId(q.id); setEditing(null); setView('review'); }} style={{ ...card, paddingVertical: 12, paddingHorizontal: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <Text style={{ ...fSans(600, 12.5), color: colors.text, flex: 1 }} numberOfLines={1}>{q.vendor}</Text>
                      <Text style={{ ...fMono(600, 13), color: colors.text }}>
                        {'$' + q.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <StageBadge stage={s} />
                      <Text style={{ ...fSans(400, 10), color: colors.muted, flex: 1 }}>{q.channelIcon} {q.file}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.divider, overflow: 'hidden' }}>
                        <View style={{ height: '100%', borderRadius: 3, width: `${Math.round(q.overall * 100)}%`, backgroundColor: confColor(q.overall) }} />
                      </View>
                      <Text style={{ ...fMono(500, 9.5), color: confColor(q.overall) }}>
                        {q.processing ? 'extracting…' : 'conf ' + q.overall.toFixed(2)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
      )}

      {/* ── Review ── */}
      {view === 'review' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 14 }}>
          <View style={{ ...card, overflow: 'hidden' }}>
            <View style={{ backgroundColor: colors.sheetClose, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 13 }}>{d.channelIcon}</Text>
              <Text style={{ ...fSans(500, 11), color: colors.textSecondary, flex: 1 }} numberOfLines={1}>{d.source}</Text>
              <View style={{ backgroundColor: confColor(d.overall), borderRadius: 5, paddingVertical: 3, paddingHorizontal: 8 }}>
                <Text style={{ ...fMono(600, 10), color: '#fff' }}>overall {d.overall.toFixed(2)}</Text>
              </View>
            </View>
            <View style={{ paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <View style={{ width: 54, height: 70, backgroundColor: colors.appBg, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 6, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                <View style={{ width: 34, height: 3, backgroundColor: colors.sheetHandle, borderRadius: 2 }} />
                <View style={{ width: 34, height: 3, backgroundColor: colors.sheetHandle, borderRadius: 2 }} />
                <View style={{ width: 22, height: 3, backgroundColor: colors.sheetHandle, borderRadius: 2 }} />
                <Text style={{ ...fMono(600, 8), color: colors.faint, marginTop: 3 }}>PDF</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ ...fSans(600, 13.5), color: colors.text }}>{d.file}</Text>
                {!!d.docNote && (
                  <Text style={{ ...fSans(400, 10.5), lineHeight: 15.75, color: colors.muted, marginTop: 2 }}>{d.docNote}</Text>
                )}
              </View>
            </View>
          </View>

          {dupeOpen && (
            <View style={{ backgroundColor: colors.redBg, borderWidth: 1.5, borderColor: colors.redBorder, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 15 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={{ ...fSans(600, 11.5), color: colors.red, flex: 1 }}>Possible duplicate detected</Text>
                <Text style={{ ...fMono(500, 9.5), color: colors.red }}>conf {d.dupeConf}</Text>
              </View>
              <Text style={{ ...fSans(400, 11), lineHeight: 16.5, color: '#8a4a3c', marginTop: 4 }}>{d.dupeNote}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Pressable onPress={() => { setAccepted({ ...accepted, [d.id]: 'discarded' }); setView('queue'); }} style={{ flex: 1, backgroundColor: colors.red, borderRadius: 8, paddingVertical: 9, alignItems: 'center' }}>
                  <Text style={{ ...fSans(600, 11.5), color: '#fff' }}>Confirm duplicate — discard</Text>
                </Pressable>
                <Pressable onPress={() => setDupeResolved({ ...dupeResolved, [d.id]: 'new' })} style={{ flex: 1, borderWidth: 1.5, borderColor: colors.redBorder, backgroundColor: colors.card, borderRadius: 8, paddingVertical: 9, alignItems: 'center' }}>
                  <Text style={{ ...fSans(600, 11.5), color: colors.red }}>Not a duplicate</Text>
                </Pressable>
              </View>
            </View>
          )}

          <View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginHorizontal: 2, marginBottom: 8 }}>
              <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, flex: 1 }}>
                EXTRACTED FIELDS · TAP TO CORRECT
              </Text>
              <Text style={{ ...fSans(400, 9.5), color: colors.faint }}>low conf highlighted</Text>
            </View>
            <View style={{ ...card, paddingVertical: 4, paddingHorizontal: 14 }}>
              {d.fields.map((f, i) => {
                const corrected = corr[f.key];
                const isEditing = editing === f.key;
                const low = f.conf !== null && f.conf < REVIEW_THRESHOLD && !corrected;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => {
                      if (f.key !== 'expDate' && !isEditing) {
                        setEditing(f.key);
                        setDrafts({ ...drafts, [f.key]: corrected ?? f.val });
                      }
                    }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8,
                      borderBottomWidth: i === d.fields.length - 1 ? 0 : 1, borderBottomColor: colors.divider,
                      backgroundColor: low ? colors.amberBg : 'transparent',
                      marginHorizontal: low ? -14 : 0, paddingHorizontal: low ? 14 : 0,
                    }}
                  >
                    <Text style={{ ...fSans(500, 11), color: colors.textSecondary2, width: 96 }}>{f.label}</Text>
                    {isEditing ? (
                      <>
                        <TextInput
                          value={drafts[f.key] ?? ''}
                          onChangeText={(t) => setDrafts({ ...drafts, [f.key]: t })}
                          autoFocus
                          style={{ flex: 1, borderWidth: 1.5, borderColor: colors.green, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 8, ...fMono(500, 12), color: colors.text }}
                        />
                        <Pressable
                          onPress={() => {
                            setCorrections({ ...corrections, [d.id]: { ...corr, [f.key]: drafts[f.key] ?? '' } });
                            setEditing(null);
                          }}
                          style={{ backgroundColor: colors.green, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10 }}
                        >
                          <Text style={{ ...fSans(600, 10.5), color: '#fff' }}>Save</Text>
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <Text style={{ ...fMono(500, 12), color: colors.text, flex: 1 }} numberOfLines={1}>
                          {corrected ?? f.val}
                        </Text>
                        {!!corrected && (
                          <View style={{ backgroundColor: colors.greenBgLight, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5 }}>
                            <Text style={{ ...fSans(600, 8, 0.06), color: colors.green }}>CORRECTED</Text>
                          </View>
                        )}
                        <Text style={{ ...fMono(500, 9), minWidth: 34, textAlign: 'right', color: corrected ? colors.green : confColor(f.conf) }}>
                          {f.conf === null ? 'derived' : corrected ? 'user' : f.conf.toFixed(2)}
                        </Text>
                      </>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View>
            <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, marginHorizontal: 2, marginBottom: 8 }}>
              LINE ITEMS · {d.lineConf}
            </Text>
            <View style={{ ...card, paddingVertical: 4, paddingHorizontal: 14 }}>
              {d.lines.map(([desc, cat, amt], i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...fSans(500, 12), color: colors.text }}>{desc}</Text>
                    <Text style={{ ...fSans(400, 10), color: colors.muted, marginTop: 1 }}>{cat}</Text>
                  </View>
                  <Text style={{ ...fMono(600, 12), color: colors.text }}>{amt}</Text>
                </View>
              ))}
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 9 }}>
                <Text style={{ ...fSans(600, 11), color: colors.textSecondary2, flex: 1 }}>Line total vs subtotal</Text>
                <Text style={{ ...fMono(600, 11), color: d.sumOk || corr.sub ? colors.green : colors.red }}>
                  {d.sumOk || corr.sub ? '✓ matches' : '✗ off by $27.00 — correct subtotal or lines'}
                </Text>
              </View>
            </View>
          </View>

          <View style={{ ...card, paddingVertical: 13, paddingHorizontal: 15 }}>
            <Text style={{ ...fSans(600, 10, 0.12), color: colors.textSecondary2, marginBottom: 8 }}>WHAT HAPPENS NEXT</Text>
            <Text style={{ ...fSans(400, 11), lineHeight: 17.6, color: colors.textSecondary }}>
              {d.processing
                ? 'Extraction still running — fields shown are partial. Confirmation unlocks when it completes.'
                : dupeOpen
                  ? 'This document is frozen at the duplicate gate. Resolving the duplicate is the only way forward — AI will not decide for you.'
                  : 'Confirming creates the invoice as Received and routes it into the normal AP approval chain. AI never approves and never pays — those steps stay with your team, with full audit entries.'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Pressable
                onPress={() => { if (!acceptDisabled && !isConfirmed) setAccepted({ ...accepted, [d.id]: 'confirmed' }); }}
                style={{ flex: 1, borderRadius: 9, paddingVertical: 11, alignItems: 'center', backgroundColor: isConfirmed ? colors.greenBgLight : acceptDisabled ? colors.cardBorder : colors.green }}
              >
                <Text style={{ ...fSans(600, 12), color: isConfirmed ? colors.green : acceptDisabled ? colors.muted : '#fff' }}>
                  {acceptLabel}
                </Text>
              </Pressable>
              <Pressable style={{ borderWidth: 1.5, borderColor: colors.sheetHandle, backgroundColor: colors.card, borderRadius: 9, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center' }}>
                <Text style={{ ...fSans(600, 12), color: colors.textSecondary }}>Escalate</Text>
              </Pressable>
            </View>
            {isConfirmed && (
              <View style={{ flexDirection: 'row', gap: 9, alignItems: 'center', backgroundColor: colors.greenBgLight, borderWidth: 1, borderColor: '#bcd8ca', borderRadius: 9, paddingVertical: 10, paddingHorizontal: 12, marginTop: 10 }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 11 }}>✓</Text>
                </View>
                <Text style={{ ...fSans(500, 11), lineHeight: 16.5, color: colors.green, flex: 1 }}>
                  Invoice created as Received with {corrList.length} correction{corrList.length === 1 ? '' : 's'} stored. Audit: extraction snapshot + your edits + confirmation, all logged.
                </Text>
              </View>
            )}
          </View>

          {corrList.length > 0 && (
            <View style={{ backgroundColor: colors.sheetClose, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 15 }}>
              <Text style={{ ...fSans(600, 9.5, 0.1), color: colors.textSecondary2, marginBottom: 6 }}>
                LEARNING FROM YOUR CORRECTIONS
              </Text>
              {corrList.map(([k, v]) => {
                const f = d.fields.find((x) => x.key === k);
                return (
                  <Text key={k} style={{ ...fSans(400, 10.5), lineHeight: 16.3, color: colors.textSecondary, marginBottom: 4 }}>
                    {(f?.label ?? k) + ': "' + (f?.val ?? '') + '" → "' + v + '" — stored as a training signal for ' + d.vendor + '.'}
                  </Text>
                );
              })}
              <Text style={{ ...fSans(400, 9.5), lineHeight: 14.25, color: colors.muted, marginTop: 4 }}>
                Corrections are stored with the document and used to improve future extraction for this vendor. They never change past invoices.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Bottom tab bar */}
      <View style={{ backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.cardBorder, flexDirection: 'row', paddingTop: 6, paddingHorizontal: 8, paddingBottom: 4 }}>
        {([['queue', '◇', 'Queue'], ['channels', '⚙', 'Channels']] as const).map(([id, icon, label]) => {
          const active = id === 'queue' && view !== 'review' ? true : id === 'queue';
          return (
            <Pressable key={id} onPress={() => setView('queue')} style={{ flex: 1, paddingVertical: 6, alignItems: 'center' }}>
              <Text style={{ fontSize: 16, lineHeight: 16, color: id === 'queue' ? colors.green : colors.faint }}>{icon}</Text>
              <Text style={{ ...fSans(600, 9), color: id === 'queue' ? colors.green : colors.faint, marginTop: 3 }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
