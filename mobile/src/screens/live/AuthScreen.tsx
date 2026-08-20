/** Login / registro contra el servidor MONARK. */
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { card, Field, Header, PrimaryButton, SectionLabel } from '../../components/ui';
import { useStore } from '../../store/store';
import { colors, fSans } from '../../theme/tokens';

export default function AuthScreen() {
  const { login, register, busy, lastError, clearError } = useStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');

  const canSubmit =
    email.includes('@') && password.length >= 8 && (mode === 'login' || orgName.trim().length > 1);

  const submit = () => {
    clearError();
    const action = mode === 'login' ? login(email.trim(), password) : register(email.trim(), password, orgName.trim());
    action.catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg }}>
      <Header title="MONARK" sub="Tu operación financiera, en la nube" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View style={{ backgroundColor: colors.ink, borderRadius: 14, padding: 18 }}>
          <Text style={{ ...fSans(600, 9.5, 0.14), color: colors.gold, marginBottom: 8 }}>
            {mode === 'login' ? 'ENTRAR' : 'CREAR CUENTA'}
          </Text>
          <Text style={{ ...fSans(400, 12), lineHeight: 18, color: '#c7d4cd' }}>
            {mode === 'login'
              ? 'Tus datos viven en el servidor: entra desde cualquier dispositivo y verás lo mismo.'
              : 'Crea la cuenta de tu negocio. Tú serás el propietario; después podrás registrar locales, facturas, ventas y pagos.'}
          </Text>
        </View>

        <View style={{ ...card, padding: 16 }}>
          {mode === 'register' && (
            <Field label="NOMBRE DEL NEGOCIO" value={orgName} onChange={setOrgName} placeholder="p. ej. La Cabaña" />
          )}
          <Field label="CORREO" value={email} onChange={setEmail} placeholder="tu@correo.com" />
          <Field label="CONTRASEÑA (8+ CARACTERES)" value={password} onChange={setPassword} placeholder="••••••••" mono />
          {!!lastError && (
            <Text style={{ ...fSans(500, 11), lineHeight: 16.5, color: colors.red, marginBottom: 10 }}>{lastError}</Text>
          )}
          <PrimaryButton
            label={busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
            onPress={submit}
            disabled={!canSubmit || busy}
          />
        </View>

        <Pressable onPress={() => { clearError(); setMode(mode === 'login' ? 'register' : 'login'); }}>
          <Text style={{ ...fSans(600, 12), color: colors.green, textAlign: 'center' }}>
            {mode === 'login' ? '¿Primera vez? Crea la cuenta de tu negocio' : '¿Ya tienes cuenta? Entra aquí'}
          </Text>
        </Pressable>

        <SectionLabel>SEGURIDAD</SectionLabel>
        <Text style={{ ...fSans(400, 10.5), lineHeight: 16, color: colors.muted, paddingHorizontal: 2 }}>
          Cada organización solo ve sus propios datos (aislamiento a nivel de base de datos). Tu contraseña se guarda cifrada y la sesión expira a los 30 días.
        </Text>
      </ScrollView>
    </View>
  );
}
