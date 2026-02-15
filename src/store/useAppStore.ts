import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
  where,
} from 'firebase/firestore';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, db, hasConfig } from '../lib/firebase';
import { BoxItem, ChatMessage, CommonBox, Notification, RouteState, ThemeMode, User } from '../types/models';

type Result = { ok: boolean; error?: string };
type ToastTone = 'success' | 'error' | 'info';
type Toast = { id: string; message: string; tone: ToastTone };

type AppState = {
  themeMode: ThemeMode;
  users: User[];
  boxes: CommonBox[];
  messages: ChatMessage[];
  notifications: Notification[];
  currentUserId?: string;
  selectedBoxId?: string;
  route: RouteState;
  authReady: boolean;
  hasHydrated: boolean;
  firebaseEnabled: boolean;
  toast?: Toast;
  toggleTheme: () => void;
  showToast: (message: string, tone?: ToastTone) => void;
  clearToast: () => void;
  setHydrated: (value: boolean) => void;
  initializeAuthListener: () => void;
  stopRealtimeSync: () => void;
  signUp: (name: string, email: string, password: string) => Promise<Result>;
  signIn: (email: string, password: string) => Promise<Result>;
  logout: () => Promise<void>;
  navigate: (route: RouteState) => void;
  selectBox: (boxId: string) => void;
  addFriendByEmail: (email: string) => Promise<Result>;
  addBox: (name: string, participantIds: string[]) => Promise<Result>;
  addItem: (boxId: string, label: string, ownerUserId: string) => Promise<Result>;
  raiseConcern: (boxId: string, itemId: string) => Promise<void>;
  claimOwnership: (boxId: string, itemId: string) => Promise<void>;
  sendMessage: (boxId: string, text: string) => Promise<Result>;
  markNotificationSeen: (notificationId: string) => Promise<void>;
};

const nowIso = () => new Date().toISOString();
const id = () => Math.random().toString(36).slice(2, 10);

const demoUsers: User[] = [
  { id: 'u1', name: 'Ava', email: 'ava@svern.app', friendIds: ['u2'] },
  { id: 'u2', name: 'Ravi', email: 'ravi@svern.app', friendIds: ['u1', 'u3'] },
  { id: 'u3', name: 'Mina', email: 'mina@svern.app', friendIds: ['u2'] },
];

const demoBoxes: CommonBox[] = [
  {
    id: 'b1',
    name: 'Fridge',
    participantIds: ['u1', 'u2', 'u3'],
    items: [
      {
        id: 'i1',
        boxId: 'b1',
        label: 'Greek Yogurt',
        ownerUserId: 'u1',
        addedByUserId: 'u2',
        createdAt: nowIso(),
        hasConcern: false,
      },
    ],
  },
];

let authUnsubscribe: (() => void) | undefined;
let realtimeUnsubscribe: (() => void) | undefined;
let messagesUnsubscribe: (() => void) | undefined;
let bindMessageListenerToBox: ((boxId?: string) => void) | undefined;

const updateLocalItem = (boxes: CommonBox[], boxId: string, itemId: string, patch: Partial<BoxItem>) =>
  boxes.map((b) =>
    b.id === boxId
      ? { ...b, items: b.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }
      : b
  );

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withRetry = async <T>(operation: () => Promise<T>, retries = 2, baseDelayMs = 300): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
};

