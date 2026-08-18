import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
  IBMPlexMono_700Bold,
} from '@expo-google-fonts/ibm-plex-mono';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-sans';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Platform, Pressable, SafeAreaView, Text, View } from 'react-native';
import APScreen from './src/screens/APScreen';
import ApprovalWorkflowScreen from './src/screens/ApprovalWorkflowScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import { colors, fMono } from './src/theme/tokens';

const modules = [
  { key: 'dashboard', label: 'DASHBOARD', Screen: DashboardScreen },
  { key: 'ap', label: 'AP', Screen: APScreen },
  { key: 'approvals', label: 'APPROVALS', Screen: ApprovalWorkflowScreen },
] as const;

type ModuleKey = (typeof modules)[number]['key'];

export default function App() {
  const [moduleKey, setModuleKey] = useState<ModuleKey>('dashboard');
  const [fontsLoaded] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
    IBMPlexMono_700Bold,
  });
  if (!fontsLoaded) return null;

  const Screen = modules.find((m) => m.key === moduleKey)!.Screen;

  if (Platform.OS === 'web') {
    // Design-review frame: the prototypes target a 430px iPhone frame.
    // The module switcher lives OUTSIDE the frame — it is review tooling,
    // not part of the design.
    return (
      <View style={{ flex: 1, backgroundColor: colors.pageBg, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 }}>
        <View style={{ width: 430, height: 880, maxHeight: '92%' as unknown as number, borderRadius: 40, overflow: 'hidden', borderWidth: 1, borderColor: '#d8d5cc' }}>
          <Screen />
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
          {modules.map((m) => (
            <Pressable
              key={m.key}
              onPress={() => setModuleKey(m.key)}
              style={{ borderRadius: 6, paddingVertical: 5, paddingHorizontal: 10, backgroundColor: moduleKey === m.key ? colors.ink : '#dcd9d0' }}
            >
              <Text style={{ ...fMono(600, 10, 0.06), color: moduleKey === m.key ? colors.gold : colors.textSecondary }}>
                {m.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink }}>
      <StatusBar style="light" />
      <Screen />
    </SafeAreaView>
  );
}
