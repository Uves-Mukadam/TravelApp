/**
 * Firebase Incident Logging Service
 *
 * Handles writing incident records to Firestore.
 * Reads incidents for the dashboard.
 */

const admin = require("firebase-admin");

let db = null;
let initialized = false;

/**
 * Initialize Firebase Admin SDK.
 * Supports both service account file path and individual env vars.
 */
function initialize() {
  try {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

    if (serviceAccountPath) {
      // Option A: Service account JSON file
      const serviceAccount = require(serviceAccountPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else if (process.env.FIREBASE_PROJECT_ID) {
      // Option B: Individual environment variables
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          // Private key comes with escaped newlines from env
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
      });
    } else {
      console.warn(
        "[Firebase] No credentials configured. Using in-memory storage."
      );
      return false;
    }

    db = admin.firestore();
    initialized = true;
    console.log("[Firebase] Initialized successfully.");
    return true;
  } catch (error) {
    console.error("[Firebase] Initialization failed:", error.message);
    return false;
  }
}

/**
 * In-memory storage fallback when Firebase is not configured.
 */
const memoryStore = {
  incidents: [],
};

/**
 * Log an incident to Firestore (or in-memory fallback).
 *
 * @param {Object} params
 * @param {string} params.tripId
 * @param {Object} params.telemetry - Raw telemetry data
 * @param {Object} params.analysis - Gemini risk analysis result
 * @returns {Object} The created incident record
 */
async function logIncident({ tripId, telemetry, analysis, recommendedActions }) {
  const tripManager = require("./tripManager");
  const trip = await tripManager.getTrip(tripId);
  const userId = trip ? trip.userId : "unknown";

  const incident = {
    tripId: tripId || "unknown",
    userId,
    timestamp: new Date().toISOString(),
    telemetry,
    riskLevel: analysis.riskLevel,
    riskScore: analysis.riskScore,
    reason: analysis.reason,
    keyFactors: analysis.keyFactors || [],
    recommendedActions: recommendedActions || analysis.recommendedActions || [],
    urgency: analysis.urgency || "none",
    agentId: "travel_guardian",
    status: "logged",
  };

  if (initialized && db) {
    try {
      const docRef = await db.collection("incidents").add(incident);
      incident.id = docRef.id;
      console.log(`[Firebase] Incident logged: ${docRef.id}`);
    } catch (error) {
      console.error("[Firebase] Failed to log incident:", error.message);
      // Fall through to in-memory storage
      incident.id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      memoryStore.incidents.push(incident);
    }
  } else {
    // In-memory fallback
    incident.id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    memoryStore.incidents.push(incident);
    console.log(`[Memory] Incident logged: ${incident.id}`);
  }

  return incident;
}

/**
 * Get recent incidents (from Firestore or in-memory).
 *
 * @param {number} limit - Maximum number of incidents to return
 * @returns {Array} List of incident records
 */
async function getIncidents(userId, limit = 50) {
  if (initialized && db) {
    try {
      const snapshot = await db
        .collection("incidents")
        .where("userId", "==", userId)
        .get();

      const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return list.slice(0, limit);
    } catch (error) {
      console.error("[Firebase] Failed to get incidents:", error.message);
      return memoryStore.incidents.filter((i) => i.userId === userId).slice(-limit).reverse();
    }
  }

  return memoryStore.incidents.filter((i) => i.userId === userId).slice(-limit).reverse();
}

/**
 * Clear in-memory incidents (for testing).
 */
function clearMemoryStore() {
  memoryStore.incidents = [];
}

/**
 * Get a single incident by ID.
 */
async function getIncident(incidentId) {
  if (initialized && db) {
    try {
      const doc = await db.collection("incidents").doc(incidentId).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      console.error("[Firebase] Failed to get incident:", error.message);
    }
  }
  return memoryStore.incidents.find((i) => i.id === incidentId) || null;
}

/**
 * Update a single incident by ID.
 */
async function updateIncident(incidentId, updates) {
  if (initialized && db) {
    try {
      await db.collection("incidents").doc(incidentId).update(updates);
      const updated = await getIncident(incidentId);
      return updated;
    } catch (error) {
      console.error("[Firebase] Failed to update incident:", error.message);
    }
  }

  const idx = memoryStore.incidents.findIndex((i) => i.id === incidentId);
  if (idx === -1) return null;
  Object.assign(memoryStore.incidents[idx], updates);
  return memoryStore.incidents[idx];
}

module.exports = {
  initialize,
  logIncident,
  getIncidents,
  getIncident,
  updateIncident,
  clearMemoryStore,
};