const sortByCreatedAtDesc = <T extends { createdAt: string }>(items: T[]) =>
  [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      themeMode: 'light',
      users: demoUsers,
      boxes: demoBoxes,
      messages: [],
      notifications: [],
      currentUserId: undefined,
      selectedBoxId: 'b1',
      route: { name: 'home', boxId: 'b1' },
      authReady: !hasConfig,
      hasHydrated: false,
      firebaseEnabled: hasConfig,
      toast: undefined,

      setHydrated: (value) => set({ hasHydrated: value }),

      showToast: (message, tone = 'info') => {
        const toast: Toast = { id: id(), message, tone };
        set({ toast });
        setTimeout(() => {
          if (get().toast?.id === toast.id) {
            set({ toast: undefined });
          }
        }, 3200);
      },

      clearToast: () => set({ toast: undefined }),

      toggleTheme: () => set((state) => ({ themeMode: state.themeMode === 'light' ? 'dark' : 'light' })),

      initializeAuthListener: () => {
        if (!hasConfig || !auth || !db || authUnsubscribe) {
          set({ authReady: true });
          return;
        }
        const firestore = db;

        authUnsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          if (!firebaseUser) {
            realtimeUnsubscribe?.();
            realtimeUnsubscribe = undefined;
            messagesUnsubscribe?.();
            messagesUnsubscribe = undefined;
            bindMessageListenerToBox = undefined;
            set({ currentUserId: undefined, authReady: true, route: { name: 'home' } });
            return;
          }

          const userRef = doc(firestore, 'users', firebaseUser.uid);
          const snap = await getDoc(userRef);
          if (!snap.exists()) {
            const email = firebaseUser.email?.toLowerCase() || '';
            const defaultName = firebaseUser.displayName || email.split('@')[0] || 'Svern User';
            await setDoc(userRef, {
              id: firebaseUser.uid,
              name: defaultName,
              email,
              friendIds: [],
            });
          }

          set({ currentUserId: firebaseUser.uid, authReady: true });
          get().stopRealtimeSync();

          const attachMessagesListener = (boxId?: string) => {
            messagesUnsubscribe?.();
            messagesUnsubscribe = undefined;
            if (!boxId) {
              set({ messages: [] });
              return;
            }
            messagesUnsubscribe = onSnapshot(
              query(
                collection(firestore, 'messages'),
                where('boxId', '==', boxId),
                orderBy('createdAt', 'desc')
              ),
              (snapshot) => {
                const messages = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessage, 'id'>) }));
                set({ messages });
              }
            );
          };
          bindMessageListenerToBox = attachMessagesListener;

          const unsubs: Array<() => void> = [];
          unsubs.push(
            onSnapshot(collection(firestore, 'users'), (snapshot) => {
              const users = snapshot.docs.map((d) => d.data() as User);
              set({ users });
            })
          );
          unsubs.push(
            onSnapshot(
              query(collection(firestore, 'boxes'), where('participantIds', 'array-contains', firebaseUser.uid)),
              (snapshot) => {
                const boxes = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CommonBox, 'id'>) }));
                set((state) => ({
                  boxes,
                  selectedBoxId:
                    state.selectedBoxId && boxes.some((b) => b.id === state.selectedBoxId)
                      ? state.selectedBoxId
                      : boxes[0]?.id,
                }));
                const selected =
                  get().selectedBoxId && boxes.some((b) => b.id === get().selectedBoxId)
                    ? get().selectedBoxId
                    : boxes[0]?.id;
                attachMessagesListener(selected);
              }
            )
          );
          unsubs.push(
            onSnapshot(
              query(
                collection(firestore, 'notifications'),
                where('audienceUserIds', 'array-contains', firebaseUser.uid),
                orderBy('createdAt', 'desc')
              ),
              (snapshot) => {
                const notifications = snapshot.docs.map((d) => ({
                  id: d.id,
                  ...(d.data() as Omit<Notification, 'id'>),
                }));
                set({ notifications });
              }
            )
          );

          realtimeUnsubscribe = () => {
            unsubs.forEach((fn) => fn());
            messagesUnsubscribe?.();
            messagesUnsubscribe = undefined;
            bindMessageListenerToBox = undefined;
            realtimeUnsubscribe = undefined;
          };
        });
      },

      stopRealtimeSync: () => {
        realtimeUnsubscribe?.();
        messagesUnsubscribe?.();
        bindMessageListenerToBox = undefined;
        messagesUnsubscribe = undefined;
        realtimeUnsubscribe = undefined;
      },

      signUp: async (name, email, password) => {
        const cleanName = name.trim();
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanName || !cleanEmail || !password.trim()) {
          return { ok: false, error: 'Name, email, and password are required.' };
        }

        if (!hasConfig || !auth || !db) {
          if (get().users.some((u) => u.email === cleanEmail)) return { ok: false, error: 'Email already exists.' };
          const newUser: User = { id: id(), name: cleanName, email: cleanEmail, friendIds: [] };
          set((state) => ({
            users: [...state.users, newUser],
            currentUserId: newUser.id,
            route: { name: 'home', boxId: state.selectedBoxId },
          }));
          return { ok: true };
        }

        try {
          const firestore = db;
          if (!firestore) return { ok: false, error: 'Firebase DB unavailable.' };
          const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
          await setDoc(doc(firestore, 'users', credential.user.uid), {
            id: credential.user.uid,
            name: cleanName,
            email: cleanEmail,
            friendIds: [],
          });
          return { ok: true };
        } catch (error) {
          return { ok: false, error: 'Sign up failed. Check credentials/config.' };
        }
      },

      signIn: async (email, password) => {
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail || !password.trim()) return { ok: false, error: 'Email and password are required.' };

        if (!hasConfig || !auth) {
          const existing = get().users.find((u) => u.email === cleanEmail);
          if (!existing) return { ok: false, error: 'Account not found. Try sign up.' };
          set((state) => ({
            currentUserId: existing.id,
            route: { name: 'home', boxId: state.selectedBoxId },
          }));
          return { ok: true };
        }

        try {
          await signInWithEmailAndPassword(auth, cleanEmail, password);
          return { ok: true };
        } catch {
          return { ok: false, error: 'Login failed. Check email/password.' };
        }
      },

      logout: async () => {
        if (hasConfig && auth) {
          await signOut(auth);
        } else {
          set({ currentUserId: undefined, route: { name: 'home' } });
        }
      },

      navigate: (route) => set({ route }),

      selectBox: (boxId) => {
        set({ selectedBoxId: boxId, route: { name: 'home', boxId } });
        bindMessageListenerToBox?.(boxId);
      },

      addFriendByEmail: async (email) => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) return { ok: false, error: 'Please log in first.' };

        const cleanEmail = email.trim().toLowerCase();
        const currentUser = get().users.find((u) => u.id === currentUserId);
        if (!currentUser) return { ok: false, error: 'Current user missing.' };

        if (!hasConfig || !db) {
          const target = get().users.find((u) => u.email === cleanEmail);
          if (!target) return { ok: false, error: 'No user found with that email.' };
          if (target.id === currentUserId) return { ok: false, error: 'You cannot add yourself.' };
          if (currentUser.friendIds.includes(target.id)) return { ok: false, error: 'Already friends.' };

          set((state) => ({
            users: state.users.map((u) => {
              if (u.id === currentUserId) return { ...u, friendIds: [...u.friendIds, target.id] };
              if (u.id === target.id) return { ...u, friendIds: [...u.friendIds, currentUserId] };
              return u;
            }),
            notifications: [
              {
                id: id(),
                audienceUserIds: [currentUserId, target.id],
                actorUserId: currentUserId,
                message: `${currentUser.name} added ${target.name} as a friend.`,
                type: 'friend_added',
                createdAt: nowIso(),
                seenBy: [currentUserId],
              },
              ...state.notifications,
            ],
          }));
          get().showToast('Friend added.', 'success');
          return { ok: true };
        }

        const firestore = db;
        if (!firestore) return { ok: false, error: 'Firebase DB unavailable.' };
        const targetQuery = query(collection(firestore, 'users'), where('email', '==', cleanEmail), limit(1));
        const querySnap = await getDocs(targetQuery);
        if (querySnap.empty) return { ok: false, error: 'No user found with that email.' };

        const target = querySnap.docs[0].data() as User;
        if (target.id === currentUserId) return { ok: false, error: 'You cannot add yourself.' };
        if (currentUser.friendIds.includes(target.id)) return { ok: false, error: 'Already friends.' };

        const previousUsers = get().users;
        const notificationId = id();
        const newNotification: Notification = {
          id: notificationId,
          audienceUserIds: [currentUserId, target.id],
          actorUserId: currentUserId,
          message: `${currentUser.name} added ${target.name} as a friend.`,
          type: 'friend_added',
          createdAt: nowIso(),
          seenBy: [currentUserId],
        };

        set((state) => ({
          users: state.users.map((u) => {
            if (u.id === currentUserId) return { ...u, friendIds: [...u.friendIds, target.id] };
            if (u.id === target.id) return { ...u, friendIds: [...u.friendIds, currentUserId] };
            return u;
          }),
          notifications: [newNotification, ...state.notifications],
        }));

        try {
          await withRetry(async () => {
            const batch = writeBatch(firestore);
            batch.update(doc(firestore, 'users', currentUserId), { friendIds: arrayUnion(target.id) });
            batch.update(doc(firestore, 'users', target.id), { friendIds: arrayUnion(currentUserId) });
            batch.set(doc(firestore, 'notifications', notificationId), {
              audienceUserIds: newNotification.audienceUserIds,
              actorUserId: currentUserId,
              message: newNotification.message,
              type: 'friend_added',
              createdAt: newNotification.createdAt,
              seenBy: [currentUserId],
            });
            await batch.commit();
          });
          get().showToast('Friend added.', 'success');
          return { ok: true };
        } catch {
          set({ users: previousUsers, notifications: get().notifications.filter((n) => n.id !== notificationId) });
          get().showToast('Failed to add friend. Please retry.', 'error');
          return { ok: false, error: 'Failed to add friend. Please retry.' };
        }
      },

      addBox: async (name, participantIds) => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) return { ok: false, error: 'Please log in first.' };
        const cleanName = name.trim();
        if (!cleanName) return { ok: false, error: 'Box name is required.' };

        const allParticipants = Array.from(new Set([currentUserId, ...participantIds]));
        const boxId = id();
        const newBox: CommonBox = { id: boxId, name: cleanName, participantIds: allParticipants, items: [] };

        if (!hasConfig || !db) {
          set((state) => ({
            boxes: [newBox, ...state.boxes],
            selectedBoxId: newBox.id,
            route: { name: 'home', boxId: newBox.id },
          }));
          get().showToast('CommonBox created.', 'success');
          return { ok: true };
        }

        const firestore = db;
        if (!firestore) return { ok: false, error: 'Firebase DB unavailable.' };
        const previousBoxes = get().boxes;
        set((state) => ({
          boxes: [newBox, ...state.boxes],
          selectedBoxId: boxId,
          route: { name: 'home', boxId },
        }));
        try {
          await withRetry(() =>
            setDoc(doc(firestore, 'boxes', boxId), {
              name: cleanName,
              participantIds: allParticipants,
              items: [],
            })
          );
          get().showToast('CommonBox created.', 'success');
          return { ok: true };
        } catch {
          set({ boxes: previousBoxes });
          get().showToast('Failed to create box. Please retry.', 'error');
          return { ok: false, error: 'Failed to create box. Please retry.' };
        }
      },

      addItem: async (boxId, label, ownerUserId) => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) return { ok: false, error: 'Please log in first.' };
        const cleanLabel = label.trim();
        if (!cleanLabel) return { ok: false, error: 'Item name is required.' };

        const targetBox = get().boxes.find((b) => b.id === boxId);
        if (!targetBox) return { ok: false, error: 'Box not found.' };
        if (!targetBox.participantIds.includes(ownerUserId)) {
          return { ok: false, error: 'Owner must be a participant in this box.' };
        }

        const newItem: BoxItem = {
          id: id(),
          boxId,
          label: cleanLabel,
          ownerUserId,
          addedByUserId: currentUserId,
          createdAt: nowIso(),
          hasConcern: false,
        };

        if (!hasConfig || !db) {
          set((state) => ({
            boxes: state.boxes.map((b) => (b.id === boxId ? { ...b, items: [newItem, ...b.items] } : b)),
          }));
          get().showToast('Item added.', 'success');
          return { ok: true };
        }

        const firestore = db;
        if (!firestore) return { ok: false, error: 'Firebase DB unavailable.' };
        const previousBoxes = get().boxes;
        const optimisticItems = [newItem, ...targetBox.items];
        set((state) => ({
          boxes: state.boxes.map((b) => (b.id === boxId ? { ...b, items: optimisticItems } : b)),
        }));
        try {
          await withRetry(() => updateDoc(doc(firestore, 'boxes', boxId), { items: optimisticItems }));
          get().showToast('Item added.', 'success');
          return { ok: true };
        } catch {
          set({ boxes: previousBoxes });
          get().showToast('Failed to add item. Please retry.', 'error');
          return { ok: false, error: 'Failed to add item. Please retry.' };
        }
      },

      raiseConcern: async (boxId, itemId) => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) return;
        const box = get().boxes.find((b) => b.id === boxId);
        const item = box?.items.find((i) => i.id === itemId);
        if (!box || !item || item.ownerUserId === currentUserId) return;

        const actor = get().users.find((u) => u.id === currentUserId);
        const owner = get().users.find((u) => u.id === item.ownerUserId);
        if (!actor || !owner) return;

        if (!hasConfig || !db) {
          set((state) => ({
            boxes: updateLocalItem(state.boxes, boxId, itemId, { hasConcern: true }),
            notifications: [
              {
                id: id(),
                boxId,
                itemId,
                audienceUserIds: box.participantIds,
                actorUserId: currentUserId,
                message: `${actor.name} raised a concern: "${item.label}" might not belong to ${owner.name}.`,
                type: 'ownership_concern',
                createdAt: nowIso(),
                seenBy: [currentUserId],
              },
              ...state.notifications,
            ],
          }));
          get().showToast('Concern raised.', 'success');
          return;
        }

        const updatedItems = box.items.map((it) => (it.id === itemId ? { ...it, hasConcern: true } : it));
        const firestore = db;
        if (!firestore) return;
        const previousBoxes = get().boxes;
        const notificationId = id();
        const notification: Notification = {
          id: notificationId,
          boxId,
          itemId,
          audienceUserIds: box.participantIds,
          actorUserId: currentUserId,
          message: `${actor.name} raised a concern: "${item.label}" might not belong to ${owner.name}.`,
          type: 'ownership_concern',
          createdAt: nowIso(),
          seenBy: [currentUserId],
        };
        set((state) => ({
          boxes: updateLocalItem(state.boxes, boxId, itemId, { hasConcern: true }),
          notifications: [notification, ...state.notifications],
        }));
        try {
          await withRetry(async () => {
            const batch = writeBatch(firestore);
            batch.update(doc(firestore, 'boxes', boxId), { items: updatedItems });
            batch.set(doc(firestore, 'notifications', notificationId), {
              boxId,
              itemId,
              audienceUserIds: box.participantIds,
              actorUserId: currentUserId,
              message: notification.message,
              type: 'ownership_concern',
              createdAt: notification.createdAt,
              seenBy: [currentUserId],
            });
            await batch.commit();
          });
          get().showToast('Concern raised.', 'success');
        } catch {
          set({ boxes: previousBoxes, notifications: get().notifications.filter((n) => n.id !== notificationId) });
          get().showToast('Failed to raise concern. Please retry.', 'error');
        }
      },

      claimOwnership: async (boxId, itemId) => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) return;
        const box = get().boxes.find((b) => b.id === boxId);
        const item = box?.items.find((i) => i.id === itemId);
        const claimant = get().users.find((u) => u.id === currentUserId);
        if (!box || !item || !claimant) return;

        if (!hasConfig || !db) {
          set((state) => ({
            boxes: updateLocalItem(state.boxes, boxId, itemId, {
              ownerUserId: currentUserId,
              hasConcern: false,
            }),
            notifications: [
              {
                id: id(),
                boxId,
                itemId,
                audienceUserIds: box.participantIds,
                actorUserId: currentUserId,
                message: `${claimant.name} claimed ownership of "${item.label}".`,
                type: 'ownership_claimed',
                createdAt: nowIso(),
                seenBy: [currentUserId],
              },
              ...state.notifications,
            ],
          }));
          get().showToast('Ownership claimed.', 'success');
          return;
        }

        const updatedItems = box.items.map((it) =>
          it.id === itemId ? { ...it, ownerUserId: currentUserId, hasConcern: false } : it
        );
        const firestore = db;
        if (!firestore) return;
        const previousBoxes = get().boxes;
        const notificationId = id();
        const notification: Notification = {
          id: notificationId,
          boxId,
          itemId,
          audienceUserIds: box.participantIds,
          actorUserId: currentUserId,
          message: `${claimant.name} claimed ownership of "${item.label}".`,
          type: 'ownership_claimed',
          createdAt: nowIso(),
          seenBy: [currentUserId],
        };
        set((state) => ({
          boxes: updateLocalItem(state.boxes, boxId, itemId, {
            ownerUserId: currentUserId,
            hasConcern: false,
          }),
          notifications: [notification, ...state.notifications],
        }));
        try {
          await withRetry(async () => {
            const batch = writeBatch(firestore);
            batch.update(doc(firestore, 'boxes', boxId), { items: updatedItems });
            batch.set(doc(firestore, 'notifications', notificationId), {
              boxId,
              itemId,
              audienceUserIds: box.participantIds,
              actorUserId: currentUserId,
              message: notification.message,
              type: 'ownership_claimed',
              createdAt: notification.createdAt,
              seenBy: [currentUserId],
            });
            await batch.commit();
          });
          get().showToast('Ownership claimed.', 'success');
        } catch {
          set({ boxes: previousBoxes, notifications: get().notifications.filter((n) => n.id !== notificationId) });
          get().showToast('Failed to claim ownership. Please retry.', 'error');
        }
      },

      sendMessage: async (boxId, text) => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) return { ok: false, error: 'Please log in first.' };
        const cleanText = text.trim();
        if (!cleanText) return { ok: false, error: 'Message cannot be empty.' };

        const message: ChatMessage = {
          id: id(),
          boxId,
          senderUserId: currentUserId,
          text: cleanText,
          createdAt: nowIso(),
        };

        if (!hasConfig || !db) {
          set((state) => ({ messages: [message, ...state.messages] }));
          return { ok: true };
        }

        const firestore = db;
        if (!firestore) return { ok: false, error: 'Firebase DB unavailable.' };
        const previousMessages = get().messages;
        set((state) => ({ messages: [message, ...state.messages] }));
        try {
          await withRetry(() =>
            setDoc(doc(firestore, 'messages', message.id), {
              boxId,
              senderUserId: currentUserId,
              text: cleanText,
              createdAt: message.createdAt,
            })
          );
          return { ok: true };
        } catch {
          set({ messages: previousMessages });
          get().showToast('Failed to send message. Please retry.', 'error');
          return { ok: false, error: 'Failed to send message. Please retry.' };
        }
      },

      markNotificationSeen: async (notificationId) => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) return;

        const localNotification = get().notifications.find((n) => n.id === notificationId);
        if (!localNotification || localNotification.seenBy.includes(currentUserId)) return;

        if (!hasConfig || !db) {
          set((state) => ({
            notifications: state.notifications.map((n) =>
              n.id === notificationId ? { ...n, seenBy: [...n.seenBy, currentUserId] } : n
            ),
          }));
          return;
        }

        const firestore = db;
        if (!firestore) return;
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === notificationId ? { ...n, seenBy: [...n.seenBy, currentUserId] } : n
          ),
        }));
        try {
          await withRetry(() =>
            updateDoc(doc(firestore, 'notifications', notificationId), {
              seenBy: arrayUnion(currentUserId),
            })
          );
        } catch {
          set((state) => ({
            notifications: state.notifications.map((n) =>
              n.id === notificationId ? { ...n, seenBy: n.seenBy.filter((idValue) => idValue !== currentUserId) } : n
            ),
          }));
        }
      },
    }),
    {
      name: 'svern-cache-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        themeMode: state.themeMode,
        users: state.users,
        boxes: state.boxes,
        messages: state.messages,
        notifications: state.notifications,
        currentUserId: state.currentUserId,
        selectedBoxId: state.selectedBoxId,
        route: state.route,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);
