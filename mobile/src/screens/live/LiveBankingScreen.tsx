/**
 * Banco — real bank accounts and transactions via Plaid Link. The bank feed
 * is EVIDENCE: it never books an expense; it confirms that registered
 * payments and POS deposits actually moved money.
 */
import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { card, EmptyState, Header, PrimaryButton, SectionLabel } from '../../components/ui';
import { money, useStore } from '../../store/store';
import { colors, fMono, fSans } from '../../theme/tokens';

/** Load Plaid Link (web) on demand and open it. */
async function openPlaidLink(
  linkToken: string,
  onSuccess: (publicToken: string) => void,
  onExit: () => void,
): Promise<void> {
  const g = globalThis as unknown as {
    document?: { createElement(t: string): { src: string; onload: (() => void) | null; onerror: ((e: unknown) => void) | null }; head: { appendChild(n: unknown): void } };
    Plaid?: { create(opts: object): { open(): void } };
  };
  if (!g.document) throw new Error('Por ahora conecta el banco desde la versión web de MONARK.');
  if (!g.Plaid) {
    await new Promise<void>((resolve, reject) => {
      const s = g.document!.createElement('script');
      s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se pudo cargar el conector de Plaid.'));
      g.document!.head.appendChild(s);
    });
  }
  g.Plaid!.create({
    token: linkToken,
    onSuccess: (publicToken: string) => onSuccess(publicToken),
    onExit: () => onExit(),
  }).open();
}

export default function LiveBankingScreen() {
  const { data, bankLinkToken, bankExchange, busy, lastError, clearError } = useStore();
  const [connecting, setConnecting] = useState(false);
  const [flowError, setFlowError] = useState('');

  const accountName = (id: string) => {
    const a = data.bankAccounts.find((x) => x.id === id);
    return a ? `${a.institution} ····${a.mask}` : '—';
  };

  const connect = () => {
    clearError();
    setFlowError('');
    setConnecting(true);
    bankLinkToken()
      .then((token) =>
        openPlaidLink(
          token,
          (publicToken) => {
            bankExchange(publicToken)
              .then(() => setConnecting(false))
              .catch(() => setConnecting(false));
          },
          () => setConnecting(false),
        ),
      )
      .catch((err: Error) => {
        setFlowError(err.message);
        setConnecting(false);
      });
  };

  const hasBank = data.bankAccounts.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg }}>
      <Header title="BANKING" sub="Tus cuentas reales · el banco es evidencia" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 14 }}>
        {!hasBank && (
          <>
            <EmptyState
              icon="≋"
              title="Ningún banco conectado"
              body="Conecta tu cuenta con Plaid: tus movimientos entran solos cada hora y se cruzan con tus pagos y depósitos de ventas. MONARK solo LEE — nunca puede mover dinero."
            />
            <PrimaryButton
              label={connecting || busy ? 'Conectando…' : 'Conectar banco (Plaid)'}
              onPress={connect}
              disabled={connecting || busy || Platform.OS !== 'web'}
            />
            {Platform.OS !== 'web' && (
              <Text style={{ ...fSans(400, 10.5), lineHeight: 15, color: colors.muted, textAlign: 'center' }}>
                Por ahora, conecta el banco desde la versión web de MONARK.
              </Text>
            )}
          </>
        )}

        {!!(flowError || lastError) && (
          <Text style={{ ...fSans(500, 11), lineHeight: 16.5, color: colors.red }}>{flowError || lastError}</Text>
        )}

        {hasBank && (
          <>
            <View>
              <SectionLabel>CUENTAS</SectionLabel>
              <View style={{ gap: 8 }}>
                {data.bankAccounts.map((a) => (
                  <View key={a.id} style={{ ...card, paddingVertical: 12, paddingHorizontal: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <Text style={{ ...fSans(600, 12.5), color: colors.text, flex: 1 }} numberOfLines={1}>
                        {a.institution} · {a.name}
                      </Text>
                      <Text style={{ ...fMono(600, 15), color: colors.text }}>{money(a.balance)}</Text>
                    </View>
                    <Text style={{ ...fSans(400, 10.5), color: colors.muted, marginTop: 3 }}>
                      ····{a.mask} · {a.type === 'credit_card' ? 'tarjeta de crédito' : a.type === 'savings' ? 'ahorros' : 'corriente'}
                      {a.balanceAsOf ? ` · saldo al ${a.balanceAsOf.slice(0, 10)}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={{ marginTop: 10 }}>
                <Pressable onPress={connect} disabled={connecting || busy}>
                  <Text style={{ ...fSans(600, 11.5), color: colors.green, textAlign: 'center', padding: 6 }}>
                    {connecting ? 'Conectando…' : '+ Conectar otra cuenta'}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View>
              <SectionLabel>MOVIMIENTOS RECIENTES</SectionLabel>
              {data.bankTxns.length === 0 ? (
                <View style={{ ...card, padding: 14 }}>
                  <Text style={{ ...fSans(400, 11.5), lineHeight: 17, color: colors.textSecondary2 }}>
                    Aún no llegan movimientos — la primera sincronización puede tardar unos minutos.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 6 }}>
                  {data.bankTxns.map((t) => (
                    <View key={t.id} style={{ ...card, paddingVertical: 10, paddingHorizontal: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                        <Text style={{ ...fSans(500, 12), color: colors.text, flex: 1 }} numberOfLines={1}>
                          {t.counterparty || t.description}
                        </Text>
                        <Text style={{ ...fMono(600, 12.5), color: t.amount < 0 ? colors.text : colors.green }}>
                          {money(t.amount)}
                        </Text>
                      </View>
                      <Text style={{ ...fSans(400, 10), color: colors.muted, marginTop: 2 }}>
                        {t.date} · {accountName(t.accountId)}
                        {t.pending ? ' · pendiente' : ''}
                        {t.matched ? ' · ✓ conciliado con un pago' : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              <Text style={{ ...fSans(400, 10), lineHeight: 15, color: colors.muted, marginTop: 8, marginHorizontal: 2 }}>
                El banco nunca crea gastos: cada movimiento es evidencia que confirma tus pagos registrados y tus depósitos de ventas.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
