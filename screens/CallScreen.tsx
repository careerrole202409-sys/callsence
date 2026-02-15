import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform } from 'react-native';
import Icon from '../components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AgoraRTC, { 
  IAgoraRTCClient, 
  IAgoraRTCRemoteUser, 
  ICameraVideoTrack, 
  IMicrophoneAudioTrack 
} from 'agora-rtc-sdk-ng';
import { supabase } from '../lib/supabase';

const { width, height } = Dimensions.get('window');
const APP_ID = process.env.EXPO_PUBLIC_AGORA_APP_ID || '';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';

interface CallScreenProps {
  partnerId: string;
  myUserId: string;
  onCallEnd: () => void;
}

export default function CallScreen({ partnerId, myUserId, onCallEnd }: CallScreenProps) {
  const insets = useSafeAreaInsets();
  const [client, setClient] = useState<IAgoraRTCClient | null>(null);
  const [localVideoTrack, setLocalVideoTrack] = useState<ICameraVideoTrack | null>(null);
  const [localAudioTrack, setLocalAudioTrack] = useState<IMicrophoneAudioTrack | null>(null);
  const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(true);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [partnerProfile, setPartnerProfile] = useState<any>(null);
  
  // 通話終了済みフラグ（重複呼び出し防止）
  const hasEndedRef = useRef(false);
  // leaveCall用にrefでも持つ（クリーンアップ時にstateが古い問題を回避）
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localVideoTrackRef = useRef<ICameraVideoTrack | null>(null);
  const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);

  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    if (!isWeb) {
      console.log('CallScreen is web-only for now');
      return;
    }

    initAgora();
    fetchPartnerProfile();
    
    const timer = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);

    return () => {
      clearInterval(timer);
      leaveCall();
    };
  }, []);

  async function fetchPartnerProfile() {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', partnerId)
        .single();
      if (data) setPartnerProfile(data);
    } catch (error) {
      console.error('Failed to fetch partner profile:', error);
    }
  }

  // Edge FunctionからAgoraトークンを取得
  async function fetchAgoraToken(channelName: string, uid: number): Promise<string> {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/agora-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelName, uid }),
    });
    const data = await response.json();
    if (!data.token) throw new Error('Failed to get Agora token');
    console.log('Got Agora token for channel:', channelName);
    return data.token;
  }

  async function initAgora() {
    try {
      const agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      setClient(agoraClient);
      clientRef.current = agoraClient;

      agoraClient.on('user-published', async (user, mediaType) => {
        await agoraClient.subscribe(user, mediaType);
        console.log('User published:', user.uid, mediaType);
        
        if (mediaType === 'video') {
          setRemoteUsers(prev => [...prev.filter(u => u.uid !== user.uid), user]);
          user.videoTrack?.play('remote-video-container');
        }
        if (mediaType === 'audio') {
          user.audioTrack?.play();
          console.log('Remote audio playing');
        }
      });

      agoraClient.on('user-unpublished', (user, mediaType) => {
        console.log('User unpublished:', user.uid, mediaType);
        setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
      });

      agoraClient.on('user-left', (user, reason) => {
        console.log('User left:', user.uid, 'Reason:', reason);
        setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
        if (!hasEndedRef.current) {
          hasEndedRef.current = true;
          console.log('Partner left, ending call...');
          setTimeout(() => onCallEnd(), 500);
        }
      });

      // ローカルトラック作成
      const videoTrack = await AgoraRTC.createCameraVideoTrack();
      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      videoTrack.setEnabled(false);
      
      setLocalVideoTrack(videoTrack);
      setLocalAudioTrack(audioTrack);
      localVideoTrackRef.current = videoTrack;
      localAudioTrackRef.current = audioTrack;

      // チャンネル名をユーザーIDから生成
      const sortedIds = [myUserId, partnerId].sort();
      const channelName = `call_${sortedIds[0].slice(0, 8)}_${sortedIds[1].slice(0, 8)}`;
      const uid = Math.floor(Math.random() * 100000);

      // Edge Functionからトークン取得してjoin
      const token = await fetchAgoraToken(channelName, uid);

      console.log('Joining channel:', channelName);
      await agoraClient.join(APP_ID, channelName, token, uid);
      console.log('Joined channel with UID:', uid);
      
      await agoraClient.publish([audioTrack]);
      console.log('Published local audio track');
      
      videoTrack.play('local-video-container');

    } catch (error) {
      console.error('Agora init error:', error);
    }
  }

  async function leaveCall() {
    try {
      localVideoTrackRef.current?.close();
      localAudioTrackRef.current?.close();
      await clientRef.current?.leave();
    } catch (error) {
      console.error('Leave call error:', error);
    }
  }

  function toggleMute() {
    if (localAudioTrack) {
      const newMutedState = !isMuted;
      localAudioTrack.setEnabled(!newMutedState);
      setIsMuted(newMutedState);
      console.log('Muted:', newMutedState);
    }
  }

  function toggleVideo() {
    if (localVideoTrack) {
      localVideoTrack.setEnabled(isVideoOff);
      setIsVideoOff(!isVideoOff);
    }
  }

  function toggleSpeaker() {
    setIsSpeakerOn(!isSpeakerOn);
    console.log('Speaker:', !isSpeakerOn);
  }

  async function endCall() {
    if (hasEndedRef.current) {
      console.log('Call already ended, skipping...');
      return;
    }
    hasEndedRef.current = true;
    console.log('Ending call...');
    await leaveCall();
    onCallEnd();
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isWeb) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Web版のみ対応しています</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ヘッダー */}
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.partnerName}>相手のプロフィール</Text>
        <Text style={styles.durationText}>{formatDuration(callDuration)}</Text>
      </View>

      {/* 相手のプロフィールエリア */}
      <View style={styles.profileContainer}>
        <div id="remote-video-container" style={{ display: 'none' }} />
        
        <View style={styles.profileDisplay}>
          <View style={styles.avatarCircle}>
            <Icon name="person" size={80} color="#FFFFFF" />
          </View>
          <Text style={styles.profileName}>{partnerProfile?.username || '相手'}</Text>
          <Text style={styles.profileLocation}>
            {partnerProfile?.location || '地域未設定'}
          </Text>
          
          <View style={styles.profileDetails}>
            <View style={styles.profileDetailItem}>
              <Text style={styles.profileDetailLabel}>趣味</Text>
              <Text style={styles.profileDetailValue}>
                {partnerProfile?.hobbies || '未設定'}
              </Text>
            </View>
            <View style={styles.profileDetailItem}>
              <Text style={styles.profileDetailLabel}>自己紹介</Text>
              <Text style={styles.profileDetailValue}>
                {partnerProfile?.bio || '未設定'}
              </Text>
            </View>
          </View>
        </View>

        <div id="local-video-container" style={{ display: 'none' }} />
      </View>

      {/* コントロールボタン */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + 30 }]}>
        <TouchableOpacity 
          style={[styles.controlButton, isSpeakerOn && styles.speakerActiveButton]} 
          onPress={toggleSpeaker}
          activeOpacity={0.7}
        >
          <Icon 
            name={isSpeakerOn ? 'volume-high' : 'volume-mute'} 
            size={32} 
            color={isSpeakerOn ? '#10B981' : '#627D98'} 
          />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.endCallButton} 
          onPress={endCall}
          activeOpacity={0.7}
        >
          <Icon name="call" size={36} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.controlButton, isMuted && styles.muteActiveButton]} 
          onPress={toggleMute}
          activeOpacity={0.7}
        >
          <Icon 
            name={isMuted ? 'mic-off' : 'mic'} 
            size={32} 
            color={isMuted ? '#EF4444' : '#627D98'} 
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F9FF',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E1E7F0',
  },
  partnerName: {
    color: '#102A43',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  durationText: {
    color: '#627D98',
    fontSize: 14,
    fontWeight: '500',
  },
  profileContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  profileDisplay: {
    alignItems: 'center',
  },
  avatarCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#2B6CB0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#102A43',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  profileName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#102A43',
    marginBottom: 4,
  },
  profileLocation: {
    fontSize: 16,
    color: '#2B6CB0',
    fontWeight: '600',
    marginBottom: 24,
  },
  profileDetails: {
    width: '100%',
    paddingHorizontal: 30,
    gap: 12,
    maxWidth: 500,
  },
  profileDetailItem: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E1E7F0',
    minHeight: 80,
  },
  profileDetailLabel: {
    fontSize: 13,
    color: '#829AB1',
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  profileDetailValue: {
    fontSize: 16,
    color: '#102A43',
    lineHeight: 24,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 60,
    paddingVertical: 30,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E1E7F0',
  },
  controlButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#F5F9FF',
    borderWidth: 2,
    borderColor: '#E1E7F0',
  },
  speakerActiveButton: {
    backgroundColor: '#D1FAE5',
    borderColor: '#10B981',
  },
  muteActiveButton: {
    backgroundColor: '#FFE5E5',
    borderColor: '#EF4444',
  },
  endCallButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ rotate: '135deg' }],
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  errorText: {
    color: '#102A43',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 100,
  },
});