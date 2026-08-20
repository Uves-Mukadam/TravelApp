/**
 * Gemini Risk Analysis Service
 *
 * Sends traveler telemetry to Gemini for contextual risk analysis.
 * Returns structured risk assessment with recommended actions.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");

// Load the system prompt once at startup
const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "riskAnalysis.txt"),
  "utf-8"
);

let genAI = null;
let model = null;

/**
 * Initialize the Gemini client.
 * Called once at server startup.
 */
function initialize() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn(
      "[Gemini] GEMINI_API_KEY not set. Risk analysis will return mock data."
    );
    return false;
  }

  genAI = new GoogleGenerativeAI(apiKey);
  model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  });

  console.log("[Gemini] Initialized successfully.");
  return true;
}

/**
 * Analyze telemetry data and return a risk assessment.
 *
 * @param {Object} telemetry - Traveler telemetry data
 * @returns {Object} Risk assessment result
 */
async function analyzeRisk(telemetry) {
  // If Gemini is not configured, return a mock response
  if (!model) {
    console.log("[Gemini] Using mock risk analysis (no API key configured).");
    return getMockAnalysis(telemetry);
  }

  try {
    const userPrompt = `Analyze the following traveler telemetry and provide a risk assessment:\n\n${JSON.stringify(telemetry, null, 2)}`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2, // Low temperature for consistent, analytical responses
      },
    });

    const responseText = result.response.text();
    const analysis = JSON.parse(responseText);

    // Validate the response has required fields
    if (!analysis.riskLevel || !analysis.reason || !analysis.recommendedActions) {
      throw new Error("Gemini response missing required fields");
    }

    // Normalize riskLevel to uppercase
    analysis.riskLevel = analysis.riskLevel.toUpperCase();

    console.log(
      `[Gemini] Risk analysis complete: ${analysis.riskLevel} (score: ${analysis.riskScore})`
    );

    return analysis;
  } catch (error) {
    console.error("[Gemini] Risk analysis failed:", error.message);

    // Fallback to mock on error so the system stays operational
    console.log("[Gemini] Falling back to mock analysis.");
    return getMockAnalysis(telemetry);
  }
}

/**
 * Generate a mock risk analysis based on simple heuristics.
 * Used when Gemini API is unavailable.
 */
function getMockAnalysis(telemetry) {
  let riskScore = 0;
  const keyFactors = [];

  // Score each risk factor
  if (telemetry.battery !== undefined && telemetry.battery < 20) {
    riskScore += 20;
    keyFactors.push(`Low battery: ${telemetry.battery}%`);
  }

  if (telemetry.networkStatus === "offline") {
    riskScore += 25;
    keyFactors.push("Network is offline");
  }

  if (telemetry.movementStatus === "stopped") {
    riskScore += 15;
    keyFactors.push("Vehicle has stopped");
  }

  if (telemetry.lastCheckInMinutes !== undefined && telemetry.lastCheckInMinutes > 60) {
    riskScore += 20;
    keyFactors.push(
      `No check-in for ${telemetry.lastCheckInMinutes} minutes`
    );
  }

  if (telemetry.routeDeviationKm !== undefined && telemetry.routeDeviationKm > 3) {
    riskScore += 20;
    keyFactors.push(
      `Route deviation: ${telemetry.routeDeviationKm} km`
    );
  }

  // Determine risk level from score
  let riskLevel;
  if (riskScore >= 75) riskLevel = "CRITICAL";
  else if (riskScore >= 50) riskLevel = "HIGH";
  else if (riskScore >= 25) riskLevel = "MEDIUM";
  else riskLevel = "LOW";

  // Determine recommended actions
  const recommendedActions = ["log_incident"];
  if (riskScore >= 25) recommendedActions.unshift("request_checkin");
  if (riskScore >= 50) {
    recommendedActions.unshift("retrieve_last_location", "find_assistance");
  }
  if (riskScore >= 75) {
    recommendedActions.unshift("notify_emergency_contacts", "contact_roadside_assistance");
  }

  // Determine urgency
  let urgency = "none";
  if (riskScore >= 75) urgency = "immediate";
  else if (riskScore >= 50) urgency = "high";
  else if (riskScore >= 25) urgency = "moderate";
  else if (riskScore > 0) urgency = "low";

  return {
    riskLevel,
    riskScore: Math.min(riskScore, 100),
    reason: `[MOCK] Risk assessment based on ${keyFactors.length} concerning factor(s). ${keyFactors.join(". ")}.`,
    keyFactors: keyFactors.length > 0 ? keyFactors : ["All indicators normal"],
    recommendedActions,
    urgency,
  };
}

module.exports = { initialize, analyzeRisk };
