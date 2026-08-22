/**
 * Emergency Notifier Service
 *
 * Sends SOS alerts to the traveler's emergency contacts via Telegram Bot API.
 * Fires automatically when the AI Guardian detects a CRITICAL risk level.
 * This is FREE and unlimited using the Telegram Bot API.
 *
 * Setup:
 * 1. Create a bot via @BotFather on Telegram → get TELEGRAM_BOT_TOKEN
 * 2. Each contact must start a chat with your bot first
 * 3. Get each contact's Chat ID using @userinfobot on Telegram
 * 4. Add contacts when creating a trip (stored in Firestore under the trip)
 */

const https = require("https");

let botToken = null;
let initialized = false;

/**
 * Initialize the Telegram notifier.
 * Called once at server startup.
 */
function initialize() {
  botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.warn(
      "[Notifier] TELEGRAM_BOT_TOKEN not set. Emergency notifications are disabled."
    );
    return false;
  }
  initialized = true;
  console.log("[Notifier] Telegram emergency notifier initialized.");
  return true;
}

/**
 * Make a Telegram Bot API call (no external dependencies, pure Node https).
 *
 * @param {string} method - Telegram API method name (e.g. "sendMessage")
 * @param {Object} payload - JSON body to send
 * @returns {Promise<Object>} Parsed API response
 */
function telegramRequest(method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: "api.telegram.org",
      path: `/bot${botToken}/${method}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ ok: false, raw: data });
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * Send an SOS alert to a single Telegram Chat ID.
 *
 * @param {string} chatId - Telegram Chat ID of the emergency contact
 * @param {string} contactName - Display name of the contact
 * @param {Object} alertData - The SOS payload
 * @param {string} alertData.travelerName - Name of the traveler
 * @param {string} alertData.tripName - Name of the trip (e.g. "Mumbai → Goa")
 * @param {string} alertData.riskLevel - CRITICAL, HIGH, etc.
 * @param {number} alertData.riskScore - 0–100
 * @param {string} alertData.reason - AI-generated explanation
 * @param {string[]} alertData.keyFactors - Key telemetry factors
 * @param {Object} alertData.telemetry - Raw telemetry data
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendSOSAlert(chatId, contactName, alertData) {
  if (!initialized) {
    console.warn("[Notifier] Cannot send SOS — notifier not initialized (no bot token).");
    return { success: false, error: "Notifier not initialized" };
  }

  const {
    travelerName,
    tripName,
    riskLevel,
    riskScore,
    reason,
    keyFactors = [],
    telemetry = {},
  } = alertData;

  // Build a rich Telegram message using MarkdownV2 escaping
  const riskEmoji = riskLevel === "CRITICAL" ? "🚨" : riskLevel === "HIGH" ? "⚠️" : "ℹ️";
  const mapLink =
    telemetry.latitude && telemetry.longitude
      ? `https://www.google.com/maps?q=${telemetry.latitude},${telemetry.longitude}`
      : null;

  // Telegram MarkdownV2 requires escaping special chars. Use simpler HTML mode.
  const lines = [
    `${riskEmoji} <b>EMERGENCY ALERT — TripGenie</b>`,
    ``,
    `<b>Traveler:</b> ${escapeHtml(travelerName || "Unknown")}`,
    `<b>Trip:</b> ${escapeHtml(tripName || "Unknown Trip")}`,
    `<b>Risk Level:</b> ${riskLevel} (Score: ${riskScore}/100)`,
    ``,
    `<b>📋 AI Assessment:</b>`,
    escapeHtml(reason || "No reason provided"),
    ``,
  ];

  if (keyFactors.length > 0) {
    lines.push(`<b>⚡ Key Factors:</b>`);
    keyFactors.forEach((f) => lines.push(`• ${escapeHtml(f)}`));
    lines.push(``);
  }

  if (telemetry.battery !== undefined) {
    lines.push(`<b>🔋 Battery:</b> ${telemetry.battery}%`);
  }
  if (telemetry.networkStatus) {
    lines.push(`<b>📶 Network:</b> ${telemetry.networkStatus}`);
  }
  if (telemetry.movementStatus) {
    lines.push(`<b>🚗 Movement:</b> ${telemetry.movementStatus}`);
  }
  if (telemetry.lastCheckInMinutes !== undefined) {
    lines.push(`<b>⏱ Last Check-in:</b> ${telemetry.lastCheckInMinutes} minutes ago`);
  }
  if (mapLink) {
    lines.push(``);
    lines.push(`<b>📍 Last Known Location:</b>`);
    lines.push(`<a href="${mapLink}">Open in Google Maps</a>`);
  }

  lines.push(``);
  lines.push(`<i>Automated alert sent by TripGenie at ${new Date().toUTCString()}</i>`);
  lines.push(`<i>An emergency roadside assistance payment of ₹350 has been auto-authorized on Algorand.</i>`);

  const message = lines.join("\n");

  try {
    const response = await telegramRequest("sendMessage", {
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    });

    if (response.ok) {
      console.log(
        `[Notifier] SOS sent to contact "${contactName}" (chat_id: ${chatId})`
      );
      return { success: true };
    } else {
      console.error(
        `[Notifier] Telegram API error for chat_id ${chatId}:`,
        response.description
      );
      return { success: false, error: response.description };
    }
  } catch (error) {
    console.error(`[Notifier] Failed to send to chat_id ${chatId}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Broadcast SOS alerts to ALL emergency contacts on a trip.
 *
 * @param {Object[]} emergencyContacts - Array of { name, chatId } objects from trip
 * @param {Object} alertData - See sendSOSAlert for the shape
 * @returns {Promise<Object[]>} Array of results per contact
 */
async function broadcastSOS(emergencyContacts, alertData) {
  if (!emergencyContacts || emergencyContacts.length === 0) {
    console.log("[Notifier] No emergency contacts configured for this trip — skipping SOS.");
    return [];
  }

  console.log(
    `[Notifier] Broadcasting SOS to ${emergencyContacts.length} emergency contact(s)...`
  );

  const results = await Promise.allSettled(
    emergencyContacts.map((contact) =>
      sendSOSAlert(contact.chatId, contact.name, alertData)
    )
  );

  return results.map((r, i) => ({
    contact: emergencyContacts[i].name,
    chatId: emergencyContacts[i].chatId,
    ...(r.status === "fulfilled" ? r.value : { success: false, error: r.reason?.message }),
  }));
}

/** Escape HTML special characters for Telegram HTML parse mode */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

module.exports = { initialize, broadcastSOS, sendSOSAlert };
