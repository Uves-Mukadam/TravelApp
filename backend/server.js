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

// --- Start server ---
app.listen(PORT, () => {
  console.log(`\n🛡️  AI Travel Guardian Backend`);
  console.log(`   Running on http://localhost:${PORT}`);
  console.log(`   Webhook: POST http://localhost:${PORT}/api/telemetry`);
  console.log(`   Health:  GET  http://localhost:${PORT}/api/health\n`);
});
