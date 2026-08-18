/**
 * AI assistant — pixel-perfect port of "Monark Financial AI.dc.html".
 * Chat answering owner questions from authorized data only; every answer
 * shows period, sources, confidence; refuses out-of-scope; incomplete-data
 * warnings.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  aiAnswers, aiFallback, confColor, suggestedQuestions,
  type AIAnswer,
} from '../data/financialAiData';
import { colors, fMono, fSans } from '../theme/tokens';

type ChatMessage = { user: string } | { ai: Omit<AIAnswer, 'match' | 'think'> };

const THINKING_DELAY_MS = 900;

const card = {
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.cardBorder,
} as const;

function Avatar({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.33, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ ...fMono(700, size * 0.45), color: colors.gold }}>M</Text>
    </View>
  );
}

function ThinkingDot({ delay }: { delay: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const iv = setInterval(() => setVisible((v) => !v), 367 + delay * 0.2);
    return () => clearInterval(iv);
  }, [delay]);
  return <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.muted, opacity: visible ? 1 : 0.25 }} />;
}

export default function FinancialAIScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [thinkingNote, setThinkingNote] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages, thinking]);

  const ask = (text: string) => {
    if (thinking || !text.trim()) return;
    const q = text.toLowerCase();
    const a = aiAnswers.find((x) => x.match.some((m) => q.includes(m))) ?? { ...aiFallback, think: 'Checking your data…' };
    setMessages((prev) => [...prev, { user: text }]);
    setDraft('');
    setThinking(true);
    setThinkingNote('think' in a && a.think ? a.think : 'Checking your data…');
    setTimeout(() => {
      setMessages((prev) => [...prev, { ai: a }]);
      setThinking(false);
    }, THINKING_DELAY_MS);
  };

  const asked = messages.filter((m): m is { user: string } => 'user' in m).map((m) => m.user);
  const suggestions = suggestedQuestions.filter((s) => !asked.includes(s)).slice(0, 6);

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg, overflow: 'hidden' }}>
      {/* Header */}
      <View style={{ backgroundColor: colors.ink, paddingTop: 14, paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: colors.inkSecondary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ ...fMono(700, 13), color: colors.gold }}>M</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ ...fMono(700, 15, 0.18), color: colors.appBg }}>FINANCIAL AI</Text>
          <Text style={{ ...fSans(500, 10), color: colors.headerMuted, marginTop: 1 }}>
            Vela Group · all locations · answers only from Monark data
          </Text>
        </View>
        <View style={{ borderWidth: 1, borderColor: colors.gold, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5 }}>
          <Text style={{ ...fMono(600, 8.5, 0.1), color: colors.gold }}>MOCK DATA</Text>
        </View>
      </View>

      {/* Chat */}
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 10, gap: 12 }}>
        <View style={{ backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 15 }}>
          <Text style={{ ...fSans(600, 9, 0.12), color: colors.gold, marginBottom: 6 }}>GROUND RULES</Text>
          <Text style={{ ...fSans(400, 10.5), lineHeight: 16.3, color: '#c7d4cd' }}>
            I answer only from your authorized Monark data — POS sales, invoices, payments, bank feeds. I never invent numbers, I say when data is incomplete, and every figure links to its source transactions.
          </Text>
        </View>

        {messages.map((m, i) =>
          'user' in m ? (
            <View key={i} style={{ alignItems: 'flex-end' }}>
              <View style={{ maxWidth: '80%', backgroundColor: colors.green, borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: 14, borderBottomRightRadius: 4, paddingVertical: 10, paddingHorizontal: 14 }}>
                <Text style={{ ...fSans(400, 12.5), lineHeight: 18.75, color: '#fff' }}>{m.user}</Text>
              </View>
            </View>
          ) : (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ marginTop: 2 }}>
                <Avatar size={24} />
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                <View style={{ ...card, borderTopLeftRadius: 4, borderTopRightRadius: 14, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, paddingVertical: 11, paddingHorizontal: 14 }}>
                  <Text style={{ ...fSans(400, 12), lineHeight: 19.2, color: colors.text }}>{m.ai.text}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.divider }}>
                    <View style={{ backgroundColor: colors.sheetClose, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 6 }}>
                      <Text style={{ ...fMono(500, 8.5), color: colors.muted }}>{m.ai.period}</Text>
                    </View>
                    <View style={{ backgroundColor: colors.sheetClose, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 6 }}>
                      <Text style={{ ...fMono(500, 8.5), color: colors.muted }}>{m.ai.sources}</Text>
                    </View>
                    <View style={{ backgroundColor: confColor(m.ai.conf), borderRadius: 3, paddingVertical: 2, paddingHorizontal: 6 }}>
                      <Text style={{ ...fMono(600, 8.5), color: '#fff' }}>conf {m.ai.conf.toFixed(2)}</Text>
                    </View>
                  </View>
                </View>

                {!!m.ai.rows && (
                  <View style={{ ...card, borderRadius: 12, paddingVertical: 4, paddingHorizontal: 14 }}>
                    {m.ai.rows.map((r, j) => (
                      <View
                        key={j}
                        style={{
                          flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 8.5,
                          borderBottomWidth: j === m.ai.rows!.length - 1 ? 0 : 1, borderBottomColor: colors.divider,
                          borderTopWidth: r.top ? 1.5 : 0, borderTopColor: colors.text,
                        }}
                      >
                        <Text style={{ ...fSans(r.strong ? 600 : 500, 11.5), color: colors.text, flex: 1 }}>{r.label}</Text>
                        {!!r.sub && <Text style={{ ...fSans(400, 9.5), color: colors.muted }}>{r.sub}</Text>}
                        <Text style={{ ...fMono(600, 12), color: r.color ?? colors.text, minWidth: 70, textAlign: 'right' }}>{r.val}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {!!m.ai.warn && (
                  <View style={{ backgroundColor: colors.amberBg, borderWidth: 1, borderColor: colors.amberBorder, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, flexDirection: 'row', gap: 8 }}>
                    <Text style={{ fontSize: 11 }}>⚠︎</Text>
                    <Text style={{ ...fSans(400, 10.5), lineHeight: 15.75, color: '#7a5c26', flex: 1 }}>{m.ai.warn}</Text>
                  </View>
                )}

                {!!m.ai.links && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                    {m.ai.links.map((l) => (
                      <Pressable key={l} style={{ backgroundColor: colors.greenBgLight, borderWidth: 1, borderColor: '#bcd8ca', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 9 }}>
                        <Text style={{ ...fSans(600, 9.5), color: colors.green }}>{l} ›</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </View>
          ),
        )}

        {thinking && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ marginTop: 2 }}>
              <Avatar size={24} />
            </View>
            <View style={{ ...card, borderTopLeftRadius: 4, borderTopRightRadius: 14, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', gap: 4, alignItems: 'center', alignSelf: 'flex-start' }}>
              <ThinkingDot delay={0} />
              <ThinkingDot delay={1} />
              <ThinkingDot delay={2} />
              <Text style={{ ...fSans(400, 10), color: colors.muted, marginLeft: 6 }}>{thinkingNote}</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Suggestions */}
      <View style={{ paddingTop: 8, paddingHorizontal: 14, paddingBottom: 4 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, paddingBottom: 6 }}>
          {suggestions.map((label) => (
            <Pressable key={label} onPress={() => ask(label)} style={{ borderWidth: 1, borderColor: colors.sheetHandle, backgroundColor: colors.card, borderRadius: 14, paddingVertical: 7, paddingHorizontal: 12 }}>
              <Text style={{ ...fSans(500, 10.5), color: '#44525f' }}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Composer */}
      <View style={{ backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingTop: 10, paddingHorizontal: 14, paddingBottom: 8, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => ask(draft.trim())}
          placeholder="Ask about your finances…"
          placeholderTextColor={colors.muted}
          style={{ flex: 1, borderWidth: 1, borderColor: colors.sheetHandle, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14, ...fSans(400, 12.5), color: colors.text, backgroundColor: '#f9f8f4' }}
        />
        <Pressable onPress={() => ask(draft.trim())} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 15 }}>↑</Text>
        </Pressable>
      </View>
    </View>
  );
}
