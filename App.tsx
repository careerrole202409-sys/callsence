import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native'; // ロード用
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from './lib/supabase';

// 各画面とコンポーネントのインポート
import HomeScreen from './screens/HomeScreen';
import ProfileScreen from './screens/ProfileScreen';
import ChatScreen from './screens/ChatScreen';
import CustomFooter from './components/CustomFooter';

const Tab = createBottomTabNavigator();

export default function App() {
  const [loading, setLoading] = useState(true);
  const [initialTab, setInitialTab] = useState<'Home' | 'Profile'>('Home');

  useEffect(() => {
    checkUserProfile();
  }, []);

  async function checkUserProfile() {
    try {
      // 1. セッション（ログイン状態）の確認
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        // 2. プロフィールテーブルから名前（username）を取得
        const { data, error } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', session.user.id)
          .single();

        // 名前が取得できない、または空の場合は初期タブを 'Profile' に設定
        if (error || !data || !data.username) {
          setInitialTab('Profile');
        } else {
          setInitialTab('Home');
        }
      } else {
        // ログインしていない場合も、まずはProfileで認証させる流れならProfileへ
        setInitialTab('Profile');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // プロフィール確認中は真っ白にならないようインジケーターを表示
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F9FF' }}>
        <ActivityIndicator size="large" color="#2B6CB0" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <Tab.Navigator
          // ★ここで動的に初期タブを切り替える
          initialRouteName={initialTab}
          tabBar={(props) => <CustomFooter {...props} />}
          screenOptions={{
            headerShown: false,
          }}
        >
          <Tab.Screen name="Chat" component={ChatScreen} />
          <Tab.Screen name="Home" component={HomeScreen} />
          <Tab.Screen name="Profile" component={ProfileScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}