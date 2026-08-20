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
async function logIncident({ tripId, telemetry, analysis }) {
  const incident = {
    tripId: tripId || "unknown",
    timestamp: new Date().toISOString(),
    telemetry,
    riskLevel: analysis.riskLevel,
    riskScore: analysis.riskScore,
    reason: analysis.reason,
    keyFactors: analysis.keyFactors || [],
    recommendedActions: analysis.recommendedActions || [],
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
async function getIncidents(limit = 50) {
  if (initialized && db) {
    try {
      const snapshot = await db
        .collection("incidents")
        .orderBy("timestamp", "desc")
        .limit(limit)
        .get();

      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error("[Firebase] Failed to get incidents:", error.message);
      return memoryStore.incidents.slice(-limit).reverse();
    }
  }

  return memoryStore.incidents.slice(-limit).reverse();
}

/**
 * Clear in-memory incidents (for testing).
 */
function clearMemoryStore() {
  memoryStore.incidents = [];
}

module.exports = { initialize, logIncident, getIncidents, clearMemoryStore };
