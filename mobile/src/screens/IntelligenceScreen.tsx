/**
 * Proactive alerts — pixel-perfect port of "Monark Intelligence.dc.html".
 * 12 detector classes; alerts with severity, financial impact, reason,
 * supporting data (traced), recommended action; investigate/acknowledge/
 * dismiss. Read-only intelligence — never changes financial records.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { intelAlerts, sevMeta, type Severity } from '../data/intelligenceData';
import { colors, fMono, fSans } from '../theme/tokens';

type Decision = 'investigate' | 'ack' | 'dismiss';

const card = {
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.cardBorder,
  borderRadius: 12,
} as const;

export default function IntelligenceScreen() {
  const [view, setView] = useState<'feed' | 'detail'>('feed');
  const [alertId, setAlertId] = useState<string | null>(null);
  const [sevFilter, setSevFilter] = useState<'all' | Severity>('all');
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});

  const visible = intelAlerts.filter((a) => {
    if (decisions[a.id] === 'dismiss') return false;
    return sevFilter === 'all' || a.sev === sevFilter;
  });
  const counts: Record<Severity, number> = { critical: 0, warning: 0, info: 0 };
  intelAlerts.forEach((a) => {
    if (decisions[a.id] !== 'dismiss') counts[a.sev]++;
  });

  const d = intelAlerts.find((a) => a.id === alertId) ?? intelAlerts[0];
  const [dc, dbg] = sevMeta[d.sev];
  const dec = decisions[d.id];

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg, overflow: 'hidden' }}>
      {/* Header */}
      <View style={{ backgroundColor: colors.ink, paddingTop: 14, paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {view === 'detail' && (
          <Pressable onPress={() => setView('feed')} style={{ backgroundColor: colors.inkSecondary, borderRadius: 8, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.gold, fontSize: 15 }}>‹</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ ...fMono(700, 15, 0.18), color: colors.appBg }} numberOfLines={1}>
            {view === 'feed' ? 'INTELLIGENCE' : 'ALERT'}
          </Text>
          <Text style={{ ...fSans(500, 10), color: colors.headerMuted, marginTop: 1 }} numberOfLines={1}>
            {view === 'feed' ? 'Proactive detectors · 12 classes · ran 6:10 AM' : d.kind + ' · ' + d.when}
          </Text>
        </View>
        <View style={{ borderWidth: 1, borderColor: colors.gold, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5 }}>
          <Text style={{ ...fMono(600, 8.5, 0.1), color: colors.gold }}>MOCK DATA</Text>
        </View>
      </View>

      {/* ── Feed ── */}
      {view === 'feed' && (
        <>
          <View style={{ backgroundColor: colors.ink, paddingHorizontal: 14, paddingBottom: 12, flexDirection: 'row', gap: 4 }}>
            {([['all', 'ALL'], ['critical', 'CRITICAL'], ['warning', 'WARNING'], ['info', 'INFO']] as const).map(([id, label]) => {
              const on = sevFilter === id;
              return (
                <Pressable key={id} onPress={() => setSevFilter(id)} style={{ borderRadius: 6, paddingVertical: 5, paddingHorizontal: 10, backgroundColor: on ? colors.gold : colors.inkSecondary }}>
                  <Text style={{ ...fMono(600, 10, 0.03), color: on ? colors.ink : colors.headerMuted }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([['critical', 'CRITICAL', '#b3402e'], ['warning', 'WARNING', '#b07c1e'], ['info', 'INFO', '#4a6b8a']] as const).map(([key, label, c]) => (
                <View key={key} style={{ ...card, flex: 1, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center' }}>
                  <Text style={{ ...fMono(600, 17), color: c }}>{counts[key]}</Text>
                  <Text style={{ ...fSans(500, 8.5), color: colors.textSecondary2, marginTop: 2 }}>{label}</Text>
                </View>
              ))}
            </View>
            <View style={{ gap: 8 }}>
              {visible.map((a) => {
                const [c, bg] = sevMeta[a.sev];
                const aDec = decisions[a.id];
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => { setAlertId(a.id); setView('detail'); }}
                    style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: !aDec && a.sev === 'critical' ? colors.redBorder : colors.cardBorder, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, opacity: aDec === 'ack' ? 0.65 : 1 }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: c }} />
                      <Text style={{ ...fSans(600, 12), color: colors.text, flex: 1 }}>{a.title}</Text>
                      <Text style={{ ...fMono(600, 11.5), color: c }}>{a.impact}</Text>
                    </View>
                    <Text style={{ ...fSans(400, 10.5), lineHeight: 15.75, color: colors.textSecondary2, marginTop: 4 }}>
                      {a.reason.split('. ')[0] + '.'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 }}>
                      <View style={{ backgroundColor: bg, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 6 }}>
                        <Text style={{ ...fSans(600, 7.5, 0.06), color: c }}>{a.kind.toUpperCase()}</Text>
                      </View>
                      <Text style={{ ...fSans(400, 9.5), color: colors.muted, flex: 1 }}>
                        {a.when} · conf {a.conf.toFixed(2)}
                      </Text>
                      {!!aDec && (
                        <Text style={{ ...fMono(600, 8, 0.05), color: aDec === 'ack' ? colors.textSecondary : colors.green }}>
                          {aDec === 'ack' ? 'ACKNOWLEDGED' : 'INVESTIGATING'}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </>
      )}

      {/* ── Detail ── */}
      {view === 'detail' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 20, gap: 14 }}>
          <View style={{ ...card, paddingVertical: 15, paddingHorizontal: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ backgroundColor: dc, borderRadius: 4, paddingVertical: 3, paddingHorizontal: 7 }}>
                <Text style={{ ...fSans(600, 8.5, 0.06), color: '#fff' }}>{d.sev.toUpperCase()}</Text>
              </View>
              <View style={{ backgroundColor: dbg, borderRadius: 4, paddingVertical: 3, paddingHorizontal: 7 }}>
                <Text style={{ ...fSans(600, 8, 0.06), color: dc }}>{d.kind.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }} />
              <Text style={{ ...fMono(500, 9.5), color: colors.muted }}>conf {d.conf.toFixed(2)}</Text>
            </View>
            <Text style={{ ...fSans(600, 15), lineHeight: 19.5, color: colors.text, marginTop: 10 }}>{d.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
              <Text style={{ ...fMono(700, 22, -0.02), color: colors.red }}>{d.impact}</Text>
              <Text style={{ ...fSans(400, 10.5), color: colors.muted }}>{d.impactNote}</Text>
            </View>
          </View>

          <View style={{ ...card, paddingVertical: 13, paddingHorizontal: 15 }}>
            <Text style={{ ...fSans(600, 10, 0.12), color: colors.textSecondary2, marginBottom: 6 }}>REASON</Text>
            <Text style={{ ...fSans(400, 11.5), lineHeight: 18.4, color: colors.text }}>{d.reason}</Text>
          </View>

          <View>
            <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, marginHorizontal: 2, marginBottom: 8 }}>SUPPORTING DATA</Text>
            <View style={{ ...card, paddingVertical: 4, paddingHorizontal: 14 }}>
              {d.data.map(([label, trace, val], i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 8.5, borderBottomWidth: i === d.data.length - 1 ? 0 : 1, borderBottomColor: colors.divider }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...fSans(500, 11.5), color: colors.text }}>{label}</Text>
                    {!!trace && <Text style={{ ...fMono(400, 9), color: colors.faint, marginTop: 1 }}>{trace}</Text>}
                  </View>
                  <Text style={{ ...fMono(600, 12), color: colors.text, minWidth: 70, textAlign: 'right' }}>{val}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={{ backgroundColor: colors.greenBgLight, borderWidth: 1, borderColor: '#bcd8ca', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 15 }}>
            <Text style={{ ...fSans(600, 10, 0.12), color: colors.green, marginBottom: 6 }}>RECOMMENDED ACTION</Text>
            <Text style={{ ...fSans(400, 11.5), lineHeight: 18.4, color: colors.green }}>{d.action}</Text>
          </View>

          {!dec && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setDecisions({ ...decisions, [d.id]: 'investigate' })} style={{ flex: 1, backgroundColor: colors.green, borderRadius: 9, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ ...fSans(600, 12), color: '#fff' }}>Investigate</Text>
              </Pressable>
              <Pressable onPress={() => setDecisions({ ...decisions, [d.id]: 'ack' })} style={{ flex: 1, borderWidth: 1.5, borderColor: colors.sheetHandle, backgroundColor: colors.card, borderRadius: 9, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ ...fSans(600, 12), color: colors.textSecondary }}>Acknowledge</Text>
              </Pressable>
              <Pressable onPress={() => { setDecisions({ ...decisions, [d.id]: 'dismiss' }); setView('feed'); }} style={{ borderWidth: 1.5, borderColor: colors.sheetHandle, backgroundColor: colors.card, borderRadius: 9, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center' }}>
                <Text style={{ ...fSans(600, 12), color: colors.muted }}>Dismiss</Text>
              </Pressable>
            </View>
          )}

          {!!dec && dec !== 'dismiss' && (
            <View style={{ paddingVertical: 10, paddingHorizontal: 13, borderRadius: 9, backgroundColor: dec === 'investigate' ? colors.greenBgLight : colors.sheetClose }}>
              <Text style={{ ...fSans(500, 11), lineHeight: 16.5, color: dec === 'investigate' ? colors.green : colors.textSecondary }}>
                {dec === 'investigate'
                  ? '→ Marked investigating. Linked records opened; the alert stays pinned until resolved.'
                  : '✓ Acknowledged. The alert dims in the feed and re-fires only if the underlying metric worsens by 20%+.'}
              </Text>
            </View>
          )}

          <Text style={{ ...fSans(400, 10), lineHeight: 15, color: colors.faint, paddingHorizontal: 2 }}>
            Alerts are read-only intelligence — they never change financial records. Every decision here is audit-logged with the evidence snapshot.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}
