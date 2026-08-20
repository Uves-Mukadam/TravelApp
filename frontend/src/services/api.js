/**
 * API Service
 *
 * Handles communication with the backend Express server.
 */

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

/**
 * Send telemetry data to the backend for risk analysis.
 *
 * @param {Object} telemetry - Traveler telemetry data
 * @returns {Object} Risk analysis result with incident ID
 */
export async function sendTelemetry(telemetry) {
  const response = await fetch(`${API_URL}/api/telemetry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(telemetry),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch recent incidents from the backend.
 *
 * @param {number} limit - Max number of incidents
 * @returns {Object} { incidents: [...] }
 */
export async function fetchIncidents(limit = 50) {
  const response = await fetch(`${API_URL}/api/incidents?limit=${limit}`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Check backend health.
 *
 * @returns {Object} { status: "ok", ... }
 */
export async function checkHealth() {
  const response = await fetch(`${API_URL}/api/health`);
  return response.json();
}
