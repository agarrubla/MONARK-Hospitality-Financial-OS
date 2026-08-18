/**
 * Health score — pixel-perfect port of "Monark Health Score.dc.html".
 * Explainable 0–100 from 11 weighted components, each tappable to formula +
 * source figures; drivers, risks, ranked actions. Deterministic: same
 * inputs, same score — nothing is a black box.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
  componentDefs, componentTrends, locationScores, rankedActions, riskAreas,
  scopeNames, scoreColor, scoreDrivers, type LocFilter,
} from '../data/healthScoreData';
import { colors, fMono, fSans } from '../theme/tokens';

const card = {
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.cardBorder,
  borderRadius: 12,
} as const;

const RING_CIRC = 282.7;

export default function HealthScoreScreen() {
  const [loc, setLoc] = useState<LocFilter>('all');
  const [sheetKey, setSheetKey] = useState<string | null>(null);

  const sc = locationScores[loc];
  const totalW = componentDefs.reduce((a, d) => a + d.w, 0);
  const score = Math.round(componentDefs.reduce((a, d) => a + (sc.vals[d.key] ?? 0) * d.w, 0) / totalW);
  const chg = score - sc.prev;
  const col = scoreColor(score);
  const sheetDef = sheetKey ? componentDefs.find((d) => d.key === sheetKey) : null;

  const scoreSummary =
    loc === 'mid' ? 'Labor and food cost are the drag; revenue itself is fine.'
    : loc === 'all' ? 'Profitability improved, but food cost and the September cash window pulled the score up only ' + (chg >= 0 ? '+' + chg : String(chg)) + '.'
    : loc === 'bkn' ? 'Strong trend; cash component limited by the missing deposit.'
    : 'Strongest unit; vendor inflation is the only soft spot.';

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg, overflow: 'hidden' }}>
      {/* Header */}
      <View style={{ backgroundColor: colors.ink, paddingTop: 14, paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ ...fMono(700, 15, 0.18), color: colors.appBg }}>HEALTH SCORE</Text>
          <Text style={{ ...fSans(500, 10), color: colors.headerMuted, marginTop: 1 }}>
            {scopeNames[loc]} · Aug 17, 9:41 AM
          </Text>
        </View>
        <View style={{ borderWidth: 1, borderColor: colors.gold, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5 }}>
          <Text style={{ ...fMono(600, 8.5, 0.1), color: colors.gold }}>MOCK DATA</Text>
        </View>
      </View>
      <View style={{ backgroundColor: colors.ink, paddingHorizontal: 14, paddingBottom: 12, flexDirection: 'row', gap: 4 }}>
        {([['all', 'ALL'], ['soho', 'SOHO'], ['mid', 'MID'], ['bkn', 'BKN']] as const).map(([id, label]) => {
          const on = loc === id;
          return (
            <Pressable key={id} onPress={() => { setLoc(id); setSheetKey(null); }} style={{ borderRadius: 6, paddingVertical: 5, paddingHorizontal: 9, backgroundColor: on ? colors.gold : colors.inkSecondary }}>
              <Text style={{ ...fMono(600, 10.5, 0.04), color: on ? colors.ink : colors.headerMuted }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 24, gap: 16 }}>
        {/* Score ring */}
        <View style={{ backgroundColor: colors.ink, borderRadius: 14, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <View style={{ width: 104, height: 104 }}>
            <Svg width={104} height={104} viewBox="0 0 104 104">
              <Circle cx={52} cy={52} r={45} fill="none" stroke={colors.ringTrack} strokeWidth={8} />
              <Circle
                cx={52} cy={52} r={45} fill="none"
                stroke={col} strokeWidth={8} strokeLinecap="round"
                strokeDasharray={`${((score / 100) * RING_CIRC).toFixed(1)} ${RING_CIRC}`}
                transform="rotate(-90 52 52)"
              />
            </Svg>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ ...fMono(700, 32), color: colors.appBg, lineHeight: 32 }}>{score}</Text>
              <Text style={{ ...fSans(600, 8, 0.12), color: colors.scoreSub }}>/ 100</Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ ...fSans(600, 15), color: colors.appBg }}>
              {score >= 78 ? 'Healthy' : score >= 60 ? 'Stable — watch costs' : 'Needs attention'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
              <Text style={{ ...fMono(500, 11), color: colors.headerMuted }}>prev {sc.prev}</Text>
              <Text style={{ ...fMono(600, 11), color: chg >= 0 ? colors.success : colors.scoreLow }}>
                {(chg >= 0 ? '▲ +' : '▼ ') + chg + ' this week'}
              </Text>
            </View>
            <Text style={{ ...fSans(400, 11), lineHeight: 16.5, color: colors.headerMuted, marginTop: 6 }}>{scoreSummary}</Text>
          </View>
        </View>

        {/* Components */}
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginHorizontal: 2, marginBottom: 8 }}>
            <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, flex: 1 }}>
              HOW THE SCORE IS BUILT · 11 COMPONENTS
            </Text>
            <Text style={{ ...fSans(400, 9.5), color: colors.faint }}>tap to trace</Text>
          </View>
          <View style={{ ...card, paddingVertical: 6, paddingHorizontal: 14 }}>
            {componentDefs.map((c) => {
              const v = sc.vals[c.key] ?? 0;
              const t = componentTrends[c.key] ?? 0;
              return (
                <Pressable key={c.key} onPress={() => setSheetKey(c.key)} style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={{ ...fSans(500, 11.5), color: colors.text, flex: 1 }}>{c.name}</Text>
                    <Text style={{ ...fMono(500, 9.5), color: t > 0 ? colors.green : t < 0 ? colors.red : colors.faint }}>
                      {t === 0 ? '—' : (t > 0 ? '▲' : '▼') + Math.abs(t)}
                    </Text>
                    <Text style={{ ...fMono(600, 12.5), minWidth: 28, textAlign: 'right', color: scoreColor(v) }}>{v}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 }}>
                    <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.divider, overflow: 'hidden' }}>
                      <View style={{ height: '100%', borderRadius: 3, width: `${v}%`, backgroundColor: scoreColor(v) }} />
                    </View>
                    <Text style={{ ...fMono(400, 9), color: colors.muted, width: 64, textAlign: 'right' }}>weight {c.w}%</Text>
                  </View>
                </Pressable>
              );
            })}
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 10 }}>
              <Text style={{ ...fSans(600, 12), color: colors.text, flex: 1 }}>Weighted total</Text>
              <Text style={{ ...fMono(700, 13), color: col }}>{score} / 100</Text>
            </View>
          </View>
        </View>

        {/* Drivers */}
        <View>
          <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, marginHorizontal: 2, marginBottom: 8 }}>
            MAIN DRIVERS · WHAT MOVED THE SCORE
          </Text>
          <View style={{ gap: 6 }}>
            {scoreDrivers.map((dr, i) => (
              <View key={i} style={{ ...card, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 13, flexDirection: 'row', gap: 9, alignItems: 'baseline' }}>
                <Text style={{ ...fMono(700, 13), minWidth: 26, color: dr.up ? colors.green : colors.red }}>{dr.delta}</Text>
                <Text style={{ ...fSans(400, 11), lineHeight: 16.5, color: colors.text, flex: 1 }}>{dr.text}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Risks */}
        <View>
          <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, marginHorizontal: 2, marginBottom: 8 }}>RISK AREAS</Text>
          <View style={{ gap: 6 }}>
            {riskAreas.map((r) => (
              <View key={r.title} style={{ backgroundColor: colors.card, borderWidth: 1.5, borderColor: r.border, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 13 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                  <Text style={{ ...fSans(600, 11.5), color: colors.text, flex: 1 }}>{r.title}</Text>
                  <Text style={{ ...fMono(600, 8.5, 0.05), color: r.c }}>{r.sev}</Text>
                </View>
                <Text style={{ ...fSans(400, 10.5), lineHeight: 15.75, color: colors.textSecondary2, marginTop: 3 }}>{r.note}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Ranked actions */}
        <View>
          <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, marginHorizontal: 2, marginBottom: 8 }}>
            RECOMMENDED ACTIONS · RANKED BY SCORE IMPACT
          </Text>
          <View style={{ ...card, paddingVertical: 4, paddingHorizontal: 14 }}>
            {rankedActions.map((a, i) => (
              <View key={a.n} style={{ flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: i === rankedActions.length - 1 ? 0 : 1, borderBottomColor: colors.divider }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                  <Text style={{ ...fMono(700, 10), color: colors.gold }}>{a.n}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...fSans(600, 11.5), color: colors.text }}>{a.title}</Text>
                  <Text style={{ ...fSans(400, 10.5), lineHeight: 15.75, color: colors.textSecondary2, marginTop: 2 }}>{a.note}</Text>
                </View>
                <Text style={{ ...fMono(600, 11), color: colors.green }}>{a.pts}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={{ ...fSans(400, 10), lineHeight: 15, color: colors.faint, paddingHorizontal: 2 }}>
          The score is deterministic: same inputs, same score. Every component traces to the transactions behind it — nothing is a black box.
        </Text>
      </ScrollView>

      {/* Component trace sheet */}
      {sheetDef && (
        <>
          <Pressable
            onPress={() => setSheetKey(null)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim, zIndex: 10 }}
          />
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 11, backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 14, paddingHorizontal: 18, paddingBottom: 26, maxHeight: '66%' }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.sheetHandle, alignSelf: 'center', marginBottom: 12 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <Text style={{ ...fSans(600, 15), color: colors.text, flex: 1 }}>
                {sheetDef.name} · {sc.vals[sheetDef.key]}/100
              </Text>
              <View style={{ borderWidth: 1, borderColor: colors.mockBorder, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5 }}>
                <Text style={{ ...fMono(600, 8, 0.1), color: colors.mockText }}>MOCK</Text>
              </View>
              <Pressable onPress={() => setSheetKey(null)} style={{ backgroundColor: colors.sheetClose, borderRadius: 13, width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>✕</Text>
              </Pressable>
            </View>
            <Text style={{ ...fSans(400, 11), lineHeight: 16.5, color: colors.muted, marginBottom: 10 }}>
              Formula: {sheetDef.form} · weight {sheetDef.w}%
            </Text>
            <ScrollView>
              {sheetDef.rows.map(([label, trace, val], i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...fSans(500, 12), color: colors.text }}>{label}</Text>
                    {!!trace && <Text style={{ ...fMono(400, 9.5), color: colors.faint, marginTop: 1 }}>{trace}</Text>}
                  </View>
                  <Text style={{ ...fMono(600, 12.5), color: colors.text, minWidth: 70, textAlign: 'right' }}>{val}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </>
      )}
    </View>
  );
}
