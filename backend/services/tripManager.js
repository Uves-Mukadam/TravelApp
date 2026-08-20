/**
 * Trip Manager Service
 *
 * Handles CRUD operations for trips.
 * Uses Firebase Firestore with in-memory fallback.
 */

const admin = require("firebase-admin");

let db = null;

/**
 * Initialize — uses existing Firebase Admin instance if available.
 */
function initialize() {
  try {
    // Check if Firebase Admin is already initialized (by firebase.js service)
    const app = admin.app();
    db = app.firestore();
    console.log("[TripManager] Using Firestore.");
    return true;
  } catch {
    console.log("[TripManager] Firebase not available. Using in-memory storage.");
    return false;
  }
}

/**
 * In-memory trip storage fallback.
 */
const memoryStore = {
  trips: [],
};

/**
 * Create a new trip.
 *
 * @param {Object} tripData
 * @returns {Object} The created trip with an ID
 */
async function createTrip(tripData) {
  const trip = {
    name: tripData.name || `${tripData.origin} → ${tripData.destination}`,
    origin: tripData.origin,
    originCoords: tripData.originCoords || null,
    destination: tripData.destination,
    destinationCoords: tripData.destinationCoords || null,
    days: tripData.days,
    budget: tripData.budget,
    budgetSpent: 0,
    status: tripData.status || "planning",
    itinerary: tripData.itinerary || null,
    preferences: tripData.preferences || {},
    emergencyContacts: tripData.emergencyContacts || [],
    createdAt: new Date().toISOString(),
    agentId: "travel_planner",
  };

  if (db) {
    try {
      const docRef = await db.collection("trips").add(trip);
      trip.id = docRef.id;
      console.log(`[TripManager] Trip created in Firestore: ${docRef.id}`);
    } catch (error) {
      console.error("[TripManager] Firestore write failed:", error.message);
      trip.id = `mem_trip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      memoryStore.trips.push(trip);
    }
  } else {
    trip.id = `mem_trip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    memoryStore.trips.push(trip);
    console.log(`[TripManager] Trip created in memory: ${trip.id}`);
  }

  return trip;
}

/**
 * Get a trip by ID.
 */
async function getTrip(tripId) {
  if (db) {
    try {
      const doc = await db.collection("trips").doc(tripId).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      console.error("[TripManager] Firestore read failed:", error.message);
    }
  }

  return memoryStore.trips.find((t) => t.id === tripId) || null;
}

/**
 * List all trips, optionally filtered by status.
 */
async function listTrips(status, limit = 50) {
  if (db) {
    try {
      let query = db.collection("trips").orderBy("createdAt", "desc").limit(limit);
      if (status) {
        query = query.where("status", "==", status);
      }
      const snapshot = await query.get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error("[TripManager] Firestore list failed:", error.message);
    }
  }

  let trips = [...memoryStore.trips].reverse();
  if (status) {
    trips = trips.filter((t) => t.status === status);
  }
  return trips.slice(0, limit);
}

/**
 * Update a trip.
 */
async function updateTrip(tripId, updates) {
  if (db) {
    try {
      await db.collection("trips").doc(tripId).update(updates);
      const updated = await getTrip(tripId);
      console.log(`[TripManager] Trip updated in Firestore: ${tripId}`);
      return updated;
    } catch (error) {
      console.error("[TripManager] Firestore update failed:", error.message);
    }
  }

  const idx = memoryStore.trips.findIndex((t) => t.id === tripId);
  if (idx === -1) return null;
  Object.assign(memoryStore.trips[idx], updates);
  console.log(`[TripManager] Trip updated in memory: ${tripId}`);
  return memoryStore.trips[idx];
}

module.exports = { initialize, createTrip, getTrip, listTrips, updateTrip };
