/**
 * Ajustes — POS connections. The user manages each POS token here: connect,
 * replace or disconnect. Tokens travel once over HTTPS, are verified against
 * the provider (read-only) and stored encrypted server-side; the app never
 * sees them again.
 */
import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import {
  card, ChoiceChips, EmptyState, Field, Header, PrimaryButton, SectionLabel,
} from '../../components/ui';
import { useStore } from '../../store/store';
import { colors, fMono, fSans } from '../../theme/tokens';

const PROVIDERS: Array<[string, string]> = [
  ['clover', 'Clover'], ['toast', 'Toast'], ['square', 'Square'], ['lightspeed', 'Lightspeed'],
];
const TIMEZONES: Array<[string, string]> = [
  ['America/New_York', 'Miami / NY'], ['America/Chicago', 'Chicago'],
  ['America/Denver', 'Denver'], ['America/Los_Angeles', 'L.A.'],
  ['America/Bogota', 'Bogotá'], ['America/Mexico_City', 'CDMX'],
];

export default function LiveSettingsScreen() {
  const { data, connectPos, disconnectPos, busy, lastError, clearError } = useStore();
  const [view, setView] = useState<'list' | 'form'>('list');
  const [provider, setProvider] = useState('clover');
  const [merchantId, setMerchantId] = useState('');
  const [token, setToken] = useState('');
  const [locationId, setLocationId] = useState(data.locations[0]?.id ?? '');
  const [timezone, setTimezone] = useState('America/New_York');
  const [cutoff, setCutoff] = useState('5');
  const [savedMsg, setSavedMsg] = useState('');

  const locCode = (id: string | null) => data.locations.find((l) => l.id === id)?.code ?? '—';
  const openForm = (prov?: string, merchant?: string) => {
    clearError();
    setSavedMsg('');
    if (prov) setProvider(prov);
    setMerchantId(merchant ?? '');
    setToken('');
    setLocationId((l) => l || (data.locations[0]?.id ?? ''));
    setView('form');
  };

  const canSave = !!provider && !!merchantId.trim() && !!token.trim() && !!locationId && !busy;
  const save = () => {
    connectPos({ provider, merchantId: merchantId.trim(), apiToken: token.trim(), locationId, timezone, dayCutoffHour: Number(cutoff) })
      .then(() => {
        setToken('');
        setSavedMsg('Conectado. Las ventas de los últimos 30 días se están importando — revisa VENTAS en unos minutos.');
        setView('list');
      })
      .catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg }}>
      <Header
        title={view === 'form' ? 'CONECTAR POS' : 'AJUSTES'}
        sub={view === 'form' ? 'El token se guarda cifrado en el servidor' : 'Conexiones y configuración del módulo'}
        onBack={view === 'form' ? () => setView('list') : undefined}
      />

      {view === 'list' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 14 }}>
          {!!savedMsg && (
            <View style={{ backgroundColor: '#eaf3ee', borderRadius: 10, padding: 12 }}>
              <Text style={{ ...fSans(500, 11.5), lineHeight: 17, color: colors.green }}>{savedMsg}</Text>
            </View>
          )}

          <View>
            <SectionLabel>PUNTO DE VENTA (POS)</SectionLabel>
            {data.integrations.length === 0 ? (
              <EmptyState
                icon="⚙"
                title="Ningún POS conectado"
                body="Conecta tu POS con un token de solo lectura y tus ventas diarias entrarán solas — sin registro manual."
              />
            ) : (
              <View style={{ gap: 8 }}>
                {data.integrations.map((i) => {
                  const connected = i.status === 'connected';
                  return (
                    <View key={i.id} style={{ ...card, paddingVertical: 12, paddingHorizontal: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ ...fSans(600, 13), color: colors.text, flex: 1 }}>
                          {PROVIDERS.find(([k]) => k === i.provider)?.[1] ?? i.provider}
                        </Text>
                        <View style={{ backgroundColor: connected ? '#eaf3ee' : '#f6e9e7', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ ...fSans(600, 8.5, 0.08), color: connected ? colors.green : colors.red }}>
                            {connected ? 'CONECTADO' : i.status === 'disconnected' ? 'DESCONECTADO' : 'CON ERROR'}
                          </Text>
                        </View>
                      </View>
                      <Text style={{ ...fMono(500, 10.5), color: colors.muted, marginTop: 4 }}>
                        {i.merchantId} · local {locCode(i.locationId)}
                      </Text>
                      <Text style={{ ...fSans(400, 10.5), color: colors.muted, marginTop: 2 }}>
                        {i.lastSyncAt ? `Última sincronización: ${i.lastSyncAt.slice(0, 16).replace('T', ' ')}` : 'Aún sin sincronizar'}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                        <Pressable
                          onPress={() => openForm(i.provider, i.merchantId)}
                          style={{ flex: 1, borderRadius: 8, paddingVertical: 9, alignItems: 'center', backgroundColor: colors.ink }}
                        >
                          <Text style={{ ...fSans(600, 11.5), color: colors.gold }}>Cambiar token</Text>
                        </Pressable>
                        {connected && (
                          <Pressable
                            onPress={() => { void disconnectPos(i.id).catch(() => {}); }}
                            style={{ flex: 1, borderRadius: 8, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: '#d9c4c0' }}
                          >
                            <Text style={{ ...fSans(600, 11.5), color: colors.red }}>Desconectar</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
            <View style={{ marginTop: 10 }}>
              <PrimaryButton label="+ Conectar un POS" onPress={() => openForm()} />
            </View>
            {!!lastError && view === 'list' && (
              <Text style={{ ...fSans(500, 11), lineHeight: 16.5, color: colors.red, marginTop: 8 }}>{lastError}</Text>
            )}
          </View>

          <View>
            <SectionLabel>BANCOS</SectionLabel>
            <View style={{ ...card, padding: 14 }}>
              <Text style={{ ...fSans(400, 11.5), lineHeight: 17, color: colors.textSecondary2 }}>
                La conexión bancaria (Plaid para EE.UU., Belvo para Latinoamérica) se configurará aquí cuando esté activa.
              </Text>
            </View>
          </View>

          <View>
            <SectionLabel>MÓDULO</SectionLabel>
            <View style={{ ...card, padding: 14 }}>
              <Text style={{ ...fSans(400, 11.5), lineHeight: 17, color: colors.textSecondary2 }}>
                Este módulo financiero forma parte de la super app MONARK. La identidad vendrá del login central de la super app; por ahora la sesión pertenece a este dispositivo.
              </Text>
              <Text
                onPress={() => { void Linking.openURL('https://wonderful-muffin-aedd73.netlify.app/privacy.html'); }}
                style={{ ...fSans(600, 11.5), color: colors.green, marginTop: 10 }}
              >
                Política de privacidad →
              </Text>
            </View>
          </View>
        </ScrollView>
      )}

      {view === 'form' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
          <View style={{ ...card, padding: 16 }}>
            <SectionLabel>PROVEEDOR</SectionLabel>
            <ChoiceChips options={PROVIDERS} value={provider} onChange={setProvider} />
            {provider !== 'clover' && (
              <Text style={{ ...fSans(500, 10.5), lineHeight: 15, color: colors.amber, marginTop: -4, marginBottom: 8 }}>
                Por ahora solo Clover está activo; {PROVIDERS.find(([k]) => k === provider)?.[1]} viene en camino.
              </Text>
            )}
            <Field label="MERCHANT ID" value={merchantId} onChange={setMerchantId} placeholder="p. ej. YM48N40T92ET1" mono />
            <Field label="API TOKEN (SOLO LECTURA)" value={token} onChange={setToken} placeholder="pega aquí el token" mono secure />
            {data.locations.length > 1 && (
              <>
                <SectionLabel>LOCAL</SectionLabel>
                <ChoiceChips
                  options={data.locations.map((l) => [l.id, l.code] as [string, string])}
                  value={locationId}
                  onChange={setLocationId}
                />
              </>
            )}
            <SectionLabel>ZONA HORARIA DEL NEGOCIO</SectionLabel>
            <ChoiceChips options={TIMEZONES} value={timezone} onChange={setTimezone} />
            <SectionLabel>CORTE DEL DÍA DE VENTAS</SectionLabel>
            <ChoiceChips
              options={[['4', '4 am'], ['5', '5 am'], ['6', '6 am'], ['7', '7 am']]}
              value={cutoff}
              onChange={setCutoff}
            />
            <Text style={{ ...fSans(400, 10), lineHeight: 15, color: colors.muted, marginTop: -4, marginBottom: 8 }}>
              El día de ventas va de esta hora a la misma hora del día siguiente — igual que el corte de tu POS. Las ventas de madrugada cuentan con la noche que las generó.
            </Text>
            {!!lastError && (
              <Text style={{ ...fSans(500, 11), lineHeight: 16.5, color: colors.red, marginBottom: 8 }}>{lastError}</Text>
            )}
            <PrimaryButton label={busy ? 'Verificando…' : 'Verificar y conectar'} onPress={save} disabled={!canSave} />
            <Text style={{ ...fSans(400, 10), lineHeight: 15, color: colors.muted, marginTop: 8 }}>
              El token se verifica contra el proveedor (solo lectura), viaja cifrado por HTTPS y se guarda cifrado en el servidor. Nunca se muestra de nuevo; para cambiarlo, pega uno nuevo.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
