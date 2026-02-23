import AsyncStorage from '@react-native-async-storage/async-storage';
import { FirebaseError } from 'firebase/app';
import {
  arrayRemove,
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
import {
  createUserWithEmailAndPassword,
  deleteUser,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
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
  signInWithGoogle: (idToken: string) => Promise<Result>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<Result>;
  navigate: (route: RouteState) => void;
  selectBox: (boxId: string) => void;
  addFriendByEmail: (email: string) => Promise<Result>;
  acceptFriendRequest: (notificationId: string) => Promise<Result>;
  rejectFriendRequest: (notificationId: string) => Promise<Result>;
  cancelFriendRequest: (notificationId: string) => Promise<Result>;
  addBox: (name: string, participantIds: string[]) => Promise<Result>;
  addItem: (boxId: string, label: string, ownerUserId: string) => Promise<Result>;
  raiseConcern: (boxId: string, itemId: string) => Promise<void>;
  claimOwnership: (boxId: string, itemId: string) => Promise<void>;
  sendMessage: (boxId: string, text: string) => Promise<Result>;
  markNotificationSeen: (notificationId: string) => Promise<void>;
};

const nowIso = () => new Date().toISOString();
const id = () => Math.random().toString(36).slice(2, 10);
const toUsername = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '_');
const formatFirebaseError = (error: unknown, fallback: string) => {
  if (error instanceof FirebaseError) {
    return `${fallback} (${error.code}: ${error.message})`;
  }
  if (error instanceof Error) {
    return `${fallback} (${error.message})`;
  }
  return fallback;
};

