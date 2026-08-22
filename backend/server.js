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
const algorand = require("./services/algorand");
const x402 = require("./services/x402");
const notifier = require("./services/notifier");
const authMiddleware = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware ---
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      // Allow localhost for development
      if (origin.includes("localhost")) return callback(null, true);
      // Allow any Vercel deployment
      if (origin.endsWith(".vercel.app")) return callback(null, true);
      // Allow custom CORS_ORIGIN from env
      const allowed = process.env.CORS_ORIGIN;
      if (allowed && origin === allowed) return callback(null, true);
      // Reject others
      callback(new Error("Not allowed by CORS"));
    },
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
algorand.initialize(); // async — compiles TEAL in background
x402.initialize();
notifier.initialize();

// --- Authentication Guard ---
app.use("/api", authMiddleware);

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

    // Step 3: Check if emergency payment should be automatically executed via x402
    let paymentResult = null;
    const hasEmergencyAction = actionResults.some(
      (ar) => (ar.action === "contact_roadside_assistance" || ar.action === "find_assistance") && ar.authorized
    );
    const shouldAutoPay = analysis.riskLevel === "CRITICAL" || hasEmergencyAction;

    if (shouldAutoPay && telemetry.tripId) {
      console.log("[Pipeline] Auto-authorizing emergency roadside assistance payment via x402...");
      try {
        paymentResult = await x402.processPayment({
          tripId: telemetry.tripId,
          amountINR: 350, // ₹350 standard roadside assistance charge (4.22 USDC)
          category: "roadside_assistance",
          description: "AI Guardian automated roadside emergency fee",
        });
        console.log("[Pipeline] Auto-payment processed:", paymentResult.success ? "SUCCESS" : paymentResult.error);
      } catch (err) {
        console.error("[Pipeline] Auto-payment failed:", err.message);
      }
    }

    // Step 3b: Send SOS to emergency contacts if risk is CRITICAL
    let notificationResults = [];
    if (analysis.riskLevel === "CRITICAL" && telemetry.tripId) {
      console.log("[Pipeline] CRITICAL risk — fetching trip emergency contacts for SOS...");
      try {
        const trip = await tripManager.getTrip(telemetry.tripId);
        if (trip && trip.emergencyContacts && trip.emergencyContacts.length > 0) {
          notificationResults = await notifier.broadcastSOS(trip.emergencyContacts, {
            travelerName: trip.travelerName || "Your loved one",
            tripName: trip.name,
            riskLevel: analysis.riskLevel,
            riskScore: analysis.riskScore,
            reason: analysis.reason,
            keyFactors: analysis.keyFactors,
            telemetry,
          });
          console.log(`[Pipeline] SOS broadcast complete:`, JSON.stringify(notificationResults));
        } else {
          console.log("[Pipeline] No emergency contacts on this trip — SOS skipped.");
        }
      } catch (notifErr) {
        console.error("[Pipeline] SOS notification error (non-fatal):", notifErr.message);
      }
    }

    // Step 4: Log incident to Firebase
    console.log("[Pipeline] Step 4: Logging incident...");
    const incident = await firebase.logIncident({
      tripId: telemetry.tripId || "unknown",
      telemetry,
      analysis,
      recommendedActions: actionResults,
    });

    // Step 5: Return result
    const result = {
      incidentId: incident.id,
      timestamp: incident.timestamp,
      riskLevel: analysis.riskLevel,
      riskScore: analysis.riskScore,
      reason: analysis.reason,
      keyFactors: analysis.keyFactors,
      recommendedActions: actionResults,
      urgency: analysis.urgency,
      payment: paymentResult,
      notifications: notificationResults,
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
    const incidents = await firebase.getIncidents(req.user.uid, limit);
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
 * GET /api/incidents/:id
 *
 * Retrieve a single incident.
 */
app.get("/api/incidents/:id", async (req, res) => {
  try {
    const incident = await firebase.getIncident(req.params.id);
    if (!incident) {
      return res.status(404).json({ error: "Incident not found" });
    }
    if (incident.userId !== req.user.uid) {
      return res.status(403).json({ error: "forbidden", message: "Access denied." });
    }
    res.json({ incident });
  } catch (error) {
    console.error("[Incidents] Error getting incident:", error);
    res.status(500).json({
      error: "Failed to get incident.",
      message: error.message,
    });
  }
});

/**
 * POST /api/incidents/:id/actions/:actionName/approve
 *
 * Manually approve a recommended action.
 * If the action is payment-bearing, triggers x402 payment process.
 */
app.post("/api/incidents/:id/actions/:actionName/approve", async (req, res) => {
  try {
    const { id, actionName } = req.params;
    const incident = await firebase.getIncident(id);
    if (!incident) {
      return res.status(404).json({ error: "Incident not found" });
    }
    if (incident.userId !== req.user.uid) {
      return res.status(403).json({ error: "forbidden" });
    }

    const actionIndex = incident.recommendedActions.findIndex(
      (a) => a.action === actionName
    );

    if (actionIndex === -1) {
      return res.status(404).json({ error: "Action not found on incident" });
    }

    const targetAction = incident.recommendedActions[actionIndex];
    if (targetAction.authorized) {
      return res.json({ success: true, incident, message: "Action already authorized" });
    }

    console.log(`[Approvals] Manual approval for action '${actionName}' on incident ${id}`);

    // If it's a payment action, trigger the payment
    let paymentResult = null;
    let notificationResults = [];
    if (actionName === "contact_roadside_assistance" && incident.tripId) {
      console.log(`[Approvals] Triggering associated payment for roadside assistance...`);
      paymentResult = await x402.processPayment({
        tripId: incident.tripId,
        amountINR: 350,
        category: "roadside_assistance",
        description: "Manually approved roadside assistance fee",
      });

      if (!paymentResult.success) {
        return res.status(400).json({
          error: "payment_failed",
          message: paymentResult.message || "Failed to process payment during approval",
        });
      }

      // Also notify emergency contacts when manually approved
      try {
        const trip = await tripManager.getTrip(incident.tripId);
        if (trip && trip.emergencyContacts && trip.emergencyContacts.length > 0) {
          notificationResults = await notifier.broadcastSOS(trip.emergencyContacts, {
            travelerName: trip.travelerName || "Your loved one",
            tripName: trip.name,
            riskLevel: incident.riskLevel,
            riskScore: incident.riskScore,
            reason: `[MANUAL APPROVAL] Traveler or guardian approved roadside assistance. Original alert: ${incident.reason}`,
            keyFactors: incident.keyFactors || [],
            telemetry: incident.telemetry || {},
          });
          console.log(`[Approvals] SOS notifications sent:`, notificationResults);
        }
      } catch (notifErr) {
        console.error("[Approvals] SOS notification error (non-fatal):", notifErr.message);
      }
    }

    // Update action status to authorized
    targetAction.authorized = true;
    targetAction.requiresApproval = false;
    targetAction.reason = "Manually approved by traveler";

    // Update database record
    const updatedIncident = await firebase.updateIncident(id, {
      recommendedActions: incident.recommendedActions,
    });

    res.json({
      success: true,
      incident: updatedIncident,
      payment: paymentResult,
    });
  } catch (error) {
    console.error("[Approvals] Error approving action:", error);
    res.status(500).json({
      error: "Failed to approve action.",
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
    const { origin, destination, days, budget, preferences, planTrip: shouldPlan, originCoords, destCoords, travelerName, travelers, emergencyContacts, logicSigBase64, travelerWalletAddress } = req.body;

    if (!origin || !destination || !days || !budget) {
      return res.status(400).json({
        error: "Required fields: origin, destination, days, budget",
      });
    }

    console.log(`[Trips] Creating trip: ${origin} → ${destination} (${days} days, ₹${budget})`);
    if (originCoords) console.log(`[Trips] Pre-supplied origin coords: lat:${originCoords.lat}, lng:${originCoords.lng}`);
    if (destCoords) console.log(`[Trips] Pre-supplied dest coords: lat:${destCoords.lat}, lng:${destCoords.lng}`);

    // Step 1: Optionally generate itinerary
    let itinerary = null;
    if (shouldPlan !== false) {
      console.log("[Trips] Running Travel Planner Agent...");
      itinerary = await travelPlanner.planTrip({ origin, destination, days, budget, preferences, originCoords, destCoords });
      console.log(`[Trips] Itinerary generated: "${itinerary.tripName}"`);
    }

    // If traveler provided wallet info, attach LogicSig to the trip
    const tripPayload = {
      name: itinerary?.tripName || `${origin} → ${destination}`,
      origin,
      destination,
      days,
      budget,
      preferences,
      itinerary,
      status: "planning",
      travelerName: travelerName || null,
      travelers: travelers || [],
      emergencyContacts: emergencyContacts || [],
      logicSigBase64: logicSigBase64 || null,
      travelerWalletAddress: travelerWalletAddress || null,
      userId: req.user.uid,
    };

    // Step 2: Create trip record
    const trip = await tripManager.createTrip(tripPayload);

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
    const trips = await tripManager.listTrips(req.user.uid, status, limit);
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
    if (trip.userId !== req.user.uid) {
      return res.status(403).json({ error: "forbidden", message: "Access denied." });
    }

    // Also fetch incidents for this trip
    const allIncidents = await firebase.getIncidents(req.user.uid, 200);
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
    const trip = await tripManager.getTrip(req.params.id);
    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }
    if (trip.userId !== req.user.uid) {
      return res.status(403).json({ error: "forbidden" });
    }

    const updated = await tripManager.updateTrip(req.params.id, req.body);
    res.json({ trip: updated });
  } catch (error) {
    console.error("[Trips] Error updating trip:", error);
    res.status(500).json({
      error: "Failed to update trip.",
      message: error.message,
    });
  }
});

/**
 * DELETE /api/trips/:id
 *
 * Delete a trip.
 */
app.delete("/api/trips/:id", async (req, res) => {
  try {
    const trip = await tripManager.getTrip(req.params.id);
    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }
    if (trip.userId !== req.user.uid) {
      return res.status(403).json({ error: "forbidden" });
    }

    await tripManager.deleteTrip(req.params.id);
    res.json({ success: true, message: "Trip deleted successfully" });
  } catch (error) {
    console.error("[Trips] Error deleting trip:", error);
    res.status(500).json({
      error: "Failed to delete trip.",
      message: error.message,
    });
  }
});

// =============================================
// WALLET & PAYMENT ROUTES
// =============================================

/**
 * GET /api/wallet/balance
 *
 * Retrieve traveler Algorand address and USDC balance.
 */
app.get("/api/wallet/balance", async (req, res) => {
  try {
    const address = algorand.getWalletAddress();
    const usdcBalance = address ? await algorand.getUSDCBalance(address) : 0;
    const algoBalance = address ? await algorand.getAlgoBalance(address) : 0;
    res.json({
      address,
      usdcBalance,
      algoBalance,
      usdcAsaId: algorand.USDC_ASA_ID,
      maxPerTxnUSDC: algorand.MAX_USDC_PER_TXN,
      exchangeRate: `1 USDC = \u20b9${algorand.INR_PER_USDC}`,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch wallet info.",
      message: error.message,
    });
  }
});

/**
 * POST /api/wallet/setup-reserve
 *
 * Set up a traveler's safety reserve wallet:
 *  1. Recover wallet from mnemonic
 *  2. Opt-in to USDC ASA
 *  3. Create delegated LogicSig
 *  4. Return wallet address + LogicSig status
 *
 * The mnemonic is used ONLY to sign the LogicSig, then discarded.
 */
app.post("/api/wallet/setup-reserve", async (req, res) => {
  try {
    const { mnemonic } = req.body;
    if (!mnemonic || mnemonic.trim().split(/\s+/).length !== 25) {
      return res.status(400).json({
        error: "A valid 25-word Algorand mnemonic is required.",
      });
    }

    console.log("[Wallet] Setting up safety reserve...");

    // Step 1: Opt-in to USDC
    const optInResult = await algorand.optInToUSDC(mnemonic.trim());
    console.log("[Wallet] USDC opt-in:", optInResult.success ? "OK" : optInResult.error);

    // Step 2: Create delegated LogicSig
    const lsigResult = algorand.createDelegatedLogicSig(mnemonic.trim());
    if (!lsigResult.success) {
      return res.status(500).json({
        error: "Failed to create LogicSig.",
        message: lsigResult.error,
      });
    }

    // Step 3: Get balances
    const usdcBalance = await algorand.getUSDCBalance(lsigResult.walletAddress);
    const algoBalance = await algorand.getAlgoBalance(lsigResult.walletAddress);

    // NOTE: The mnemonic is NOT stored anywhere on the server.
    // Only the pre-signed LogicSig (which is constrained by TEAL rules) is kept.

    res.json({
      success: true,
      walletAddress: lsigResult.walletAddress,
      logicSigBase64: lsigResult.logicSigBase64,
      usdcBalance,
      algoBalance,
      usdcOptedIn: optInResult.success,
      maxPerTxnUSDC: algorand.MAX_USDC_PER_TXN,
      message: "Safety reserve configured. LogicSig signed and ready for emergency payments.",
    });
  } catch (error) {
    console.error("[Wallet] Setup reserve error:", error);
    res.status(500).json({
      error: "Failed to set up safety reserve.",
      message: error.message,
    });
  }
});

/**
 * POST /api/trips/:id/payments
 *
 * Trigger or approve a manual payment from trip's emergency budget.
 */
app.post("/api/trips/:id/payments", async (req, res) => {
  try {
    const trip = await tripManager.getTrip(req.params.id);
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    if (trip.userId !== req.user.uid) return res.status(403).json({ error: "forbidden" });

    const { amountINR, category, description } = req.body;
    if (!amountINR || !category) {
      return res.status(400).json({ error: "Required fields: amountINR, category" });
    }

    console.log(`[Payments] Manual payment request of ₹${amountINR} for trip ${req.params.id}`);
    const result = await x402.processPayment({
      tripId: req.params.id,
      amountINR: parseInt(amountINR),
      category,
      description: description || `Manual payment: ${category}`,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error("[Payments] Error processing payment:", error);
    res.status(500).json({
      error: "Failed to process payment.",
      message: error.message,
    });
  }
});

/**
 * GET /api/trips/:id/payments
 *
 * List payment logs for a trip.
 */
app.get("/api/trips/:id/payments", async (req, res) => {
  try {
    const trip = await tripManager.getTrip(req.params.id);
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    if (trip.userId !== req.user.uid) return res.status(403).json({ error: "forbidden" });

    const payments = await x402.getPayments(req.params.id);
    res.json({ payments });
  } catch (error) {
    console.error("[Payments] Error fetching payments:", error);
    res.status(500).json({
      error: "Failed to fetch payments.",
      message: error.message,
    });
  }
});

// --- Start server ---
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n🛡️  AI Travel Guardian Backend`);
    console.log(`   Running on http://localhost:${PORT}`);
    console.log(`   Webhook: POST http://localhost:${PORT}/api/telemetry`);
    console.log(`   Health:  GET  http://localhost:${PORT}/api/health\n`);
  });
}

module.exports = app;
