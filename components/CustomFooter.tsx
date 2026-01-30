import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { supabase } from '../lib/supabase';

export default function CustomFooter({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  
  // ★ プロフィールが完了しているかをメモリに保存するステート
  const [isProfileComplete, setIsProfileComplete] = useState<boolean | null>(null);

  // 初回表示時や、タブが切り替わったタイミングでこっそりチェックしておく
  useEffect(() => {
    checkStatusSilently();
  }, [state.index]);

  const checkStatusSilently = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .single();

    if (data?.username) {
      setIsProfileComplete(true);
    } else {
      setIsProfileComplete(false);
    }
  };

  const tabs = [
    { name: 'Chat', icon: 'chatbubble-ellipses-outline', activeIcon: 'chatbubble-ellipses', label: 'Chat' },
    { name: 'Home', icon: 'call-outline', activeIcon: 'call', label: 'Phone' },
    { name: 'Profile', icon: 'person-outline', activeIcon: 'person', label: 'Profile' },
  ];

  const handlePress = async (tabName: string, isFocused: boolean) => {
    if (isFocused) return;

    // 1. Profileタブへの移動は、常に「即時」許可
    if (tabName === 'Profile') {
      navigation.navigate(tabName);
      return;
    }

    // 2. すでに「完了している」とわかっている場合は「即時」移動
    if (isProfileComplete === true) {
      navigation.navigate(tabName);
      return;
    }

    // 3. まだわからない、または未完了の場合は、念のため最新の状態を確認（ここだけ少し待つ）
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase.from('profiles').select('username').eq('id', user?.id).single();

    if (data?.username) {
      setIsProfileComplete(true); // 完了を記録
      navigation.navigate(tabName);
    } else {
      setIsProfileComplete(false);
      Alert.alert("プロフィール未設定", "まずは「名前」を登録してください。");
      navigation.navigate('Profile');
    }
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 10 }]}>
      {tabs.map((tab, index) => {
        const isFocused = state.index === index;
        return (
          <TouchableOpacity
            key={tab.name}
            onPress={() => handlePress(tab.name, isFocused)}
            style={styles.navItem}
            activeOpacity={0.7}
          >
            <Ionicons 
              name={isFocused ? (tab.activeIcon as any) : (tab.icon as any)} 
              size={26} 
              color={isFocused ? '#102A43' : '#627D98'} 
            />
            <Text style={[styles.navText, isFocused && styles.activeNavText]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E1E7F0', paddingTop: 12 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navText: { fontSize: 10, marginTop: 4, color: '#627D98', fontWeight: '500' },
  activeNavText: { color: '#102A43', fontWeight: '700' },
});