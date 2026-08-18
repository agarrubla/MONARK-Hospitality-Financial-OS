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
import { Platform, SafeAreaView, View } from 'react-native';
import { ModuleDock } from './src/navigation/ModuleDock';
import AIClassificationScreen from './src/screens/AIClassificationScreen';
import AIInvoiceScreen from './src/screens/AIInvoiceScreen';
import APScreen from './src/screens/APScreen';
import ApprovalWorkflowScreen from './src/screens/ApprovalWorkflowScreen';
import BankingScreen from './src/screens/BankingScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import EmailIngestionScreen from './src/screens/EmailIngestionScreen';
import FinancialAIScreen from './src/screens/FinancialAIScreen';
import HealthScoreScreen from './src/screens/HealthScoreScreen';
import IntelligenceScreen from './src/screens/IntelligenceScreen';
import POSScreen from './src/screens/POSScreen';
import ReconciliationScreen from './src/screens/ReconciliationScreen';
import ReportsScreen from './src/screens/ReportsScreen';
import TreasuryScreen from './src/screens/TreasuryScreen';
import { colors } from './src/theme/tokens';

const modules = [
  { key: 'dashboard', label: 'HOME', icon: '◈', Screen: DashboardScreen },
  { key: 'ap', label: 'AP', icon: '▤', Screen: APScreen },
  { key: 'approvals', label: 'APPROVE', icon: '⚖', Screen: ApprovalWorkflowScreen },
  { key: 'treasury', label: 'TREASURY', icon: '⏷', Screen: TreasuryScreen },
  { key: 'banking', label: 'BANKING', icon: '≋', Screen: BankingScreen },
  { key: 'recon', label: 'RECON', icon: '⇄', Screen: ReconciliationScreen },
  { key: 'pos', label: 'POS', icon: '◉', Screen: POSScreen },
  { key: 'reports', label: 'REPORTS', icon: '◔', Screen: ReportsScreen },
  { key: 'aiinvoice', label: 'AI INV', icon: '◇', Screen: AIInvoiceScreen },
  { key: 'email', label: 'EMAIL', icon: '✉', Screen: EmailIngestionScreen },
  { key: 'aiclass', label: 'CLASSIFY', icon: '⚙', Screen: AIClassificationScreen },
  { key: 'finai', label: 'ASK AI', icon: 'M', Screen: FinancialAIScreen },
  { key: 'intel', label: 'ALERTS', icon: '◎', Screen: IntelligenceScreen },
  { key: 'health', label: 'SCORE', icon: '♡', Screen: HealthScoreScreen },
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

  const app = (
    <View style={{ flex: 1, backgroundColor: colors.appBg }}>
      <View style={{ flex: 1 }}>
        <Screen key={moduleKey} />
      </View>
      <ModuleDock modules={modules} activeKey={moduleKey} onSelect={(k) => setModuleKey(k as ModuleKey)} />
    </View>
  );

  if (Platform.OS === 'web') {
    // Design-review frame: the prototypes target a 430px iPhone frame.
    return (
      <View style={{ flex: 1, backgroundColor: colors.pageBg, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 }}>
        <View style={{ width: 430, height: 880, maxHeight: '96%' as unknown as number, borderRadius: 40, overflow: 'hidden', borderWidth: 1, borderColor: '#d8d5cc' }}>
          {app}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink }}>
      <StatusBar style="light" />
      {app}
    </SafeAreaView>
  );
}
