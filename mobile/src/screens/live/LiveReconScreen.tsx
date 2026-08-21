/**
 * Conciliar — el dinero se persigue hasta el banco. Depósitos esperados del
 * POS (tarjetas T+2, efectivo T+3) contra abonos reales, y cruces de pagos
 * que el motor no resolvió solo. Confirmar un cruce nunca crea ingresos ni
 * gastos: solo une la evidencia.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { card, EmptyState, Header, PrimaryButton, SectionLabel } from '../../components/ui';
import { money, useStore } from '../../store/store';
import { colors, fMono, fSans } from '../../theme/tokens';

const STATUS: Record<string, [string, string, string]> = {
  expected: ['ESPERADO', '#8a6d1a', '#f6efdc'],
  matched: ['CONCILIADO', '#14584a', '#eaf3ee'],
  variance: ['DIFERENCIA', '#8a2f22', '#f6e9e7'],
  missing: ['FALTANTE', '#8a2f22', '#f6e9e7'],
};

export default function LiveReconScreen() {
  const { data, confirmDepositGroup, confirmPaymentMatch, busy, lastError } = useStore();
  const [view, setView] = useState<'deposits' | 'payments'>('deposits');
  const hasBank = data.bankAccounts.length > 0;

  const typeLabel = (t: string) => (t === 'card_batch' ? 'Tarjetas' : 'Efectivo');
  const singles = data.matchCandidates.filter((c) => c.candidateCount === 1);
  const ambiguous = data.matchCandidates.filter((c) => c.candidateCount > 1);

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg }}>
      <Header title="RECONCILIATION" sub="El dinero se persigue hasta el banco" />

      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 12 }}>
        {([['deposits', 'Depósitos'], ['payments', 'Pagos']] as const).map(([id, label]) => {
          const on = view === id;
          return (
            <Pressable key={id} onPress={() => setView(id)} style={{ borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: on ? colors.ink : colors.card, borderWidth: on ? 0 : 1, borderColor: colors.cardBorder }}>
              <Text style={{ ...fSans(600, 11.5), color: on ? colors.gold : colors.textSecondary2 }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 8 }}>
        {!hasBank && (
          <View style={{ backgroundColor: colors.ink, borderRadius: 12, padding: 14, marginBottom: 4 }}>
            <Text style={{ ...fSans(400, 11.5), lineHeight: 17, color: '#c7d4cd' }}>
              Aún no hay banco conectado: aquí se ve lo que el sistema ESPERA que llegue. Cuando conectes tu banco, cada fila se cruzará con el abono o débito real.
            </Text>
          </View>
        )}
        {!!lastError && (
          <Text style={{ ...fSans(500, 11), lineHeight: 16.5, color: colors.red }}>{lastError}</Text>
        )}

        {view === 'deposits' && data.depositSuggestions.length > 0 && (
          <>
            <SectionLabel>CRUCES SUGERIDOS · CONFIRMA TÚ</SectionLabel>
            {data.depositSuggestions.map((sg) => (
              <View key={sg.bankTransactionId} style={{ ...card, paddingVertical: 12, paddingHorizontal: 14, borderColor: '#bcd3c9', borderWidth: 1.5 }}>
                <Text style={{ ...fSans(600, 12.5), color: colors.text }}>
                  Abono {money(sg.amount)} · llegó {sg.postedAt}
                </Text>
                <Text style={{ ...fSans(400, 10.5), color: colors.muted, marginTop: 3 }}>
                  cubre {sg.depositIds.length === 1 ? `las ${sg.type === 'card_batch' ? 'tarjetas' : 'efectivo'} de ${sg.coversFrom}` : `${sg.depositIds.length} días de ${sg.type === 'card_batch' ? 'tarjetas' : 'efectivo'} (${sg.coversFrom} → ${sg.coversTo})`} · suma exacta al centavo
                </Text>
                <View style={{ marginTop: 10 }}>
                  <PrimaryButton
                    label="Confirmar cruce"
                    disabled={busy}
                    onPress={() => { void confirmDepositGroup(sg.depositIds, sg.bankTransactionId).catch(() => {}); }}
                  />
                </View>
              </View>
            ))}
          </>
        )}

        {view === 'deposits' && (
          data.deposits.length === 0 ? (
            <EmptyState
              icon="⇄"
              title="Sin depósitos esperados"
              body="Cuando entren ventas del POS, aquí aparecerá cuánto debe llegarte al banco: tarjetas ~2 días después, efectivo ~3."
            />
          ) : (
            data.deposits.map((d) => {
              const [label, color, bg] = STATUS[d.status] ?? STATUS.expected!;
              return (
                <View key={d.id} style={{ ...card, paddingVertical: 12, paddingHorizontal: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ ...fSans(600, 12.5), color: colors.text, flex: 1 }}>
                      {typeLabel(d.type)} · ventas {d.coversFrom}
                    </Text>
                    <View style={{ backgroundColor: bg, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ ...fSans(600, 8.5, 0.08), color }}>{label}</Text>
                    </View>
                  </View>
                  <Text style={{ ...fSans(400, 10.5), color: colors.muted, marginTop: 3 }}>
                    esperado {money(d.expectedAmount)} · llega ~{d.expectedOn}
                    {d.actualAmount != null ? ` · llegó ${money(d.actualAmount)}` : ''}
                    {d.variance != null && d.variance !== 0 ? ` · diferencia ${money(d.variance)}` : ''}
                  </Text>

                </View>
              );
            })
          )
        )}

        {view === 'payments' && (
          data.matchCandidates.length === 0 ? (
            <EmptyState
              icon="⇄"
              title="Nada pendiente de cruzar"
              body="Los pagos que coinciden exactamente con un débito del banco se concilian solos. Aquí solo aparece lo que necesita tu decisión."
            />
          ) : (
            <>
              {singles.map((c) => (
                <View key={c.paymentId + c.bankTransactionId} style={{ ...card, paddingVertical: 12, paddingHorizontal: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={{ ...fSans(600, 12.5), color: colors.text, flex: 1 }} numberOfLines={1}>
                      {c.vendorName ?? 'Pago'} {c.invoiceNumber ? `· ${c.invoiceNumber}` : ''}
                    </Text>
                    <Text style={{ ...fMono(600, 13), color: colors.text }}>{money(c.amount)}</Text>
                  </View>
                  <Text style={{ ...fSans(400, 10.5), color: colors.muted, marginTop: 3 }}>
                    banco: “{c.description}” · {c.postedAt} · pago registrado {c.paymentDate}
                  </Text>
                  <View style={{ marginTop: 10 }}>
                    <PrimaryButton
                      label="Confirmar cruce"
                      disabled={busy}
                      onPress={() => { void confirmPaymentMatch(c.paymentId, c.bankTransactionId).catch(() => {}); }}
                    />
                  </View>
                </View>
              ))}
              {ambiguous.length > 0 && (
                <>
                  <SectionLabel>AMBIGUOS · REVISA CON CUIDADO</SectionLabel>
                  {ambiguous.map((c) => (
                    <View key={c.paymentId + c.bankTransactionId} style={{ ...card, paddingVertical: 12, paddingHorizontal: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                        <Text style={{ ...fSans(600, 12.5), color: colors.text, flex: 1 }} numberOfLines={1}>
                          {c.vendorName ?? 'Pago'} {c.invoiceNumber ? `· ${c.invoiceNumber}` : ''}
                        </Text>
                        <Text style={{ ...fMono(600, 13), color: colors.text }}>{money(c.amount)}</Text>
                      </View>
                      <Text style={{ ...fSans(400, 10.5), color: colors.muted, marginTop: 3 }}>
                        banco: “{c.description}” · {c.postedAt} · hay {c.candidateCount} pagos posibles del mismo monto
                      </Text>
                      <View style={{ marginTop: 10 }}>
                        <PrimaryButton
                          label="Confirmar este cruce"
                          disabled={busy}
                          onPress={() => { void confirmPaymentMatch(c.paymentId, c.bankTransactionId).catch(() => {}); }}
                        />
                      </View>
                    </View>
                  ))}
                </>
              )}
            </>
          )
        )}
      </ScrollView>
    </View>
  );
}
