import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  TextInput, Alert, ActivityIndicator, Image,
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy'; // 最新版SDK対応
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';

interface HeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  rightText?: string;
  onRightPress?: () => void;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [currentView, setCurrentView] = useState<'home' | 'edit' | 'settings'>('edit');

  const [username, setUsername] = useState('');
  const [location, setLocation] = useState('');
  const [hobbies, setHobbies] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    initializeUser();
  }, []);

  async function initializeUser() {
    try {
      setLoading(true);
      let { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        const { data: signInData, error: signInError } = await supabase.auth.signInAnonymously();
        if (signInError) throw signInError;
        user = signInData.user;
      }

      if (!user) return;

      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        setUsername(data.username || '');
        setLocation(data.location || '');
        setHobbies(data.hobbies || '');
        setBio(data.bio || '');
        setAvatarUrl(data.avatar_url || null);
        setCurrentView(data.username ? 'home' : 'edit');
      } else {
        setCurrentView('edit');
      }
    } catch (error: any) {
      console.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  // 写真選択とアップロード
  async function pickImage() {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('許可が必要', '画像へのアクセスを許可してください');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (result.canceled || !result.assets[0]) return;

      setUploading(true);
      const asset = result.assets[0];
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user');

      const fileExt = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: 'base64',
      });

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, decode(base64), {
          contentType: `image/${fileExt === 'png' ? 'png' : 'jpeg'}`,
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      setAvatarUrl(publicUrl);
      Alert.alert('成功', '画像をアップロードしました');

    } catch (error: any) {
      Alert.alert('エラー', `アップロード失敗: ${error.message}`);
    } finally {
      setUploading(false);
    }
  }

  // 保存
  async function handleSave() {
    if (!username.trim()) {
      Alert.alert('確認', 'お名前を入力してください');
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No User');

      const { error: upsertError } = await supabase.from('profiles').upsert({
        id: user.id,
        username: username.trim(),
        location: location.trim(),
        hobbies: hobbies.trim(),
        bio: bio.trim(),
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      });
      if (upsertError) throw upsertError;
      Alert.alert('完了', 'プロフィールを保存しました');
      setCurrentView('home');
    } catch (error: any) {
      Alert.alert('エラー', error.message);
    } finally {
      setLoading(false);
    }
  }

  // ログアウト
  const handleLogout = async () => {
    Alert.alert("ログアウト", "よろしいですか？", [
      { text: "キャンセル", style: "cancel" },
      { text: "ログアウト", onPress: async () => {
          await supabase.auth.signOut();
          setUsername(''); setLocation(''); setHobbies(''); setBio(''); setAvatarUrl(null);
          setCurrentView('edit');
          initializeUser();
        }
      }
    ]);
  };

  // アカウント削除
  const handleDeleteAccount = async () => {
    Alert.alert("アカウントを削除", "すべてのデータが削除されます。本当によろしいですか？", [
      { text: "キャンセル", style: "cancel" },
      { text: "削除する", style: "destructive", onPress: async () => {
          setLoading(true);
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              await supabase.from('profiles').delete().eq('id', user.id);
            }
            await supabase.auth.signOut();
            setUsername(''); setLocation(''); setHobbies(''); setBio(''); setAvatarUrl(null);
            setCurrentView('edit');
            initializeUser();
            Alert.alert("完了", "データを削除しました");
          } catch (e: any) {
            Alert.alert("エラー", "削除に失敗しました");
          } finally {
            setLoading(false);
          }
        }
      }
    ]);
  };

  const Header = ({ title, showBack = false, onBack, rightText, onRightPress }: HeaderProps) => (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <View style={styles.headerLeft}>{showBack && <TouchableOpacity onPress={onBack}><Ionicons name="chevron-back" size={28} color="#102A43" /></TouchableOpacity>}</View>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerRight}>{rightText && <TouchableOpacity onPress={onRightPress}><Text style={styles.headerActionText}>{rightText}</Text></TouchableOpacity>}</View>
    </View>
  );

  const renderEdit = () => (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex1}>
      <Header title="プロフィール設定" showBack={!!username} onBack={() => setCurrentView('home')} rightText="完了" onRightPress={handleSave} />
      <ScrollView style={styles.flex1} contentContainerStyle={styles.scrollContent} automaticallyAdjustKeyboardInsets={true}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View>
            <TouchableOpacity style={styles.avatarContainer} onPress={pickImage} disabled={uploading}>
              <View style={styles.avatarPlaceholder}>
                {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} /> : <Ionicons name="camera" size={40} color="#CBD5E0" />}
                {uploading && <ActivityIndicator style={styles.absoluteLoader} color="#2B6CB0" />}
              </View>
              <Text style={styles.avatarHint}>{uploading ? 'アップロード中...' : '写真を変更する'}</Text>
            </TouchableOpacity>
            <View style={styles.inputGroup}><Text style={styles.inputLabel}>名前（必須）</Text><TextInput style={styles.inputField} value={username} onChangeText={setUsername} placeholder="例：こう" /></View>
            <View style={styles.inputGroup}><Text style={styles.inputLabel}>地域</Text><TextInput style={styles.inputField} value={location} onChangeText={setLocation} placeholder="例：神奈川県" /></View>
            <View style={styles.inputGroup}><Text style={styles.inputLabel}>趣味</Text><TextInput style={styles.inputField} value={hobbies} onChangeText={setHobbies} placeholder="例：お酒、読書" /></View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>自己紹介</Text>
              <TextInput style={[styles.inputField, styles.textArea]} value={bio} onChangeText={setBio} multiline placeholder="よろしくお願いします" blurOnSubmit={false} />
            </View>
          </View>
        </TouchableWithoutFeedback>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderHome = () => (
    <View style={styles.flex1}>
      <Header title="My Page" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatarPlaceholder}>
            {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} /> : <Ionicons name="person" size={60} color="#CBD5E0" />}
          </View>
          <Text style={styles.userNameDisplay}>{username}</Text>
        </View>
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => setCurrentView('edit')}><Text style={styles.primaryButtonText}>プロフィールを編集</Text></TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setCurrentView('settings')}><Text style={styles.secondaryButtonText}>設定</Text></TouchableOpacity>
        </View>
        <View style={styles.displaySection}>
          <View style={styles.displayItem}><Text style={styles.displayLabel}>地域</Text><Text style={styles.displayValue}>{location || '未設定'}</Text></View>
          <View style={styles.displayItem}><Text style={styles.displayLabel}>趣味</Text><Text style={styles.displayValue}>{hobbies || '未設定'}</Text></View>
          <View style={styles.displayItemColumn}><Text style={styles.displayLabel}>自己紹介</Text><Text style={styles.displayValueText}>{bio || '未設定'}</Text></View>
        </View>
      </ScrollView>
    </View>
  );

  const renderSettings = () => (
    <View style={styles.flex1}>
      <Header title="設定" showBack onBack={() => setCurrentView('home')} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionHeader}>アカウント管理</Text>
        <View style={styles.listContainer}>
          {/* ログアウト */}
          <TouchableOpacity style={styles.listItem} onPress={handleLogout}>
            <Text style={styles.listItemText}>ログアウト</Text>
            <Ionicons name="log-out-outline" size={20} color="#627D98" />
          </TouchableOpacity>
          
          <View style={styles.separator} />
          
          {/* アカウントを削除 */}
          <TouchableOpacity style={styles.listItem} onPress={handleDeleteAccount}>
            <Text style={[styles.listItemText, { color: '#E53E3E' }]}>アカウントを削除</Text>
            <Ionicons name="trash-outline" size={20} color="#E53E3E" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );

  if (loading) return <View style={styles.loader}><ActivityIndicator size="large" color="#2B6CB0" /></View>;

  return (
    <View style={styles.container}>
      {currentView === 'edit' && renderEdit()}
      {currentView === 'home' && renderHome()}
      {currentView === 'settings' && renderSettings()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F9FF' },
  flex1: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingBottom: 60, paddingTop: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 15, backgroundColor: '#F5F9FF' },
  headerLeft: { width: 60 },
  headerRight: { width: 60, alignItems: 'flex-end' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#102A43' },
  headerActionText: { fontSize: 16, fontWeight: '600', color: '#2B6CB0' },
  avatarContainer: { alignItems: 'center', marginTop: 10, marginBottom: 20 },
  avatarPlaceholder: { width: 110, height: 110, borderRadius: 55, backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#FFFFFF', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarHint: { fontSize: 12, color: '#2B6CB0', fontWeight: '600', marginTop: 8 },
  absoluteLoader: { position: 'absolute' },
  userNameDisplay: { fontSize: 22, fontWeight: 'bold', color: '#102A43', marginTop: 10 },
  inputGroup: { marginBottom: 20, paddingHorizontal: 20 },
  inputLabel: { fontSize: 13, color: '#486581', fontWeight: '600', marginBottom: 8 },
  inputField: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, fontSize: 16, color: '#102A43', borderWidth: 1, borderColor: '#E1E7F0' },
  textArea: { height: 120, textAlignVertical: 'top' },
  primaryButton: { backgroundColor: '#2B6CB0', paddingVertical: 16, borderRadius: 30, alignItems: 'center', marginHorizontal: 20, marginTop: 10 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  secondaryButton: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E0', paddingVertical: 16, borderRadius: 30, alignItems: 'center', marginHorizontal: 20, marginTop: 10 },
  secondaryButtonText: { color: '#486581', fontWeight: '600' },
  buttonContainer: { marginBottom: 20 },
  displaySection: { paddingHorizontal: 24 },
  displayItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#E1E7F0' },
  displayItemColumn: { paddingVertical: 15 },
  displayLabel: { color: '#829AB1', fontSize: 14 },
  displayValue: { color: '#102A43', fontSize: 14, fontWeight: '500' },
  displayValueText: { color: '#102A43', fontSize: 14, marginTop: 8, lineHeight: 22 },
  sectionHeader: { fontSize: 13, color: '#627D98', fontWeight: '600', marginTop: 24, marginBottom: 8, marginLeft: 20 },
  listContainer: { backgroundColor: '#FFFFFF', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#E1E7F0' },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center' },
  listItemText: { fontSize: 16, color: '#102A43' },
  separator: { height: 1, backgroundColor: '#E1E7F0', marginLeft: 20 },
});