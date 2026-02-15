import React from 'react';
import { Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ReactIcons from 'react-icons/io5';

interface IconProps {
  name: string;
  size: number;
  color: string;
  style?: any;
}

const iconMap: { [key: string]: any } = {
  'call': ReactIcons.IoCall,
  'call-outline': ReactIcons.IoCallOutline,
  'chatbubble': ReactIcons.IoChatbubble,
  'chatbubble-outline': ReactIcons.IoChatbubbleOutline,
  'person': ReactIcons.IoPerson,
  'person-outline': ReactIcons.IoPersonOutline,
  'chevron-back': ReactIcons.IoChevronBack,
  'camera': ReactIcons.IoCamera,
  'heart': ReactIcons.IoHeart,
  'heart-outline': ReactIcons.IoHeartOutline,
  'close': ReactIcons.IoClose,
  'mic': ReactIcons.IoMic,
  'mic-off': ReactIcons.IoMicOff,
  'videocam': ReactIcons.IoVideocam,
  'videocam-off': ReactIcons.IoVideocamOff,
  'volume-high': ReactIcons.IoVolumeHigh,
  'volume-mute': ReactIcons.IoVolumeMute,
  'log-out-outline': ReactIcons.IoLogOutOutline,
  'trash-outline': ReactIcons.IoTrashOutline,
  'sad-outline': ReactIcons.IoSadOutline,
  'send': ReactIcons.IoSend,
  'send-outline': ReactIcons.IoSendOutline,
  'ellipsis-vertical': ReactIcons.IoEllipsisVertical,
  'arrow-back': ReactIcons.IoArrowBack,
};

export default function Icon({ name, size, color, style }: IconProps) {
  if (Platform.OS === 'web') {
    const ReactIcon = iconMap[name] || ReactIcons.IoHelpCircle;
    return <ReactIcon size={size} color={color} style={style} />;
  } else {
    return <Ionicons name={name as any} size={size} color={color} style={style} />;
  }
}
