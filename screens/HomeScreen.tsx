import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ActivityIndicator, Alert, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import MatchScreen from './MatchScreen'; // MatchScreenをインポート

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [isSearching, setIsSearching] = useState(false);
  const [showMatchScreen, setShowMatchScreen] = useState(false);
  const [targetUserId, setTargetUserId] = useState<string | null>(null);

  async function startRandomCall() {
    try {
      setIsSearching(true);
      const { data: { user: me } } = await supabase.auth.getUser();
      if (!me) throw new Error('ログインが必要です');

      const { data: others, error } = await supabase
        .from('profiles')
        .select('id')
        .neq('id', me.id)
        .not('username', 'is', null);

      if (error) throw error;
      if (!others || others.length === 0) {
        Alert.alert('ユーザー不在', 'テスト用に別のアカウントを作成してください');
        setIsSearching(false);
        return;
      }

      const randomIndex = Math.floor(Math.random() * others.length);
      const chosenOne = others[randomIndex].id;

      setTimeout(() => {
        setTargetUserId(chosenOne);
        setIsSearching(false);
        setShowMatchScreen(true);
      }, 2000);

    } catch (e: any) {
      Alert.alert('エラー', e.message);
      setIsSearching(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.logoText}>CALLSENCE</Text>
      </View>

      <View style={styles.centerContainer}>
        {isSearching ? (
          <View style={{ alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#2B6CB0" />
            <Text style={{ marginTop: 20, color: '#2B6CB0' }}>マッチング中...</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.mainCallButton} onPress={startRandomCall}>
            <Ionicons name="call" size={60} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={showMatchScreen} animationType="slide">
        {targetUserId && (
          <MatchScreen 
            partnerId={targetUserId} 
            onClose={() => setShowMatchScreen(false)} 
          />
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F9FF' },
  header: { alignItems: 'center' },
  logoText: { color: '#102A43', fontSize: 26, letterSpacing: 6, fontWeight: '700', textTransform: 'uppercase' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mainCallButton: {
    width: width * 0.35, height: width * 0.35, borderRadius: (width * 0.35) / 2,
    backgroundColor: '#2B6CB0', justifyContent: 'center', alignItems: 'center',
    elevation: 15,
  },
});