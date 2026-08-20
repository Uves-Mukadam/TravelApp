/**
 * AI Travel Guardian — Backend Server
 *
 * Express server acting as the orchestration layer (n8n stand-in).
 * Receives traveler telemetry via webhook, sends to Gemini for
 * risk analysis, logs incidents to Firebase, and returns results.
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");

const gemini = require("./services/gemini");
const firebase = require("./services/firebase");
const policyEngine = require("./services/policyEngine");
const travelPlanner = require("./services/travelPlanner");
const tripManager = require("./services/tripManager");

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware ---
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  })
);
app.use(express.json());

// --- Request logging ---
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// --- Initialize services ---
gemini.initialize();
firebase.initialize();
travelPlanner.initialize();
tripManager.initialize();

// =============================================
// ROUTES
// =============================================

/**
 * Health check endpoint.
 */
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "ai-travel-guardian",
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/telemetry
 *
 * Main webhook endpoint.
 * Receives traveler telemetry, runs risk analysis, logs incident.
 *
 * Request body:
 * {
 *   "tripId": "trip_123",
 *   "latitude": 16.9,
 *   "longitude": 73.8,
 *   "battery": 14,
 *   "networkStatus": "offline",
 *   "movementStatus": "stopped",
 *   "lastCheckInMinutes": 125,
 *   "routeDeviationKm": 6.2
 * }
 */
app.post("/api/telemetry", async (req, res) => {
  try {
    const telemetry = req.body;

    // Basic validation
    if (!telemetry || Object.keys(telemetry).length === 0) {
      return res.status(400).json({
        error: "Telemetry data is required.",
      });
    }

    console.log("[Telemetry] Received:", JSON.stringify(telemetry));

    // Step 1: Gemini risk analysis
    console.log("[Pipeline] Step 1: Running Gemini risk analysis...");
    const analysis = await gemini.analyzeRisk(telemetry);
    console.log(`[Pipeline] Risk level: ${analysis.riskLevel}`);

    // Step 2: Policy validation for recommended actions
    console.log("[Pipeline] Step 2: Validating actions against policy...");
    const actionResults = analysis.recommendedActions.map((action) => {
      const validation = policyEngine.validateAction({
        tripId: telemetry.tripId || "unknown",
        action,
        riskLevel: analysis.riskLevel,
      });
      return { action, ...validation };
    });

    // Step 3: Log incident to Firebase
    console.log("[Pipeline] Step 3: Logging incident...");
    const incident = await firebase.logIncident({
      tripId: telemetry.tripId || "unknown",
      telemetry,
      analysis,
    });

    // Step 4: Return result
    const result = {
      incidentId: incident.id,
      timestamp: incident.timestamp,
      riskLevel: analysis.riskLevel,
      riskScore: analysis.riskScore,
      reason: analysis.reason,
      keyFactors: analysis.keyFactors,
      recommendedActions: actionResults,
      urgency: analysis.urgency,
    };

    console.log("[Pipeline] Complete. Incident:", incident.id);
    res.json(result);
  } catch (error) {
    console.error("[Pipeline] Error:", error);
    res.status(500).json({
      error: "Failed to process telemetry.",
      message: error.message,
    });
  }
});

/**
 * GET /api/incidents
 *
 * Retrieve recent incidents for the dashboard.
 * Query params: ?limit=50
 */
app.get("/api/incidents", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const incidents = await firebase.getIncidents(limit);
    res.json({ incidents });
  } catch (error) {
    console.error("[Incidents] Error:", error);
    res.status(500).json({
      error: "Failed to retrieve incidents.",
      message: error.message,
    });
  }
});

/**
 * GET /api/policy
 *
 * Return the current spending policy (for dashboard display).
 */
app.get("/api/policy", (_req, res) => {
  res.json({ policy: policyEngine.DEFAULT_POLICY });
});

// =============================================
// TRIP ROUTES
// =============================================

/**
 * POST /api/trips
 *
 * Create a new trip. Optionally runs the Travel Planner Agent
 * to generate an itinerary.
 *
 * Request body:
 * {
 *   "origin": "Mumbai",
 *   "destination": "Goa",
 *   "days": 3,
 *   "budget": 15000,
 *   "preferences": { "vehicleType": "car" },
 *   "planTrip": true  // set to true to auto-generate itinerary
 * }
 */
app.post("/api/trips", async (req, res) => {
  try {
    const { origin, destination, days, budget, preferences, planTrip: shouldPlan } = req.body;

    if (!origin || !destination || !days || !budget) {
      return res.status(400).json({
        error: "Required fields: origin, destination, days, budget",
      });
    }

    console.log(`[Trips] Creating trip: ${origin} → ${destination} (${days} days, ₹${budget})`);

    // Step 1: Optionally generate itinerary
    let itinerary = null;
    if (shouldPlan !== false) {
      console.log("[Trips] Running Travel Planner Agent...");
      itinerary = await travelPlanner.planTrip({ origin, destination, days, budget, preferences });
      console.log(`[Trips] Itinerary generated: "${itinerary.tripName}"`);
    }

    // Step 2: Create trip record
    const trip = await tripManager.createTrip({
      name: itinerary?.tripName || `${origin} → ${destination}`,
      origin,
      destination,
      days,
      budget,
      preferences,
      itinerary,
      status: "planning",
    });

    console.log(`[Trips] Trip created: ${trip.id}`);
    res.json({ trip });
  } catch (error) {
    console.error("[Trips] Error creating trip:", error);
    res.status(500).json({
      error: "Failed to create trip.",
      message: error.message,
    });
  }
});

/**
 * GET /api/trips
 *
 * List all trips. Optional query: ?status=active&limit=50
 */
app.get("/api/trips", async (req, res) => {
  try {
    const status = req.query.status || null;
    const limit = parseInt(req.query.limit) || 50;
    const trips = await tripManager.listTrips(status, limit);
    res.json({ trips });
  } catch (error) {
    console.error("[Trips] Error listing trips:", error);
    res.status(500).json({
      error: "Failed to list trips.",
      message: error.message,
    });
  }
});

/**
 * GET /api/trips/:id
 *
 * Get a single trip by ID, with its incidents.
 */
app.get("/api/trips/:id", async (req, res) => {
  try {
    const trip = await tripManager.getTrip(req.params.id);
    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    // Also fetch incidents for this trip
    const allIncidents = await firebase.getIncidents(200);
    const tripIncidents = allIncidents.filter((i) => i.tripId === trip.id);

    res.json({ trip, incidents: tripIncidents });
  } catch (error) {
    console.error("[Trips] Error getting trip:", error);
    res.status(500).json({
      error: "Failed to get trip.",
      message: error.message,
    });
  }
});

/**
 * PUT /api/trips/:id
 *
 * Update a trip (status, budget spent, etc.).
 */
app.put("/api/trips/:id", async (req, res) => {
  try {
    const updated = await tripManager.updateTrip(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: "Trip not found" });
    }
    res.json({ trip: updated });
  } catch (error) {
    console.error("[Trips] Error updating trip:", error);
    res.status(500).json({
      error: "Failed to update trip.",
      message: error.message,
    });
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`\n🛡️  AI Travel Guardian Backend`);
  console.log(`   Running on http://localhost:${PORT}`);
  console.log(`   Webhook: POST http://localhost:${PORT}/api/telemetry`);
  console.log(`   Health:  GET  http://localhost:${PORT}/api/health\n`);
});
