import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, 
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

// 型定義
interface Message {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
}

interface MatchedUser {
  id: string;
  username: string;
  avatar_url: string | null;
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  
  const [currentView, setCurrentView] = useState<'list' | 'room'>('list');
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);
  
  // マッチしたユーザーのリスト
  const [matchedUsers, setMatchedUsers] = useState<MatchedUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<MatchedUser | null>(null);
  
  // メッセージデータ
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');

  useEffect(() => {
    setupChat();

    // リアルタイム購読の設定
    const subscription = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMessage = payload.new as Message;
        // 自分の関わっているメッセージ、かつ現在開いているトークルームのメッセージなら追加
        setMessages((prev) => {
          // 重複チェック（自分の送信時はINSERTと同時にローカル反映される可能性があるため）
          if (prev.find(m => m.id === newMessage.id)) return prev;
          return [...prev, newMessage];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  async function setupChat() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setMyId(user.id);
      await fetchMatchedUsers(user.id);
    }
    setLoading(false);
  }

  // 1. 相互マッチしたユーザーのみ取得 (SQLで作った 'matches' ビューを利用)
  async function fetchMatchedUsers(userId: string) {
    try {
      const { data, error } = await supabase
        .from('matches')
        .select('matched_user_id, username, avatar_url')
        .eq('user_id', userId);

      if (error) throw error;

      if (data) {
        const formattedUsers: MatchedUser[] = data.map(item => ({
          id: item.matched_user_id,
          username: item.username || '名無しさん',
          avatar_url: item.avatar_url
        }));
        setMatchedUsers(formattedUsers);
      }
    } catch (e: any) {
      console.error('Fetch Matches Error:', e.message);
    }
  }

  // 2. 特定のユーザーとのメッセージ履歴を取得
  async function fetchMessages(partnerId: string) {
    if (!myId) return;
    
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${myId},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${myId})`)
      .order('created_at', { ascending: true });

    if (data) {
      setMessages(data);
      // メッセージ取得後に一番下へスクロール
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  // 3. メッセージ送信
  async function sendMessage() {
    if (!inputText.trim() || !selectedUser || !myId) return;

    const content = inputText.trim();
    setInputText(''); // 入力欄を即時クリア

    const { error } = await supabase.from('messages').insert({
      sender_id: myId,
      receiver_id: selectedUser.id,
      content: content,
    });

    if (error) {
      Alert.alert('エラー', '送信できませんでした');
      console.error(error);
    }
  }

  const openChatRoom = (user: MatchedUser) => {
    setSelectedUser(user);
    setMessages([]);
    fetchMessages(user.id);
    setCurrentView('room');
  };

  // --- 画面1: マッチ一覧表示 ---
  const renderChatList = () => (
    <View style={styles.contentContainer}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.headerTitle}>Matches</Text>
      </View>
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {matchedUsers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="heart-half-outline" size={80} color="#CBD5E0" />
            <Text style={styles.emptyText}>マッチした相手がいません</Text>
            <Text style={styles.emptySubText}>通話のあとに「また話したい」をお互いに選ぶとここに表示されます</Text>
          </View>
        ) : (
          matchedUsers.map((item) => (
            <TouchableOpacity key={item.id} style={styles.chatItem} onPress={() => openChatRoom(item)}>
              <View style={styles.avatarPlaceholder}>
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                ) : (
                  <Ionicons name="person" size={30} color="#CBD5E0" />
                )}
              </View>
              <View style={styles.chatInfo}>
                <Text style={styles.chatName}>{item.username}</Text>
                <Text style={styles.lastMessage} numberOfLines={1}>マッチおめでとうございます！メッセージを送りましょう</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#CBD5E0" />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );

  // --- 画面2: トークルーム ---
  const renderChatRoom = () => (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.contentContainer}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => { setCurrentView('list'); setupChat(); }} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#102A43" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{selectedUser?.username}</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView 
        ref={scrollViewRef}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((msg) => {
          const isMine = msg.sender_id === myId;
          return (
            <View key={msg.id} style={[styles.messageRow, isMine ? styles.myRow : styles.partnerRow]}>
              <View style={isMine ? styles.myBubbleContent : styles.partnerBubbleContent}>
                <Text style={isMine ? styles.myMessageText : styles.partnerMessageText}>
                  {msg.content}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.inputContainer, { paddingBottom: insets.bottom + 10 }]}>
        <TextInput 
          style={styles.textInput} 
          placeholder="メッセージを入力..." 
          value={inputText}
          onChangeText={setInputText}
          placeholderTextColor="#94A3B8"
          multiline
        />
        <TouchableOpacity 
          style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]} 
          onPress={sendMessage}
          disabled={!inputText.trim()}
        >
          <Ionicons name="send" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );

  return (
    <View style={styles.container}>
      {loading && currentView === 'list' ? (
        <View style={styles.loader}><ActivityIndicator size="large" color="#2B6CB0" /></View>
      ) : (
        currentView === 'list' ? renderChatList() : renderChatRoom()
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F9FF' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  contentContainer: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 15,
    backgroundColor: '#F5F9FF',
    borderBottomWidth: 1,
    borderBottomColor: '#E1E7F0',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#102A43' },
  backButton: { padding: 4 },
  scrollContent: { paddingBottom: 40 },
  
  // マッチリストの空の状態
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100, paddingHorizontal: 40 },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#627D98', marginTop: 20 },
  emptySubText: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 10, lineHeight: 20 },

  // チャットリストアイテム
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F8',
  },
  avatarPlaceholder: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: '#E1E7F0' },
  avatar: { width: '100%', height: '100%' },
  chatInfo: { flex: 1, marginLeft: 14 },
  chatName: { fontSize: 16, fontWeight: '700', color: '#102A43' },
  lastMessage: { fontSize: 13, color: '#94A3B8', marginTop: 4 },

  // トークルーム
  messageList: { padding: 16, paddingBottom: 30 },
  messageRow: { marginBottom: 12, maxWidth: '85%' },
  partnerRow: { alignSelf: 'flex-start' },
  myRow: { alignSelf: 'flex-end' },
  partnerBubbleContent: { backgroundColor: '#FFFFFF', padding: 12, borderRadius: 18, borderTopLeftRadius: 2, borderWidth: 1, borderColor: '#E1E7F0' },
  myBubbleContent: { backgroundColor: '#2B6CB0', padding: 12, borderRadius: 18, borderTopRightRadius: 2 },
  partnerMessageText: { color: '#102A43', fontSize: 15, lineHeight: 22 },
  myMessageText: { color: '#FFFFFF', fontSize: 15, lineHeight: 22 },

  // 入力エリア
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E1E7F0',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    marginRight: 8,
    fontSize: 15,
    maxHeight: 120,
  },
  sendButton: {
    backgroundColor: '#2B6CB0',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  sendButtonDisabled: {
    backgroundColor: '#CBD5E0',
  },
});