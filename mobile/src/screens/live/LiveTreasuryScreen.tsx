/**
 * Live treasury — pays the user's approved invoices. Recording a payment
 * creates THE cash event: it hits the cash flow of the payment's month and
 * never re-books the expense.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  card, ChoiceChips, EmptyState, Field, Header, PrimaryButton, SectionLabel,
} from '../../components/ui';
import {
  invoiceTotal, money, monthLabel, monthOf, todayISO, useStore, type Payment,
} from '../../store/store';
import { colors, fMono, fSans } from '../../theme/tokens';

export default function LiveTreasuryScreen() {
  const { data, setInvoiceStatus, recordPayment } = useStore();
  const [view, setView] = useState<'ready' | 'pay' | 'history'>('ready');
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payDate, setPayDate] = useState(todayISO());
  const [method, setMethod] = useState<Payment['method']>('ach');
  const [ref, setRef] = useState('');

  const ready = data.invoices.filter((i) => i.status === 'approved' || i.status === 'scheduled');
  const paying = data.invoices.find((i) => i.id === payingId);
  const vendorName = (id: string) => data.vendors.find((v) => v.id === id)?.name ?? '—';

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg }}>
      <Header
        title={view === 'pay' ? 'REGISTRAR PAGO' : view === 'history' ? 'HISTORIAL DE PAGOS' : 'TREASURY'}
        sub={view === 'pay' && paying ? `${paying.number} · ${vendorName(paying.vendorId)}` : 'Pagos reales · la caja vive aquí'}
        onBack={view === 'pay' ? () => setView('ready') : undefined}
      />

      {view !== 'pay' && (
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 12 }}>
          {([['ready', 'Por pagar'], ['history', 'Historial']] as const).map(([id, label]) => {
            const on = view === id;
            return (
              <Pressable key={id} onPress={() => setView(id)} style={{ borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: on ? colors.ink : colors.card, borderWidth: on ? 0 : 1, borderColor: colors.cardBorder }}>
                <Text style={{ ...fSans(600, 11.5), color: on ? colors.gold : colors.textSecondary2 }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {view === 'ready' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 8 }}>
          {ready.length === 0 ? (
            <EmptyState
              icon="⏷"
              title="Nada listo para pagar"
              body="Aquí aparecen las facturas aprobadas en AP. Apruébalas primero — solo lo aprobado puede pagarse."
            />
          ) : (
            ready.map((i) => (
              <View key={i.id} style={{ ...card, paddingVertical: 12, paddingHorizontal: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                  <Text style={{ ...fSans(600, 12.5), color: colors.text, flex: 1 }} numberOfLines={1}>{vendorName(i.vendorId)}</Text>
                  <Text style={{ ...fMono(600, 13), color: colors.text }}>{money(invoiceTotal(i))}</Text>
                </View>
                <Text style={{ ...fSans(400, 10.5), color: colors.muted, marginTop: 3 }}>
                  {i.number} · gasto {monthLabel(monthOf(i.expenseDate))} · vence {i.dueDate}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <View style={{ flex: 1 }}>
                    <PrimaryButton label="Registrar pago" onPress={() => { setPayingId(i.id); setPayDate(todayISO()); setRef(''); setView('pay'); }} />
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {view === 'pay' && paying && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 14 }}>
          <View style={{ ...card, padding: 16 }}>
            <Text style={{ ...fSans(600, 15), color: colors.text }}>{vendorName(paying.vendorId)}</Text>
            <Text style={{ ...fMono(700, 24, -0.02), color: colors.text, marginVertical: 8 }}>{money(invoiceTotal(paying))}</Text>
            <Field label="FECHA DE PAGO" value={payDate} onChange={setPayDate} placeholder="AAAA-MM-DD" mono />
            <SectionLabel>MÉTODO</SectionLabel>
            <ChoiceChips
              options={[['ach', 'Transferencia'], ['check', 'Cheque'], ['card', 'Tarjeta'], ['cash', 'Efectivo']]}
              value={method}
              onChange={setMethod}
            />
            <Field label="REFERENCIA (OPCIONAL)" value={ref} onChange={setRef} placeholder="p. ej. transf. #4421" mono />
            <PrimaryButton
              label={/^\d{4}-\d{2}-\d{2}$/.test(payDate) ? `Pagar · caja de ${monthLabel(monthOf(payDate))}` : 'Pagar'}
              disabled={!/^\d{4}-\d{2}-\d{2}$/.test(payDate)}
              onPress={() => {
                recordPayment(paying.id, payDate, method, ref.trim() || undefined);
                setView('history');
              }}
            />
            <Text style={{ ...fSans(400, 10), lineHeight: 15, color: colors.muted, marginTop: 8 }}>
              El gasto ya quedó en {monthLabel(monthOf(paying.expenseDate))} (mes de gasto). Este pago afecta solo la caja de {/^\d{4}-\d{2}-\d{2}$/.test(payDate) ? monthLabel(monthOf(payDate)) : 'su mes'} — nunca duplica el gasto.
            </Text>
          </View>
        </ScrollView>
      )}

      {view === 'history' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 8 }}>
          {data.payments.length === 0 ? (
            <EmptyState icon="≡" title="Sin pagos registrados" body="Cuando pagues una factura aprobada, el pago queda aquí con su mes de caja." />
          ) : (
            data.payments.map((p) => {
              const inv = data.invoices.find((i) => i.id === p.invoiceId);
              return (
                <View key={p.id} style={{ ...card, paddingVertical: 12, paddingHorizontal: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={{ ...fSans(600, 12.5), color: colors.text, flex: 1 }} numberOfLines={1}>
                      {inv ? vendorName(inv.vendorId) : '—'}
                    </Text>
                    <Text style={{ ...fMono(600, 13), color: colors.text }}>{money(p.amount)}</Text>
                  </View>
                  <Text style={{ ...fSans(400, 10.5), color: colors.muted, marginTop: 3 }}>
                    {inv?.number ?? ''} · pagada {p.date} · caja {monthLabel(monthOf(p.date))}
                    {inv && monthOf(p.date) !== monthOf(inv.expenseDate)
                      ? ` · gasto quedó en ${monthLabel(monthOf(inv.expenseDate))}`
                      : ''}
                    {p.ref ? ` · ${p.ref}` : ''}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}
