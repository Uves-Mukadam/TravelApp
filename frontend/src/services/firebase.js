import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

let db = null;
let auth = null;
let initialized = false;

// Read config from Vite environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Check if credentials are set
if (firebaseConfig.apiKey && firebaseConfig.projectId) {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    initialized = true;
    console.log("[Firebase Client] Auth & Firestore initialized successfully.");
  } catch (error) {
    console.error("[Firebase Client] Initialization failed:", error.message);
  }
} else {
  console.warn(
    "[Firebase Client] No configuration variables found. Using mock local-storage authentication fallback."
  );
}

// =============================================
// AUTHENTICATION INTERFACE / FALLBACKS
// =============================================

/**
 * Log in a user.
 */
export async function loginUser(email, password) {
  if (initialized && auth) {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return credential.user;
  } else {
    // Mock authentication fallback
    const mockUser = { uid: "mock_dev_user_777", email: email || "dev@travelguardian.ai" };
    localStorage.setItem("mock_user", JSON.stringify(mockUser));
    // Trigger mock state listener
    triggerMockListeners(mockUser);
    return mockUser;
  }
}

/**
 * Register a user.
 */
export async function registerUser(email, password) {
  if (initialized && auth) {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    return credential.user;
  } else {
    // Mock registration
    const mockUser = { uid: "mock_dev_user_777", email: email || "dev@travelguardian.ai" };
    localStorage.setItem("mock_user", JSON.stringify(mockUser));
    triggerMockListeners(mockUser);
    return mockUser;
  }
}

/**
 * Log out the current user.
 */
export async function logoutUser() {
  if (initialized && auth) {
    await signOut(auth);
  } else {
    localStorage.removeItem("mock_user");
    triggerMockListeners(null);
  }
}

const mockListeners = new Set();
function triggerMockListeners(user) {
  mockListeners.forEach((cb) => cb(user));
}

/**
 * Listen to authentication state changes.
 */
export function onAuthChange(callback) {
  if (initialized && auth) {
    return onAuthStateChanged(auth, callback);
  } else {
    // Mock listener
    mockListeners.add(callback);
    
    // Call immediately with current mock user status
    const stored = localStorage.getItem("mock_user");
    const user = stored ? JSON.parse(stored) : null;
    setTimeout(() => callback(user), 0);

    return () => {
      mockListeners.delete(callback);
    };
  }
}

/**
 * Get current ID token to authorize API requests.
 */
export async function getAuthToken() {
  if (initialized && auth && auth.currentUser) {
    return await auth.currentUser.getIdToken();
  }
  // Mock fallback token
  const stored = localStorage.getItem("mock_user");
  return stored ? "MOCK_DEV_TOKEN_777" : null;
}

// =============================================
// FIRESTORE REAL-TIME SUBSCRIPTIONS
// =============================================

/**
 * Subscribe to recent incidents in real-time.
 */
export function subscribeToIncidents(onUpdateCallback, limitCount = 50) {
  if (!initialized || !db) return null;

  try {
    const q = query(
      collection(db, "incidents"),
      orderBy("timestamp", "desc"),
      limit(limitCount)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const incidents = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        onUpdateCallback(incidents);
      },
      (error) => {
        console.error("[Firebase Client] Listener failed:", error.message);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error("[Firebase Client] Failed to subscribe:", error.message);
    return null;
  }
}

/**
 * Subscribe to payments logs for a trip in real-time.
 */
export function subscribeToPayments(tripId, onUpdateCallback) {
  if (!initialized || !db) return null;

  try {
    const q = query(
      collection(db, "payments"),
      orderBy("timestamp", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const payments = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((p) => p.tripId === tripId);
        onUpdateCallback(payments);
      },
      (error) => {
        console.error("[Firebase Client] Payments listener failed:", error.message);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error("[Firebase Client] Failed to subscribe to payments:", error.message);
    return null;
  }
}

export { db, auth, initialized };
