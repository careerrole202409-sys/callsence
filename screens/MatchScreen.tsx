import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Image, 
  Alert, ActivityIndicator, Dimensions, Modal 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');

// ここでプロパティ(Props)の型を定義しています
interface MatchScreenProps {
  partnerId: string;
  onClose: () => void;
}

export default function MatchScreen({ partnerId, onClose }: MatchScreenProps) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<any>(null);
  const [showMatchModal, setShowMatchModal] = useState(false);

  useEffect(() => {
    fetchPartnerProfile();
  }, [partnerId]);

  async function fetchPartnerProfile() {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', partnerId)
      .single();
    
    if (data) setPartner(data);
    setLoading(false);
  }

  async function handleVote(isLike: boolean) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from('votes').insert({
        user_id: user.id,
        target_id: partnerId,
        is_like: isLike,
      });

      if (error) throw error;

      if (isLike) {
        const { data: matchData } = await supabase
          .from('votes')
          .select('*')
          .eq('user_id', partnerId)
          .eq('target_id', user.id)
          .eq('is_like', true)
          .single();

        if (matchData) {
          setShowMatchModal(true);
          return;
        }
      }
      onClose();
    } catch (e: any) {
      console.error(e.message);
      onClose();
    }
  }

  if (loading) return <View style={styles.loader}><ActivityIndicator size="large" color="#2B6CB0" /></View>;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.headerTitle}>通話お疲れ様でした！</Text>
        <Text style={styles.headerSub}>相手の印象はどうでしたか？</Text>
      </View>

      <View style={styles.cardContainer}>
        <View style={styles.card}>
          <View style={styles.imagePlaceholder}>
            {partner?.avatar_url ? (
              <Image source={{ uri: partner.avatar_url }} style={styles.profileImage} />
            ) : (
              <Ionicons name="person" size={100} color="#CBD5E0" />
            )}
          </View>
          <View style={styles.infoContainer}>
            <Text style={styles.nameText}>{partner?.username || '名無しさん'}</Text>
            <Text style={styles.locationText}>{partner?.location || '地域未設定'}</Text>
            <Text style={styles.bioText} numberOfLines={3}>{partner?.bio || '自己紹介はありません'}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.actionContainer, { paddingBottom: insets.bottom + 40 }]}>
        <TouchableOpacity style={[styles.actionButton, styles.nopeButton]} onPress={() => handleVote(false)}>
          <Ionicons name="close" size={40} color="#94A3B8" />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionButton, styles.likeButton]} onPress={() => handleVote(true)}>
          <Ionicons name="heart" size={40} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <Modal visible={showMatchModal} transparent animationType="fade">
        <View style={styles.matchModalContainer}>
          <View style={styles.matchContent}>
            <Ionicons name="heart" size={80} color="#2B6CB0" />
            <Text style={styles.matchTitle}>It's a Match!</Text>
            <Text style={styles.matchSub}>お互いにLikeしました。メッセージを送ってみましょう！</Text>
            <TouchableOpacity style={styles.matchCloseButton} onPress={onClose}>
              <Text style={styles.matchCloseText}>閉じる</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F9FF' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { alignItems: 'center', paddingHorizontal: 20 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#102A43' },
  headerSub: { fontSize: 14, color: '#627D98', marginTop: 8 },
  cardContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', height: '80%', backgroundColor: '#FFFFFF', borderRadius: 24, shadowColor: '#102A43', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10, overflow: 'hidden' },
  imagePlaceholder: { flex: 1, backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  profileImage: { width: '100%', height: '100%' },
  infoContainer: { padding: 20 },
  nameText: { fontSize: 24, fontWeight: '700', color: '#102A43' },
  locationText: { fontSize: 16, color: '#2B6CB0', fontWeight: '600', marginTop: 4 },
  bioText: { fontSize: 14, color: '#627D98', marginTop: 12, lineHeight: 20 },
  actionContainer: { flexDirection: 'row', justifyContent: 'center', gap: 40 },
  actionButton: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  nopeButton: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E7F0' },
  likeButton: { backgroundColor: '#2B6CB0' },
  matchModalContainer: { flex: 1, backgroundColor: 'rgba(16, 42, 67, 0.9)', justifyContent: 'center', alignItems: 'center', padding: 30 },
  matchContent: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 30, alignItems: 'center', width: '100%' },
  matchTitle: { fontSize: 32, fontWeight: '900', color: '#2B6CB0', marginTop: 20 },
  matchSub: { fontSize: 16, color: '#627D98', textAlign: 'center', marginTop: 16, lineHeight: 24 },
  matchCloseButton: { marginTop: 30, backgroundColor: '#F5F9FF', paddingVertical: 12, paddingHorizontal: 40, borderRadius: 30 },
  matchCloseText: { color: '#2B6CB0', fontWeight: '700', fontSize: 16 },
});