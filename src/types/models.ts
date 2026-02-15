export type ThemeMode = 'light' | 'dark';

export type RouteName = 'home' | 'profile' | 'friends' | 'notifications' | 'chat';

export type NotificationType = 'ownership_concern' | 'ownership_claimed' | 'friend_added';

export type User = {
  id: string;
  name: string;
  email: string;
  friendIds: string[];
};

export type BoxItem = {
  id: string;
  boxId: string;
  label: string;
  ownerUserId: string;
  addedByUserId: string;
  createdAt: string;
  hasConcern: boolean;
};

export type ChatMessage = {
  id: string;
  boxId: string;
  senderUserId: string;
  text: string;
  createdAt: string;
};

export type Notification = {
  id: string;
  boxId?: string;
  itemId?: string;
  actorUserId: string;
  message: string;
  type: NotificationType;
  createdAt: string;
  seenBy: string[];
};

export type CommonBox = {
  id: string;
  name: string;
  participantIds: string[];
  items: BoxItem[];
};

export type RouteState = {
  name: RouteName;
  boxId?: string;
};
