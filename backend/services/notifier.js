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
let initializedTelegram = false;
let twilioConfig = null;

/**
 * Initialize the Telegram and Twilio notifiers.
 * Called once at server startup.
 */
function initialize() {
  botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    initializedTelegram = true;
    console.log("[Notifier] Telegram emergency notifier initialized.");
  } else {
    console.warn("[Notifier] TELEGRAM_BOT_TOKEN not set.");
  }

  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_NUMBER) {
    twilioConfig = {
      sid: process.env.TWILIO_ACCOUNT_SID,
      token: process.env.TWILIO_AUTH_TOKEN,
      from: process.env.TWILIO_WHATSAPP_NUMBER
    };
    console.log("[Notifier] Twilio WhatsApp emergency notifier initialized.");
  } else {
    console.warn("[Notifier] Twilio WhatsApp variables not fully set.");
  }

  return initializedTelegram || twilioConfig !== null;
}

/**
 * Make a Telegram Bot API call (no external dependencies, pure Node https).
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
 * Make a Twilio API call to send a WhatsApp message.
 */
function twilioWhatsAppRequest(to, message) {
  return new Promise((resolve, reject) => {
    const querystring = require('querystring');
    // Ensure the "to" number has a + prefix
    const formattedTo = to.startsWith('+') ? to : `+${to}`;
    
    const postData = querystring.stringify({
      To: `whatsapp:${formattedTo}`,
      From: `whatsapp:${twilioConfig.from}`,
      Body: message
    });
    
    const options = {
      hostname: 'api.twilio.com',
      path: `/2010-04-01/Accounts/${twilioConfig.sid}/Messages.json`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': 'Basic ' + Buffer.from(`${twilioConfig.sid}:${twilioConfig.token}`).toString('base64')
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ error: "Failed to parse Twilio response" });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Send an SOS alert to a single contact.
 */
async function sendSOSAlert(contact, alertData) {
  const { platform = "telegram", contactId, chatId } = contact;
  const targetId = contactId || chatId; // Handle legacy trips that only have chatId
  
  if (!targetId) {
    return { success: false, error: "No contact ID provided" };
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

  const riskEmoji = riskLevel === "CRITICAL" ? "🚨" : riskLevel === "HIGH" ? "⚠️" : "ℹ️";
  const mapLink = telemetry.latitude && telemetry.longitude
      ? `https://www.google.com/maps?q=${telemetry.latitude},${telemetry.longitude}`
      : null;

  if (platform === "whatsapp") {
    if (!twilioConfig) return { success: false, error: "Twilio WhatsApp not configured" };
    
    // WhatsApp Markdown (bold is *, italic is _)
    const lines = [
      `${riskEmoji} *EMERGENCY ALERT — AI Travel Guardian*`,
      ``,
      `*Traveler:* ${travelerName || "Unknown"}`,
      `*Trip:* ${tripName || "Unknown Trip"}`,
      `*Risk Level:* ${riskLevel} (Score: ${riskScore}/100)`,
      ``,
      `*📋 AI Assessment:*`,
      `${reason || "No reason provided"}`,
      ``,
    ];

    if (keyFactors.length > 0) {
      lines.push(`*⚡ Key Factors:*`);
      keyFactors.forEach((f) => lines.push(`• ${f}`));
      lines.push(``);
    }

    if (telemetry.battery !== undefined) lines.push(`*🔋 Battery:* ${telemetry.battery}%`);
    if (telemetry.networkStatus) lines.push(`*📶 Network:* ${telemetry.networkStatus}`);
    if (telemetry.movementStatus) lines.push(`*🚗 Movement:* ${telemetry.movementStatus}`);
    if (telemetry.lastCheckInMinutes !== undefined) lines.push(`*⏱ Last Check-in:* ${telemetry.lastCheckInMinutes} minutes ago`);
    
    if (mapLink) {
      lines.push(``);
      lines.push(`*📍 Last Known Location:*`);
      lines.push(`${mapLink}`);
    }

    lines.push(``);
    lines.push(`_Automated alert sent by AI Travel Guardian at ${new Date().toUTCString()}_`);
    lines.push(`_An emergency roadside assistance payment of ₹350 has been auto-authorized._`);

    const message = lines.join("\n");
    
    try {
      const response = await twilioWhatsAppRequest(targetId, message);
      if (response.sid) {
        console.log(`[Notifier] WhatsApp SOS sent to ${contact.name} (${targetId})`);
        return { success: true };
      } else {
        console.error(`[Notifier] Twilio API error for ${targetId}:`, response.message);
        return { success: false, error: response.message };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  } 
  else {
    // Default to Telegram
    if (!initializedTelegram) return { success: false, error: "Telegram bot not configured" };
    
    const lines = [
      `${riskEmoji} <b>EMERGENCY ALERT — AI Travel Guardian</b>`,
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

    if (telemetry.battery !== undefined) lines.push(`<b>🔋 Battery:</b> ${telemetry.battery}%`);
    if (telemetry.networkStatus) lines.push(`<b>📶 Network:</b> ${telemetry.networkStatus}`);
    if (telemetry.movementStatus) lines.push(`<b>🚗 Movement:</b> ${telemetry.movementStatus}`);
    if (telemetry.lastCheckInMinutes !== undefined) lines.push(`<b>⏱ Last Check-in:</b> ${telemetry.lastCheckInMinutes} minutes ago`);
    
    if (mapLink) {
      lines.push(``);
      lines.push(`<b>📍 Last Known Location:</b>`);
      lines.push(`<a href="${mapLink}">Open in Google Maps</a>`);
    }

    lines.push(``);
    lines.push(`<i>Automated alert sent by AI Travel Guardian at ${new Date().toUTCString()}</i>`);
    lines.push(`<i>An emergency roadside assistance payment of ₹350 has been auto-authorized on Algorand.</i>`);

    const message = lines.join("\n");

    try {
      const response = await telegramRequest("sendMessage", {
        chat_id: targetId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      });

      if (response.ok) {
        console.log(`[Notifier] Telegram SOS sent to ${contact.name} (${targetId})`);
        return { success: true };
      } else {
        console.error(`[Notifier] Telegram API error for ${targetId}:`, response.description);
        return { success: false, error: response.description };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * Broadcast SOS alerts to ALL emergency contacts on a trip.
 */
async function broadcastSOS(emergencyContacts, alertData) {
  if (!emergencyContacts || emergencyContacts.length === 0) {
    console.log("[Notifier] No emergency contacts configured for this trip — skipping SOS.");
    return [];
  }

  console.log(`[Notifier] Broadcasting SOS to ${emergencyContacts.length} emergency contact(s)...`);

  const results = await Promise.allSettled(
    emergencyContacts.map((contact) =>
      sendSOSAlert(contact, alertData)
    )
  );

  return results.map((r, i) => ({
    contact: emergencyContacts[i].name,
    platform: emergencyContacts[i].platform || 'telegram',
    contactId: emergencyContacts[i].contactId || emergencyContacts[i].chatId,
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
