import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addDoc,
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
  where,
} from 'firebase/firestore';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, db, hasConfig } from '../lib/firebase';
import { BoxItem, ChatMessage, CommonBox, Notification, RouteState, ThemeMode, User } from '../types/models';

type Result = { ok: boolean; error?: string };

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
  toggleTheme: () => void;
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

const updateLocalItem = (boxes: CommonBox[], boxId: string, itemId: string, patch: Partial<BoxItem>) =>
  boxes.map((b) =>
    b.id === boxId
      ? { ...b, items: b.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }
      : b
  );

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

      setHydrated: (value) => set({ hasHydrated: value }),

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
                  selectedBoxId: state.selectedBoxId && boxes.some((b) => b.id === state.selectedBoxId)
                    ? state.selectedBoxId
                    : boxes[0]?.id,
                }));
              }
            )
          );
          unsubs.push(
            onSnapshot(query(collection(firestore, 'messages'), orderBy('createdAt', 'desc')), (snapshot) => {
              const messages = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessage, 'id'>) }));
              set({ messages });
            })
          );
          unsubs.push(
            onSnapshot(query(collection(firestore, 'notifications'), orderBy('createdAt', 'desc')), (snapshot) => {
              const notifications = snapshot.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<Notification, 'id'>),
              }));
              set({ notifications });
            })
          );

          realtimeUnsubscribe = () => {
            unsubs.forEach((fn) => fn());
            realtimeUnsubscribe = undefined;
          };
        });
      },

      stopRealtimeSync: () => {
        realtimeUnsubscribe?.();
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

      selectBox: (boxId) => set({ selectedBoxId: boxId, route: { name: 'home', boxId } }),

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
                actorUserId: currentUserId,
                message: `${currentUser.name} added ${target.name} as a friend.`,
                type: 'friend_added',
                createdAt: nowIso(),
                seenBy: [currentUserId],
              },
              ...state.notifications,
            ],
          }));
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

        await updateDoc(doc(firestore, 'users', currentUserId), { friendIds: arrayUnion(target.id) });
        await updateDoc(doc(firestore, 'users', target.id), { friendIds: arrayUnion(currentUserId) });
        await addDoc(collection(firestore, 'notifications'), {
          actorUserId: currentUserId,
          message: `${currentUser.name} added ${target.name} as a friend.`,
          type: 'friend_added',
          createdAt: nowIso(),
          seenBy: [currentUserId],
        });
        return { ok: true };
      },

      addBox: async (name, participantIds) => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) return { ok: false, error: 'Please log in first.' };
        const cleanName = name.trim();
        if (!cleanName) return { ok: false, error: 'Box name is required.' };

        const allParticipants = Array.from(new Set([currentUserId, ...participantIds]));

        if (!hasConfig || !db) {
          const newBox: CommonBox = { id: id(), name: cleanName, participantIds: allParticipants, items: [] };
          set((state) => ({
            boxes: [newBox, ...state.boxes],
            selectedBoxId: newBox.id,
            route: { name: 'home', boxId: newBox.id },
          }));
          return { ok: true };
        }

        const firestore = db;
        if (!firestore) return { ok: false, error: 'Firebase DB unavailable.' };
        const ref = await addDoc(collection(firestore, 'boxes'), {
          name: cleanName,
          participantIds: allParticipants,
          items: [],
        });
        set({ selectedBoxId: ref.id, route: { name: 'home', boxId: ref.id } });
        return { ok: true };
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
          return { ok: true };
        }

        const firestore = db;
        if (!firestore) return { ok: false, error: 'Firebase DB unavailable.' };
        await updateDoc(doc(firestore, 'boxes', boxId), { items: [newItem, ...targetBox.items] });
        return { ok: true };
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
                actorUserId: currentUserId,
                message: `${actor.name} raised a concern: "${item.label}" might not belong to ${owner.name}.`,
                type: 'ownership_concern',
                createdAt: nowIso(),
                seenBy: [currentUserId],
              },
              ...state.notifications,
            ],
          }));
          return;
        }

        const updatedItems = box.items.map((it) => (it.id === itemId ? { ...it, hasConcern: true } : it));
        const firestore = db;
        if (!firestore) return;
        await updateDoc(doc(firestore, 'boxes', boxId), { items: updatedItems });
        await addDoc(collection(firestore, 'notifications'), {
          boxId,
          itemId,
          actorUserId: currentUserId,
          message: `${actor.name} raised a concern: "${item.label}" might not belong to ${owner.name}.`,
          type: 'ownership_concern',
          createdAt: nowIso(),
          seenBy: [currentUserId],
        });
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
                actorUserId: currentUserId,
                message: `${claimant.name} claimed ownership of "${item.label}".`,
                type: 'ownership_claimed',
                createdAt: nowIso(),
                seenBy: [currentUserId],
              },
              ...state.notifications,
            ],
          }));
          return;
        }

        const updatedItems = box.items.map((it) =>
          it.id === itemId ? { ...it, ownerUserId: currentUserId, hasConcern: false } : it
        );
        const firestore = db;
        if (!firestore) return;
        await updateDoc(doc(firestore, 'boxes', boxId), { items: updatedItems });
        await addDoc(collection(firestore, 'notifications'), {
          boxId,
          itemId,
          actorUserId: currentUserId,
          message: `${claimant.name} claimed ownership of "${item.label}".`,
          type: 'ownership_claimed',
          createdAt: nowIso(),
          seenBy: [currentUserId],
        });
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
        await addDoc(collection(firestore, 'messages'), {
          boxId,
          senderUserId: currentUserId,
          text: cleanText,
          createdAt: message.createdAt,
        });
        return { ok: true };
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
        await updateDoc(doc(firestore, 'notifications', notificationId), {
          seenBy: arrayUnion(currentUserId),
        });
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