const demoUsers: User[] = [
  { id: 'u1', name: 'Ava', username: 'ava', email: 'ava@svern.app', friendIds: ['u2'] },
  { id: 'u2', name: 'Ravi', username: 'ravi', email: 'ravi@svern.app', friendIds: ['u1', 'u3'] },
  { id: 'u3', name: 'Mina', username: 'mina', email: 'mina@svern.app', friendIds: ['u2'] },
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

      setHydrated: (value) => {
        console.log('[store] setHydrated', value);
        set({ hasHydrated: value });
      },

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
        console.log('[store] initializeAuthListener:start', {
          hasConfig,
          hasAuth: Boolean(auth),
          hasDb: Boolean(db),
          hasUnsubscribe: Boolean(authUnsubscribe),
        });
        if (!hasConfig || !auth || !db || authUnsubscribe) {
          console.log('[store] initializeAuthListener:skip -> authReady=true');
          set({ authReady: true });
          return;
        }
        const firestore = db;
        console.log('[store] initializeAuthListener:attach listener');
        set({ authReady: true });

        authUnsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          console.log('[store] onAuthStateChanged', {
            signedIn: Boolean(firebaseUser),
            uid: firebaseUser?.uid ?? null,
          });
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
            console.log('[store] user doc missing -> creating', { uid: firebaseUser.uid });
            const email = firebaseUser.email?.toLowerCase() || '';
            const defaultName = firebaseUser.displayName || email.split('@')[0] || 'Svern User';
            const username = toUsername(defaultName) || 'svern_user';
            await setDoc(userRef, {
              id: firebaseUser.uid,
              name: defaultName,
              username,
              email,
              friendIds: [],
            });
            console.log('[store] user doc created', { uid: firebaseUser.uid });
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
          const userMap = new Map<string, User>();
          const syncUsers = () => set({ users: Array.from(userMap.values()) });
          unsubs.push(
            onSnapshot(doc(firestore, 'users', firebaseUser.uid), (snapshot) => {
              if (snapshot.exists()) {
                const selfUser = snapshot.data() as User;
                userMap.set(selfUser.id, selfUser);
              } else {
                userMap.delete(firebaseUser.uid);
              }
              syncUsers();
            })
          );
          unsubs.push(
            onSnapshot(
              query(collection(firestore, 'users'), where('friendIds', 'array-contains', firebaseUser.uid)),
              (snapshot) => {
                const selfUser = userMap.get(firebaseUser.uid);
                userMap.clear();
                if (selfUser) userMap.set(selfUser.id, selfUser);
                snapshot.docs.forEach((d) => {
                  const friendUser = d.data() as User;
                  userMap.set(friendUser.id, friendUser);
                });
                syncUsers();
              }
            )
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
              query(collection(firestore, 'notifications'), where('audienceUserIds', 'array-contains', firebaseUser.uid)),
              (snapshot) => {
                const notifications = sortByCreatedAtDesc(snapshot.docs.map((d) => ({
                  id: d.id,
                  ...(d.data() as Omit<Notification, 'id'>),
                })));
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
        const username = toUsername(cleanName);
        if (!cleanName || !cleanEmail || !password.trim()) {
          return { ok: false, error: 'Name, email, and password are required.' };
        }

        if (!hasConfig || !auth || !db) {
          if (get().users.some((u) => u.email === cleanEmail)) {
            return { ok: false, error: 'An account with this email already exists.' };
          }
          const newUser: User = { id: id(), name: cleanName, username, email: cleanEmail, friendIds: [] };
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
            username,
            email: cleanEmail,
            friendIds: [],
          });
          return { ok: true };
        } catch (error) {
          if (error instanceof FirebaseError && error.code === 'auth/email-already-in-use') {
            try {
              await signInWithEmailAndPassword(auth, cleanEmail, password);
              return { ok: true };
            } catch {
              return {
                ok: false,
                error:
                  'This email already exists in Firebase Authentication. Use Sign in, reset the password, or delete the user from Firebase Authentication.',
              };
            }
          }
          return { ok: false, error: formatFirebaseError(error, 'Sign up failed') };
        }
      },

      signIn: async (email, password) => {
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail || !password.trim()) {
          return { ok: false, error: 'Please enter both username and password.' };
        }

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
        } catch (error) {
          if (
            error instanceof FirebaseError &&
            ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(
              error.code
            )
          ) {
            return { ok: false, error: 'Incorrect username or password.' };
          }
          return { ok: false, error: formatFirebaseError(error, 'Login failed') };
        }
      },

      signInWithGoogle: async (idToken) => {
        if (!idToken.trim()) return { ok: false, error: 'Google ID token is missing.' };
        if (!hasConfig || !auth || !db) {
          return { ok: false, error: 'Google sign-in requires Firebase config.' };
        }
        try {
          const credential = GoogleAuthProvider.credential(idToken);
          await signInWithCredential(auth, credential);
          return { ok: true };
        } catch (error) {
          return { ok: false, error: formatFirebaseError(error, 'Google sign-in failed') };
        }
      },

      logout: async () => {
        if (hasConfig && auth) {
          await signOut(auth);
        } else {
          set({ currentUserId: undefined, route: { name: 'home' } });
        }
      },

      deleteAccount: async () => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) return { ok: false, error: 'Please log in first.' };

        if (!hasConfig || !auth || !db) {
          set((state) => ({
            users: state.users.filter((u) => u.id !== currentUserId).map((u) => ({
              ...u,
              friendIds: u.friendIds.filter((idValue) => idValue !== currentUserId),
            })),
            boxes: state.boxes
              .map((b) => ({
                ...b,
                participantIds: b.participantIds.filter((idValue) => idValue !== currentUserId),
                items: b.items.filter((it) => it.ownerUserId !== currentUserId && it.addedByUserId !== currentUserId),
              }))
              .filter((b) => b.participantIds.length > 0),
            messages: state.messages.filter((m) => m.senderUserId !== currentUserId),
            notifications: state.notifications.filter(
              (n) => n.actorUserId !== currentUserId && !n.audienceUserIds.includes(currentUserId)
            ),
            currentUserId: undefined,
            selectedBoxId: undefined,
            route: { name: 'home' },
          }));
          get().showToast('Account deleted.', 'success');
          return { ok: true };
        }

        const firestore = db;
        const authUser = auth.currentUser;
        if (!firestore || !authUser || authUser.uid !== currentUserId) {
          return { ok: false, error: 'Session mismatch. Please sign in again.' };
        }
        const lastSignInMs = authUser.metadata.lastSignInTime
          ? new Date(authUser.metadata.lastSignInTime).getTime()
          : 0;
        if (!lastSignInMs || Date.now() - lastSignInMs > 4 * 60 * 1000) {
          const message = 'For security, sign in again and then retry account deletion.';
          get().showToast(message, 'error');
          return { ok: false, error: message };
        }

        const previousUsers = get().users;
        const previousBoxes = get().boxes;
        const previousMessages = get().messages;
        const previousNotifications = get().notifications;

        try {
          const friendDocs = await getDocs(
            query(collection(firestore, 'users'), where('friendIds', 'array-contains', currentUserId))
          );
          const boxDocs = await getDocs(
            query(collection(firestore, 'boxes'), where('participantIds', 'array-contains', currentUserId))
          );

          await withRetry(async () => {
            const batch = writeBatch(firestore);

            friendDocs.docs.forEach((d) => {
              batch.update(doc(firestore, 'users', d.id), {
                friendIds: arrayRemove(currentUserId),
              });
            });

            boxDocs.docs.forEach((d) => {
              const box = d.data() as Omit<CommonBox, 'id'>;
              const participantIds = (box.participantIds || []).filter((idValue) => idValue !== currentUserId);
              const items = (box.items || []).filter(
                (it) => it.ownerUserId !== currentUserId && it.addedByUserId !== currentUserId
              );
              if (participantIds.length === 0) {
                batch.delete(doc(firestore, 'boxes', d.id));
              } else {
                batch.update(doc(firestore, 'boxes', d.id), {
                  participantIds,
                  items,
                });
              }
            });

            batch.delete(doc(firestore, 'users', currentUserId));
            await batch.commit();
          });

          await deleteUser(authUser);
          set({
            users: previousUsers.filter((u) => u.id !== currentUserId).map((u) => ({
              ...u,
              friendIds: u.friendIds.filter((idValue) => idValue !== currentUserId),
            })),
            boxes: previousBoxes
              .map((b) => ({
                ...b,
                participantIds: b.participantIds.filter((idValue) => idValue !== currentUserId),
                items: b.items.filter((it) => it.ownerUserId !== currentUserId && it.addedByUserId !== currentUserId),
              }))
              .filter((b) => b.participantIds.length > 0),
            messages: previousMessages.filter((m) => m.senderUserId !== currentUserId),
            notifications: previousNotifications.filter(
              (n) => n.actorUserId !== currentUserId && !n.audienceUserIds.includes(currentUserId)
            ),
            currentUserId: undefined,
            selectedBoxId: undefined,
            route: { name: 'home' },
          });
          get().showToast('Account deleted.', 'success');
          return { ok: true };
        } catch (error) {
          const isRecentLoginError =
            error instanceof FirebaseError && error.code === 'auth/requires-recent-login';
          const message = isRecentLoginError
            ? 'Please sign in again, then delete account.'
            : formatFirebaseError(error, 'Failed to delete account');
          get().showToast(message, 'error');
          return { ok: false, error: message };
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
        const resolveTarget = async () => {
          if (!hasConfig || !db) {
            const target = get().users.find((u) => u.email === cleanEmail);
            return target;
          }
          const firestore = db;
          if (!firestore) return undefined;
          const targetQuery = query(collection(firestore, 'users'), where('email', '==', cleanEmail), limit(1));
          const querySnap = await getDocs(targetQuery);
          if (querySnap.empty) return undefined;
          return querySnap.docs[0].data() as User;
        };

        const target = await resolveTarget();
        if (!target) return { ok: false, error: 'No user found with that email.' };
        if (target.id === currentUserId) return { ok: false, error: 'You cannot add yourself.' };
        if (currentUser.friendIds.includes(target.id)) return { ok: false, error: 'Already friends.' };

        const notifications = get().notifications;
        const outgoingPending = notifications.find(
          (n) =>
            n.type === 'friend_request' &&
            !n.closedAt &&
            n.actorUserId === currentUserId &&
            n.audienceUserIds.includes(target.id)
        );
        if (outgoingPending) return { ok: false, error: 'Friend request already sent.' };

        const incomingPending = notifications.find(
          (n) =>
            n.type === 'friend_request' &&
            !n.closedAt &&
            n.actorUserId === target.id &&
            n.audienceUserIds.includes(currentUserId)
        );
        if (incomingPending) {
          return get().acceptFriendRequest(incomingPending.id);
        }

        const requestId = id();
        const requestNotification: Notification = {
          id: requestId,
          audienceUserIds: [currentUserId, target.id],
          actorUserId: currentUserId,
          message: `${currentUser.name} sent you a friend request.`,
          type: 'friend_request',
          createdAt: nowIso(),
          seenBy: [currentUserId],
        };

        if (!hasConfig || !db) {
          set((state) => ({ notifications: [requestNotification, ...state.notifications] }));
          get().showToast('Friend request sent.', 'success');
          return { ok: true };
        }

        const firestore = db;
        if (!firestore) return { ok: false, error: 'Firebase DB unavailable.' };

        set((state) => ({ notifications: [requestNotification, ...state.notifications] }));
        try {
          await withRetry(() =>
            setDoc(doc(firestore, 'notifications', requestId), {
              audienceUserIds: requestNotification.audienceUserIds,
              actorUserId: requestNotification.actorUserId,
              message: requestNotification.message,
              type: requestNotification.type,
              createdAt: requestNotification.createdAt,
              seenBy: requestNotification.seenBy,
            })
          );
          get().showToast('Friend request sent.', 'success');
          return { ok: true };
        } catch {
          set((state) => ({ notifications: state.notifications.filter((n) => n.id !== requestId) }));
          get().showToast('Failed to send friend request. Please retry.', 'error');
          return { ok: false, error: 'Failed to send friend request. Please retry.' };
        }
      },

      acceptFriendRequest: async (notificationId) => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) {
          get().showToast('Please log in first.', 'error');
          return { ok: false, error: 'Please log in first.' };
        }

        const request = get().notifications.find((n) => n.id === notificationId);
        if (!request || request.type !== 'friend_request' || request.closedAt) {
          get().showToast('Friend request not found.', 'error');
          return { ok: false, error: 'Friend request not found.' };
        }
        if (request.actorUserId === currentUserId) {
          get().showToast('You cannot accept your own request.', 'error');
          return { ok: false, error: 'You cannot accept your own request.' };
        }
        if (!request.audienceUserIds.includes(currentUserId)) {
          get().showToast('You cannot accept this request.', 'error');
          return { ok: false, error: 'You cannot accept this request.' };
        }

        const requesterId = request.actorUserId;
        const accepter = get().users.find((u) => u.id === currentUserId);
        if (!accepter) {
          get().showToast('Current user not found.', 'error');
          return { ok: false, error: 'Current user not found.' };
        }
        if (accepter.friendIds.includes(requesterId)) {
          get().showToast('Already friends.', 'info');
          return { ok: false, error: 'Already friends.' };
        }

        const closedAt = nowIso();
        const requestIdsToClose = get()
          .notifications.filter(
            (n) =>
              n.type === 'friend_request' &&
              !n.closedAt &&
              ((n.actorUserId === requesterId && n.audienceUserIds.includes(accepter.id)) ||
                (n.actorUserId === accepter.id && n.audienceUserIds.includes(requesterId)))
          )
          .map((n) => n.id);
        const acceptanceId = id();
        const acceptance: Notification = {
          id: acceptanceId,
          audienceUserIds: [requesterId, accepter.id],
          actorUserId: currentUserId,
          message: `${accepter.name} accepted your friend request.`,
          type: 'friend_added',
          createdAt: closedAt,
          seenBy: [currentUserId],
        };

        const previousUsers = get().users;
        const previousNotifications = get().notifications;

        set((state) => ({
          users: state.users.map((u) => {
            if (u.id === requesterId) return { ...u, friendIds: Array.from(new Set([...u.friendIds, accepter.id])) };
            if (u.id === accepter.id) return { ...u, friendIds: Array.from(new Set([...u.friendIds, requesterId])) };
            return u;
          }),
          notifications: [
            acceptance,
            ...state.notifications.map((n) =>
              requestIdsToClose.includes(n.id)
                ? { ...n, closedAt, seenBy: Array.from(new Set([...n.seenBy, currentUserId])) }
                : n
            ),
          ],
        }));

        if (!hasConfig || !db) {
          get().showToast('Friend request accepted.', 'success');
          return { ok: true };
        }

        const firestore = db;
        if (!firestore) return { ok: false, error: 'Firebase DB unavailable.' };
        try {
          await withRetry(async () => {
            const batch = writeBatch(firestore);
            batch.update(doc(firestore, 'users', requesterId), { friendIds: arrayUnion(accepter.id) });
            batch.update(doc(firestore, 'users', accepter.id), { friendIds: arrayUnion(requesterId) });
            requestIdsToClose.forEach((requestId) => {
              batch.update(doc(firestore, 'notifications', requestId), {
                closedAt,
                seenBy: arrayUnion(currentUserId),
              });
            });
            batch.set(doc(firestore, 'notifications', acceptanceId), {
              audienceUserIds: acceptance.audienceUserIds,
              actorUserId: acceptance.actorUserId,
              message: acceptance.message,
              type: acceptance.type,
              createdAt: acceptance.createdAt,
              seenBy: acceptance.seenBy,
            });
            await batch.commit();
          });
          get().showToast('Friend request accepted.', 'success');
          return { ok: true };
        } catch (error) {
          set({ users: previousUsers, notifications: previousNotifications });
          const isPermissionError = error instanceof FirebaseError && error.code === 'permission-denied';
          const message = isPermissionError
            ? 'Accept failed: Firestore rules are blocking friend updates. Deploy latest firestore.rules.'
            : formatFirebaseError(error, 'Failed to accept friend request. Please retry.');
          get().showToast(message, 'error');
          return { ok: false, error: message };
        }
      },

      rejectFriendRequest: async (notificationId) => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) return { ok: false, error: 'Please log in first.' };

        const request = get().notifications.find((n) => n.id === notificationId);
        if (!request || request.type !== 'friend_request' || request.closedAt) {
          return { ok: false, error: 'Friend request not found.' };
        }
        if (request.actorUserId === currentUserId) {
          return { ok: false, error: 'Use cancel for your own request.' };
        }
        if (!request.audienceUserIds.includes(currentUserId)) {
          return { ok: false, error: 'You cannot reject this request.' };
        }

        const closedAt = nowIso();
        const previousNotifications = get().notifications;
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === request.id ? { ...n, closedAt, seenBy: Array.from(new Set([...n.seenBy, currentUserId])) } : n
          ),
        }));

        if (!hasConfig || !db) {
          get().showToast('Friend request rejected.', 'success');
          return { ok: true };
        }

        const firestore = db;
        if (!firestore) return { ok: false, error: 'Firebase DB unavailable.' };
        try {
          await withRetry(() =>
            updateDoc(doc(firestore, 'notifications', request.id), {
              closedAt,
              seenBy: arrayUnion(currentUserId),
            })
          );
          get().showToast('Friend request rejected.', 'success');
          return { ok: true };
        } catch {
          set({ notifications: previousNotifications });
          get().showToast('Failed to reject friend request. Please retry.', 'error');
          return { ok: false, error: 'Failed to reject friend request. Please retry.' };
        }
      },

      cancelFriendRequest: async (notificationId) => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) return { ok: false, error: 'Please log in first.' };

        const request = get().notifications.find((n) => n.id === notificationId);
        if (!request || request.type !== 'friend_request' || request.closedAt) {
          return { ok: false, error: 'Friend request not found.' };
        }
        if (request.actorUserId !== currentUserId) {
          return { ok: false, error: 'You can only cancel your own request.' };
        }

        const closedAt = nowIso();
        const previousNotifications = get().notifications;
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === request.id ? { ...n, closedAt, seenBy: Array.from(new Set([...n.seenBy, currentUserId])) } : n
          ),
        }));

        if (!hasConfig || !db) {
          get().showToast('Friend request canceled.', 'success');
          return { ok: true };
        }

        const firestore = db;
        if (!firestore) return { ok: false, error: 'Firebase DB unavailable.' };
        try {
          await withRetry(() =>
            updateDoc(doc(firestore, 'notifications', request.id), {
              closedAt,
              seenBy: arrayUnion(currentUserId),
            })
          );
          get().showToast('Friend request canceled.', 'success');
          return { ok: true };
        } catch {
          set({ notifications: previousNotifications });
          get().showToast('Failed to cancel friend request. Please retry.', 'error');
          return { ok: false, error: 'Failed to cancel friend request. Please retry.' };
        }
      },

      addBox: async (name, participantIds) => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) return { ok: false, error: 'Please log in first.' };
        const cleanName = name.trim();
        if (!cleanName) return { ok: false, error: 'Box name is required.' };
        const creator = get().users.find((u) => u.id === currentUserId);

        const allParticipants = Array.from(new Set([currentUserId, ...participantIds]));
        const boxId = id();
        const newBox: CommonBox = { id: boxId, name: cleanName, participantIds: allParticipants, items: [] };
        const notificationId = id();
        const boxCreatedNotification: Notification = {
          id: notificationId,
          boxId,
          audienceUserIds: allParticipants,
          actorUserId: currentUserId,
          message: `${creator?.name || 'A user'} created CommonBox "${cleanName}".`,
          type: 'box_created',
          createdAt: nowIso(),
          seenBy: [currentUserId],
        };

        if (!hasConfig || !db) {
          set((state) => ({
            boxes: [newBox, ...state.boxes],
            notifications: [boxCreatedNotification, ...state.notifications],
            selectedBoxId: newBox.id,
            route: { name: 'home', boxId: newBox.id },
          }));
          get().showToast('CommonBox created.', 'success');
          return { ok: true };
        }

        const firestore = db;
        if (!firestore) return { ok: false, error: 'Firebase DB unavailable.' };
        const previousBoxes = get().boxes;
        const previousNotifications = get().notifications;
        set((state) => ({
          boxes: [newBox, ...state.boxes],
          notifications: [boxCreatedNotification, ...state.notifications],
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
          try {
            await withRetry(() =>
              setDoc(doc(firestore, 'notifications', notificationId), {
                boxId,
                audienceUserIds: boxCreatedNotification.audienceUserIds,
                actorUserId: boxCreatedNotification.actorUserId,
                message: boxCreatedNotification.message,
                type: boxCreatedNotification.type,
                createdAt: boxCreatedNotification.createdAt,
                seenBy: boxCreatedNotification.seenBy,
              })
            );
          } catch {
            set((state) => ({
              notifications: state.notifications.filter((n) => n.id !== notificationId),
            }));
          }
          get().showToast('CommonBox created.', 'success');
          return { ok: true };
        } catch (error) {
          set({ boxes: previousBoxes, notifications: previousNotifications });
          const message = formatFirebaseError(error, 'Failed to create box. Please retry.');
          get().showToast(message, 'error');
          return { ok: false, error: message };
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
          const closedAt = nowIso();
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
                createdAt: closedAt,
                seenBy: [currentUserId],
              },
              ...state.notifications.map((n) =>
                n.type === 'ownership_concern' && n.boxId === boxId && n.itemId === itemId && !n.closedAt
                  ? { ...n, closedAt }
                  : n
              ),
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
        const previousNotifications = get().notifications;
        const closedAt = nowIso();
        const concernNotificationIds = previousNotifications
          .filter((n) => n.type === 'ownership_concern' && n.boxId === boxId && n.itemId === itemId && !n.closedAt)
          .map((n) => n.id);
        const notificationId = id();
        const notification: Notification = {
          id: notificationId,
          boxId,
          itemId,
          audienceUserIds: box.participantIds,
          actorUserId: currentUserId,
          message: `${claimant.name} claimed ownership of "${item.label}".`,
          type: 'ownership_claimed',
          createdAt: closedAt,
          seenBy: [currentUserId],
        };
        set((state) => ({
          boxes: updateLocalItem(state.boxes, boxId, itemId, {
            ownerUserId: currentUserId,
            hasConcern: false,
          }),
          notifications: [
            notification,
            ...state.notifications.map((n) =>
              concernNotificationIds.includes(n.id) ? { ...n, closedAt } : n
            ),
          ],
        }));
        try {
          await withRetry(async () => {
            const batch = writeBatch(firestore);
            batch.update(doc(firestore, 'boxes', boxId), { items: updatedItems });
            concernNotificationIds.forEach((concernId) => {
              batch.update(doc(firestore, 'notifications', concernId), { closedAt });
            });
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
          set({ boxes: previousBoxes, notifications: previousNotifications });
          get().showToast('Failed to claim ownership. Please retry.', 'error');
        }
      },

      sendMessage: async (boxId, text) => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) return { ok: false, error: 'Please log in first.' };
        const cleanText = text.trim();
        if (!cleanText) return { ok: false, error: 'Message cannot be empty.' };
        const box = get().boxes.find((b) => b.id === boxId);
        if (!box) return { ok: false, error: 'Box not found.' };
        if (!box.participantIds.includes(currentUserId)) return { ok: false, error: 'You are not part of this box.' };
        const users = get().users;
        const me = users.find((u) => u.id === currentUserId);
        if (!me) return { ok: false, error: 'Current user missing.' };

        const mentionHandles = Array.from(
          new Set(
            [...cleanText.matchAll(/@([a-zA-Z0-9_]+)/g)].map((match) => match[1].trim().toLowerCase()).filter(Boolean)
          )
        );
        const mentionedUsers = users.filter(
          (u) =>
            u.id !== currentUserId &&
            box.participantIds.includes(u.id) &&
            Boolean(u.username) &&
            mentionHandles.includes((u.username || '').toLowerCase())
        );
        const mentionedUserIds = mentionedUsers.map((u) => u.id);
        const closedAt = nowIso();
        const mentionNotifications: Notification[] = mentionedUsers.map((u) => ({
          id: id(),
          boxId,
          audienceUserIds: [u.id],
          actorUserId: currentUserId,
          message: `${me.name} mentioned you in "${box.name}".`,
          type: 'chat_mention',
          createdAt: closedAt,
          seenBy: [currentUserId],
        }));

        const mentionRepliesToClose = get()
          .notifications.filter(
            (n) =>
              n.type === 'chat_mention' &&
              !n.closedAt &&
              n.boxId === boxId &&
              n.audienceUserIds.includes(currentUserId) &&
              n.actorUserId !== currentUserId
          )
          .map((n) => n.id);

        const message: ChatMessage = {
          id: id(),
          boxId,
          senderUserId: currentUserId,
          text: cleanText,
          createdAt: nowIso(),
        };

        if (!hasConfig || !db) {
          set((state) => ({
            messages: [message, ...state.messages],
            notifications: [
              ...mentionNotifications,
              ...state.notifications.map((n) =>
                mentionRepliesToClose.includes(n.id) ? { ...n, closedAt } : n
              ),
            ],
          }));
          return { ok: true };
        }

        const firestore = db;
        if (!firestore) return { ok: false, error: 'Firebase DB unavailable.' };
        const previousMessages = get().messages;
        const previousNotifications = get().notifications;
        set((state) => ({
          messages: [message, ...state.messages],
          notifications: [
            ...mentionNotifications,
            ...state.notifications.map((n) =>
              mentionRepliesToClose.includes(n.id) ? { ...n, closedAt } : n
            ),
          ],
        }));
        try {
          await withRetry(async () => {
            const batch = writeBatch(firestore);
            batch.set(doc(firestore, 'messages', message.id), {
              boxId,
              senderUserId: currentUserId,
              text: cleanText,
              createdAt: message.createdAt,
            });
            mentionNotifications.forEach((n) => {
              batch.set(doc(firestore, 'notifications', n.id), {
                boxId: n.boxId,
                audienceUserIds: n.audienceUserIds,
                actorUserId: n.actorUserId,
                message: n.message,
                type: n.type,
                createdAt: n.createdAt,
                seenBy: n.seenBy,
              });
            });
            mentionRepliesToClose.forEach((notificationId) => {
              batch.update(doc(firestore, 'notifications', notificationId), { closedAt });
            });
            await batch.commit();
          });
          return { ok: true };
        } catch {
          set({ messages: previousMessages, notifications: previousNotifications });
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
        console.log('[store] onRehydrateStorage:complete');
        state?.setHydrated(true);
      },
    }
  )
);
