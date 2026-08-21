import { useState, useEffect } from "react";
import { sendTelemetry, fetchWithAuth } from "../services/api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

/**
 * Telemetry presets for quick simulation.
 */
const PRESETS = {
  normal: {
    name: "Normal Trip",
    desc: "Highway cruising, all systems OK",
    data: {
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
    name: "Emergency",
    desc: "Offline, stopped, low battery, off route",
    data: {
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
 * Dynamically binds to active database trips.
 */
export default function TelemetryForm({ onResult }) {
  const [formData, setFormData] = useState({
    tripId: "",
    ...PRESETS.normal.data,
  });
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState("");
  const [activePreset, setActivePreset] = useState("normal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch active trips at mount
  useEffect(() => {
    async function loadTrips() {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/trips`);
        if (res.ok) {
          const data = await res.json();
          const activeOrPlanning = data.trips || [];
          setTrips(activeOrPlanning);
          if (activeOrPlanning.length > 0) {
            const firstTrip = activeOrPlanning[0];
            setSelectedTripId(firstTrip.id);
            setFormData((prev) => ({
              ...prev,
              tripId: firstTrip.id,
              ...getCoordsForPreset("normal", firstTrip),
            }));
          }
        }
      } catch (err) {
        console.warn("Failed to load active trips for simulator:", err);
      }
    }
    loadTrips();
  }, []);

  // Calculate customized coordinates for the preset based on trip waypoints
  function getCoordsForPreset(presetKey, trip) {
    if (!trip || !trip.itinerary?.routeWaypoints) {
      return {
        latitude: PRESETS[presetKey].data.latitude,
        longitude: PRESETS[presetKey].data.longitude,
      };
    }

    const waypoints = trip.itinerary.routeWaypoints;
    const origin = waypoints.find((w) => w.type === "origin") || waypoints[0];
    const destination =
      waypoints.find((w) => w.type === "destination") || waypoints[waypoints.length - 1];
    const checkpoint = waypoints.find((w) => w.type === "checkpoint") || origin;

    switch (presetKey) {
      case "normal":
        return { latitude: origin.lat, longitude: origin.lng };
      case "restStop":
        return {
          latitude: (origin.lat + checkpoint.lat) / 2,
          longitude: (origin.lng + checkpoint.lng) / 2,
        };
      case "warning":
        return { latitude: checkpoint.lat, longitude: checkpoint.lng };
      case "emergency":
        return {
          latitude: destination.lat + 0.05, // Slightly offset from destination
          longitude: destination.lng - 0.05,
        };
      default:
        return {};
    }
  }

  function handlePreset(key) {
    setActivePreset(key);
    const targetTrip = trips.find((t) => t.id === selectedTripId);
    const presetCoords = getCoordsForPreset(key, targetTrip);

    setFormData({
      ...PRESETS[key].data,
      ...presetCoords,
      tripId: selectedTripId,
    });
    setError(null);
  }

  function handleTripChange(tripId) {
    setSelectedTripId(tripId);
    const targetTrip = trips.find((t) => t.id === tripId);
    const presetCoords = getCoordsForPreset(activePreset || "normal", targetTrip);

    setFormData((prev) => ({
      ...prev,
      tripId,
      ...presetCoords,
    }));
  }

  function handleChange(field, value) {
    setActivePreset(null);
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!formData.tripId) {
      setError("Please select a target trip to simulate telemetry.");
      setLoading(false);
      return;
    }

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
      <div className="card-header" style={{ marginBottom: "var(--space-md)" }}>
        <h3 className="card-title">Traveler Telemetry</h3>
      </div>

      {/* Target Trip Dropdown */}
      <div className="form-group" style={{ marginBottom: "var(--space-lg)" }}>
        <label className="form-label" htmlFor="select-target-trip">
          Target Simulated Trip
        </label>
        {trips.length > 0 ? (
          <select
            id="select-target-trip"
            className="form-select"
            value={selectedTripId}
            onChange={(e) => handleTripChange(e.target.value)}
          >
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.status})
              </option>
            ))}
          </select>
        ) : (
          <div style={{ fontSize: "0.85rem", color: "var(--risk-critical)", padding: "4px 0" }}>
            No trips found. Create a trip on the **Trips** page first.
          </div>
        )}
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
            disabled={trips.length === 0}
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
              required
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
              required
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
              required
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
          disabled={loading || trips.length === 0}
          id="submit-telemetry"
          style={{ width: "100%", marginTop: "var(--space-sm)" }}
        >
          {loading ? (
            <>
              <span className="spinner" /> Analyzing...
            </>
          ) : (
            "Analyze Risk"
          )}
        </button>
      </form>
    </div>
  );
}
