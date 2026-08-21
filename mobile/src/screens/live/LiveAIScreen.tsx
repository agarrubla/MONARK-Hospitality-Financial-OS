/**
 * AI — pregúntale a tus números. El asistente responde SOLO con base en los
 * datos reales del negocio (snapshot del servidor); nunca aprueba, paga ni
 * modifica nada.
 */
import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { card, Header, SectionLabel } from '../../components/ui';
import { useStore } from '../../store/store';
import { colors, fSans } from '../../theme/tokens';

const SUGERENCIAS = [
  '¿Cómo va el mes?',
  '¿Cuánto le debo a proveedores?',
  '¿Cuál fue mi mejor día de ventas?',
  '¿Qué alertas tengo abiertas?',
];

interface Turn { q: string; a: string }

export default function LiveAIScreen() {
  const { askAI } = useStore();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const ask = (q: string) => {
    const text = q.trim();
    if (!text || thinking) return;
    setQuestion('');
    setThinking(true);
    askAI(text, turns)
      .then((answer) => setTurns((t) => [...t, { q: text, a: answer }]))
      .catch((err: Error) => setTurns((t) => [...t, { q: text, a: `⚠ ${err.message}` }]))
      .finally(() => {
        setThinking(false);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg }}>
      <Header title="AI · ANALISTA" sub="Pregúntale a tus números · la IA solo lee" />
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: 16, gap: 10 }}>
        {turns.length === 0 && (
          <>
            <View style={{ backgroundColor: colors.ink, borderRadius: 14, padding: 16 }}>
              <Text style={{ ...fSans(600, 9.5, 0.14), color: colors.gold, marginBottom: 8 }}>TU ANALISTA FINANCIERO</Text>
              <Text style={{ ...fSans(400, 12), lineHeight: 18, color: '#c7d4cd' }}>
                Pregunta lo que quieras sobre tus ventas, gastos, facturas, caja y alertas. Respondo solo con tus datos reales — y no puedo aprobar ni pagar nada: eso siempre lo decides tú.
              </Text>
            </View>
            <SectionLabel>PRUEBA CON</SectionLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {SUGERENCIAS.map((s) => (
                <Pressable key={s} onPress={() => ask(s)} style={{ borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder }}>
                  <Text style={{ ...fSans(500, 11.5), color: colors.textSecondary2 }}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {turns.map((t, i) => (
          <View key={i} style={{ gap: 8 }}>
            <View style={{ alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: colors.ink, borderRadius: 12, borderBottomRightRadius: 3, paddingVertical: 9, paddingHorizontal: 13 }}>
              <Text style={{ ...fSans(500, 12.5), lineHeight: 18, color: '#e8efe9' }}>{t.q}</Text>
            </View>
            <View style={{ alignSelf: 'flex-start', maxWidth: '92%', ...card, paddingVertical: 11, paddingHorizontal: 13 }}>
              <Text style={{ ...fSans(400, 12.5), lineHeight: 19, color: colors.text }}>{t.a}</Text>
            </View>
          </View>
        ))}
        {thinking && (
          <View style={{ alignSelf: 'flex-start', ...card, paddingVertical: 11, paddingHorizontal: 13 }}>
            <Text style={{ ...fSans(400, 12.5), color: colors.muted }}>Analizando tus números…</Text>
          </View>
        )}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.card }}>
        <TextInput
          value={question}
          onChangeText={setQuestion}
          placeholder="Pregunta sobre tus finanzas…"
          placeholderTextColor={colors.faint}
          onSubmitEditing={() => ask(question)}
          style={{ flex: 1, borderWidth: 1, borderColor: colors.sheetHandle, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, ...fSans(400, 13), color: colors.text, backgroundColor: colors.appBg }}
        />
        <Pressable
          onPress={() => ask(question)}
          disabled={thinking || !question.trim()}
          style={{ borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: thinking || !question.trim() ? colors.sheetHandle : colors.green }}
        >
          <Text style={{ ...fSans(600, 13), color: '#fff' }}>{thinking ? '…' : '→'}</Text>
        </Pressable>
      </View>
    </View>
  );
}
