import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";

let db = null;
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
    initialized = true;
    console.log("[Firebase Client] Initialized successfully.");
  } catch (error) {
    console.error("[Firebase Client] Initialization failed:", error.message);
  }
} else {
  console.warn(
    "[Firebase Client] No configuration variables found. Real-time Firebase listeners will fall back to Express API polling."
  );
}

/**
 * Subscribe to recent incidents in real-time.
 *
 * @param {Function} onUpdateCallback - Called when new incidents are retrieved
 * @param {number} [limitCount=50] - Max incidents to fetch
 * @returns {Function|null} Unsubscribe function, or null if Firebase not available
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
 *
 * @param {string} tripId
 * @param {Function} onUpdateCallback
 * @returns {Function|null} Unsubscribe function, or null if Firebase not available
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

export { db, initialized };
