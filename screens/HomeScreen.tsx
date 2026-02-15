import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ActivityIndicator, Alert, Modal } from 'react-native';
import Icon from '../components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import CallScreen from './CallScreen';
import MatchScreen from './MatchScreen';

const { width } = Dimensions.get('window');
const TIMEOUT_SECONDS = 30; // 30秒でタイムアウト

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [isSearching, setIsSearching] = useState(false);
  const [showCallScreen, setShowCallScreen] = useState(false);
  const [showMatchScreen, setShowMatchScreen] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null); // 追加：自分のID
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [waitTime, setWaitTime] = useState(0);
  const [queueId, setQueueId] = useState<string | null>(null);
  const [showTimeoutModal, setShowTimeoutModal] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('');
  
  // subscription の参照を保持
  const subscriptionRef = useRef<any>(null);

  // タイムアウト監視
  useEffect(() => {
    if (!isSearching) return;

    const timer = setInterval(() => {
      setWaitTime(prev => {
        const newTime = prev + 1;
        if (newTime >= TIMEOUT_SECONDS) {
          handleTimeout();
        }
        return newTime;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isSearching]);

  // クリーンアップ: コンポーネントがアンマウントされたら subscription を解除
  useEffect(() => {
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
      }
    };
  }, []);

  async function handleTimeout() {
    // subscription をクリーンアップ
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
      subscriptionRef.current = null;
    }
    
    // タイムアウト: キューから削除
    if (queueId) {
      await supabase.from('waiting_queue').delete().eq('id', queueId);
    }
    setIsSearching(false);
    setWaitTime(0);
    setQueueId(null);
    setTargetUserId(null);
    setConnectionStatus('');
    setShowTimeoutModal(true);
  }

  async function startMatchmaking() {
    try {
      setIsSearching(true);
      setWaitTime(0);
      setTargetUserId(null);
      setConnectionStatus('接続中...');
      
      const { data: { user: me } } = await supabase.auth.getUser();
      if (!me) throw new Error('ログインが必要です');

      // 自分のIDを保存
      setMyUserId(me.id);

      // 自分の古い待機レコードを削除（重要！）
      await supabase
        .from('waiting_queue')
        .delete()
        .eq('user_id', me.id);

      // 1. 既に待機中のユーザーを探す
      const { data: waitingUsers, error: fetchError } = await supabase
        .from('waiting_queue')
        .select('*')
        .eq('is_active', true)
        .is('matched_with', null)
        .neq('user_id', me.id)
        .order('created_at', { ascending: true })
        .limit(1);

      if (fetchError) throw fetchError;

      if (waitingUsers && waitingUsers.length > 0) {
        // 2. 待機中のユーザーが見つかった → マッチング成立
        console.log('待機中ユーザー発見:', waitingUsers[0]);
        const partner = waitingUsers[0];
        
        // 相手のレコードを更新
        await supabase
          .from('waiting_queue')
          .update({ matched_with: me.id, is_active: false })
          .eq('id', partner.id);

        // 自分のレコードを追加（マッチング済み）
        await supabase.from('waiting_queue').insert({
          user_id: me.id,
          matched_with: partner.user_id,
          is_active: false,
        });

        // 通話開始
        setConnectionStatus('');
        setTargetUserId(partner.user_id);
        setIsSearching(false);
        setWaitTime(0);
        setShowCallScreen(true);

      } else {
        // 3. 待機中のユーザーがいない → 自分が待機
        const { data: newQueue, error: insertError } = await supabase
          .from('waiting_queue')
          .insert({
            user_id: me.id,
            is_active: true,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        setQueueId(newQueue.id);

        // 4. リアルタイムでマッチングを監視（完了を待つ）
        const subscription = supabase
          .channel(`queue_updates_${newQueue.id}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'waiting_queue',
              filter: `id=eq.${newQueue.id}`,
            },
            async (payload) => {
              console.log('Subscription更新:', payload.new);
              const updated = payload.new as any;
              // matched_withがnullでないことを明示的にチェック
              if (updated.matched_with !== null && updated.matched_with !== undefined && !updated.is_active) {
                // マッチング成立！
                subscription.unsubscribe();
                subscriptionRef.current = null;
                setConnectionStatus('');
                setTargetUserId(updated.matched_with);
                setIsSearching(false);
                setWaitTime(0);
                setQueueId(null);
                setShowCallScreen(true);
              }
            }
          );
        
        // subscription の完了を待つ（重要！）
        await new Promise((resolve, reject) => {
          subscription.subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
              setConnectionStatus(''); // 接続完了
              resolve(status);
            } else if (err) {
              reject(err);
            }
          });
        });
        
        // subscription を保持
        subscriptionRef.current = subscription;
      }

    } catch (e: any) {
      Alert.alert('エラー', e.message);
      setIsSearching(false);
      setWaitTime(0);
      setQueueId(null);
      setTargetUserId(null);
      setConnectionStatus('');
    }
  }

  async function cancelMatching() {
    // subscription をクリーンアップ
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
      subscriptionRef.current = null;
    }
    
    if (queueId) {
      await supabase.from('waiting_queue').delete().eq('id', queueId);
    }
    setIsSearching(false);
    setWaitTime(0);
    setQueueId(null);
    setTargetUserId(null);
    setConnectionStatus('');
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.logoText}>CALLSENCE</Text>
      </View>

      <View style={styles.centerContainer}>
        {isSearching ? (
          <View style={styles.searchingContainer}>
            <View style={styles.pulseContainer}>
              <View style={[styles.pulseCircle, styles.pulse1]} />
              <View style={[styles.pulseCircle, styles.pulse2]} />
              <View style={[styles.pulseCircle, styles.pulse3]} />
              <View style={styles.phoneIconContainer}>
                <Icon name="call" size={50} color="#2B6CB0" />
              </View>
            </View>
            <Text style={styles.searchingText}>
              {connectionStatus || '相手を探しています...'}
            </Text>
            {!connectionStatus && <Text style={styles.timerText}>{waitTime}秒経過</Text>}
            <TouchableOpacity style={styles.cancelButton} onPress={cancelMatching}>
              <Text style={styles.cancelButtonText}>キャンセル</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.mainCallButton} onPress={startMatchmaking}>
            <Icon name="call" size={60} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>

      {/* 通話画面のModal */}
      <Modal visible={showCallScreen} animationType="slide">
        {targetUserId && myUserId && (
          <CallScreen 
            partnerId={targetUserId}
            myUserId={myUserId}
            onCallEnd={() => {
              setShowCallScreen(false);
              setShowMatchScreen(true);
            }} 
          />
        )}
      </Modal>

      {/* マッチ画面のModal */}
      <Modal visible={showMatchScreen} animationType="slide">
        {targetUserId && (
          <MatchScreen 
            partnerId={targetUserId} 
            onClose={() => {
              setShowMatchScreen(false);
              setTargetUserId(null);
            }} 
          />
        )}
      </Modal>

      {/* タイムアウトモーダル */}
      <Modal visible={showTimeoutModal} transparent animationType="fade">
        <View style={styles.timeoutModalContainer}>
          <View style={styles.timeoutContent}>
            <Icon name="sad-outline" size={60} color="#627D98" />
            <Text style={styles.timeoutTitle}>相手が見つかりませんでした</Text>
            <Text style={styles.timeoutMessage}>もう一度お試しください</Text>
            <TouchableOpacity 
              style={styles.timeoutButton} 
              onPress={() => setShowTimeoutModal(false)}
            >
              <Text style={styles.timeoutButtonText}>閉じる</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F9FF' },
  header: { alignItems: 'center' },
  logoText: { 
    color: '#102A43', 
    fontSize: 26, 
    letterSpacing: 6, 
    fontWeight: '700', 
    textTransform: 'uppercase' 
  },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mainCallButton: {
    width: width * 0.25, 
    height: width * 0.25, 
    borderRadius: (width * 0.15) / 2,
    backgroundColor: '#2B6CB0', 
    justifyContent: 'center', 
    alignItems: 'center',
    shadowColor: '#2B6CB0',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 15,
  },
  searchingContainer: {
    alignItems: 'center',
    gap: 20,
  },
  pulseContainer: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  pulseCircle: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#2B6CB0',
    opacity: 0.3,
  },
  pulse1: {
    // アニメーション用（将来的にAnimatedを使用）
  },
  pulse2: {
    width: 160,
    height: 160,
    borderRadius: 80,
    opacity: 0.2,
  },
  pulse3: {
    width: 120,
    height: 120,
    borderRadius: 60,
    opacity: 0.1,
  },
  phoneIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#2B6CB0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  searchingText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#102A43',
  },
  timerText: {
    fontSize: 16,
    color: '#627D98',
  },
  cancelButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#E1E7F0',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#627D98',
  },
  timeoutModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(16, 42, 67, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  timeoutContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 40,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },
  timeoutTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#102A43',
    marginTop: 20,
    marginBottom: 12,
  },
  timeoutMessage: {
    fontSize: 16,
    color: '#627D98',
    textAlign: 'center',
    marginBottom: 30,
  },
  timeoutButton: {
    backgroundColor: '#2B6CB0',
    paddingVertical: 14,
    paddingHorizontal: 50,
    borderRadius: 30,
  },
  timeoutButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
});