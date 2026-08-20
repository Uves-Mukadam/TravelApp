import { useState } from "react";
import { sendTelemetry } from "../services/api";

/**
 * Telemetry presets for quick simulation.
 */
const PRESETS = {
  normal: {
    name: "Normal Trip",
    desc: "Highway cruising, all systems OK",
    data: {
      tripId: "trip_mumbai_goa_001",
      latitude: 15.8,
      longitude: 73.9,
      battery: 78,
      networkStatus: "online",
      movementStatus: "moving",
      lastCheckInMinutes: 12,
      routeDeviationKm: 0.3,
      speed: 65,
      vehicleType: "car",
    },
  },
  restStop: {
    name: "Rest Stop",
    desc: "Parked at a known rest area",
    data: {
      tripId: "trip_mumbai_goa_001",
      latitude: 16.2,
      longitude: 73.85,
      battery: 55,
      networkStatus: "online",
      movementStatus: "stopped",
      lastCheckInMinutes: 30,
      routeDeviationKm: 0.1,
      speed: 0,
      vehicleType: "car",
    },
  },
  warning: {
    name: "Warning Signs",
    desc: "Slight deviation, battery dropping",
    data: {
      tripId: "trip_mumbai_goa_001",
      latitude: 16.5,
      longitude: 73.6,
      battery: 32,
      networkStatus: "online",
      movementStatus: "moving",
      lastCheckInMinutes: 55,
      routeDeviationKm: 2.8,
      speed: 40,
      vehicleType: "car",
    },
  },
  emergency: {
    name: "🚨 Emergency",
    desc: "Offline, stopped, low battery, off route",
    data: {
      tripId: "trip_mumbai_goa_001",
      latitude: 16.9,
      longitude: 73.8,
      battery: 14,
      networkStatus: "offline",
      movementStatus: "stopped",
      lastCheckInMinutes: 125,
      routeDeviationKm: 6.2,
      speed: 0,
      vehicleType: "car",
    },
  },
};

/**
 * TelemetryForm Component
 *
 * Form to input traveler telemetry data with quick presets.
 * Sends data to the backend and passes the result up.
 */
export default function TelemetryForm({ onResult }) {
  const [formData, setFormData] = useState(PRESETS.normal.data);
  const [activePreset, setActivePreset] = useState("normal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function handlePreset(key) {
    setActivePreset(key);
    setFormData({ ...PRESETS[key].data });
    setError(null);
  }

  function handleChange(field, value) {
    setActivePreset(null);
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await sendTelemetry(formData);
      onResult(result);
    } catch (err) {
      setError(err.message || "Failed to send telemetry");
      console.error("[Simulator] Error:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" id="telemetry-form-card">
      <div className="card-header">
        <h3 className="card-title">📡 Traveler Telemetry</h3>
      </div>

      {/* Presets */}
      <div className="preset-grid">
        {Object.entries(PRESETS).map(([key, preset]) => (
          <button
            key={key}
            className={`preset-btn ${activePreset === key ? "active" : ""}`}
            onClick={() => handlePreset(key)}
            type="button"
            id={`preset-${key}`}
          >
            <span className="preset-name">{preset.name}</span>
            <span className="preset-desc">{preset.desc}</span>
          </button>
        ))}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="input-latitude">
              Latitude
            </label>
            <input
              id="input-latitude"
              className="form-input"
              type="number"
              step="0.001"
              value={formData.latitude}
              onChange={(e) =>
                handleChange("latitude", parseFloat(e.target.value))
              }
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="input-longitude">
              Longitude
            </label>
            <input
              id="input-longitude"
              className="form-input"
              type="number"
              step="0.001"
              value={formData.longitude}
              onChange={(e) =>
                handleChange("longitude", parseFloat(e.target.value))
              }
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="input-battery">
              Battery %
            </label>
            <input
              id="input-battery"
              className="form-input"
              type="number"
              min="0"
              max="100"
              value={formData.battery}
              onChange={(e) =>
                handleChange("battery", parseInt(e.target.value))
              }
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="input-speed">
              Speed (km/h)
            </label>
            <input
              id="input-speed"
              className="form-input"
              type="number"
              min="0"
              value={formData.speed || 0}
              onChange={(e) =>
                handleChange("speed", parseInt(e.target.value))
              }
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="input-network">
              Network Status
            </label>
            <select
              id="input-network"
              className="form-select"
              value={formData.networkStatus}
              onChange={(e) => handleChange("networkStatus", e.target.value)}
            >
              <option value="online">Online</option>
              <option value="offline">Offline</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="input-movement">
              Movement Status
            </label>
            <select
              id="input-movement"
              className="form-select"
              value={formData.movementStatus}
              onChange={(e) => handleChange("movementStatus", e.target.value)}
            >
              <option value="moving">Moving</option>
              <option value="stopped">Stopped</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="input-checkin">
              Last Check-in (mins ago)
            </label>
            <input
              id="input-checkin"
              className="form-input"
              type="number"
              min="0"
              value={formData.lastCheckInMinutes}
              onChange={(e) =>
                handleChange("lastCheckInMinutes", parseInt(e.target.value))
              }
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="input-deviation">
              Route Deviation (km)
            </label>
            <input
              id="input-deviation"
              className="form-input"
              type="number"
              step="0.1"
              min="0"
              value={formData.routeDeviationKm}
              onChange={(e) =>
                handleChange("routeDeviationKm", parseFloat(e.target.value))
              }
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="input-vehicle">
            Vehicle Type
          </label>
          <select
            id="input-vehicle"
            className="form-select"
            value={formData.vehicleType || "car"}
            onChange={(e) => handleChange("vehicleType", e.target.value)}
          >
            <option value="car">Car</option>
            <option value="bike">Bike</option>
            <option value="bus">Bus</option>
            <option value="train">Train</option>
            <option value="auto">Auto Rickshaw</option>
          </select>
        </div>

        {/* Error message */}
        {error && (
          <div
            style={{
              padding: "var(--space-sm) var(--space-md)",
              background: "var(--risk-critical-bg)",
              border: "1px solid var(--risk-critical-border)",
              borderRadius: "var(--radius-md)",
              color: "var(--risk-critical)",
              fontSize: "0.9rem",
              marginBottom: "var(--space-md)",
            }}
            id="telemetry-error"
          >
            ⚠ {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          className="btn btn-primary btn-lg"
          disabled={loading}
          id="submit-telemetry"
          style={{ width: "100%", marginTop: "var(--space-sm)" }}
        >
          {loading ? (
            <>
              <span className="spinner" /> Analyzing...
            </>
          ) : (
            "🔍 Analyze Risk"
          )}
        </button>
      </form>
    </div>
  );
}
