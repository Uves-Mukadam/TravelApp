import { useState, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { fetchWithAuth } from "../services/api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

/* Fix Leaflet default marker icons in Vite */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/** Blue pin for origin */
const originIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:16px;height:16px;
    background:#38bdf8;
    border:3px solid white;
    border-radius:50%;
    box-shadow:0 2px 8px rgba(0,0,0,0.5);
  "></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -14],
});

/** Purple pin for destination */
const destIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:16px;height:16px;
    background:#818cf8;
    border:3px solid white;
    border-radius:50%;
    box-shadow:0 2px 8px rgba(0,0,0,0.5);
  "></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -14],
});

/**
 * Inner component that listens to map clicks.
 * Must be rendered inside a <MapContainer>.
 */
function MapClickHandler({ pickingFor, onPick }) {
  useMapEvents({
    click(e) {
      if (pickingFor) {
        onPick(pickingFor, e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

/**
 * Reverse geocode a lat/lng to a place name using Nominatim.
 * Returns a human-readable name or a fallback coordinate string.
 */
async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      {
        headers: {
          "User-Agent": "AITravelGuardian/1.0 (travel-app@localhost)",
          Accept: "application/json",
        },
      }
    );
    if (!res.ok) throw new Error("bad response");
    const data = await res.json();
    // Prefer city → town → county → state → country
    const addr = data.address || {};
    return (
      addr.city ||
      addr.town ||
      addr.village ||
      addr.county ||
      addr.state_district ||
      addr.state ||
      data.display_name?.split(",")[0] ||
      `${lat.toFixed(4)}, ${lng.toFixed(4)}`
    );
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

/**
 * TripForm Component
 *
 * Form for creating a new trip with the Travel Planner Agent.
 * Includes an optional interactive map for manually picking
 * origin and destination locations.
 */
export default function TripForm({ onTripCreated, onCancel }) {
  const [formData, setFormData] = useState({
    origin: "Mumbai",
    destination: "Goa",
    days: 3,
    budget: 15000,
    vehicleType: "car",
  });

  // Picked coords from map (optional)
  const [originCoords, setOriginCoords] = useState(null);
  const [destCoords, setDestCoords] = useState(null);

  // Map UI state
  const [showMap, setShowMap] = useState(false);
  const [pickingFor, setPickingFor] = useState(null); // "origin" | "destination" | null
  const [geocoding, setGeocoding] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function handleChange(field, value) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear the matching pinned coord when the user types a new name
    if (field === "origin") setOriginCoords(null);
    if (field === "destination") setDestCoords(null);
  }

  /** Called by MapClickHandler when user clicks the map */
  const handleMapPick = useCallback(
    async (forField, lat, lng) => {
      setGeocoding(true);
      setPickingFor(null); // stop picking mode immediately
      const name = await reverseGeocode(lat, lng);
      if (forField === "origin") {
        setOriginCoords({ lat, lng });
        setFormData((prev) => ({ ...prev, origin: name }));
      } else {
        setDestCoords({ lat, lng });
        setFormData((prev) => ({ ...prev, destination: name }));
      }
      setGeocoding(false);
    },
    []
  );

  function startPicking(forField) {
    setPickingFor((prev) => (prev === forField ? null : forField));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetchWithAuth(`${API_URL}/api/trips`, {
        method: "POST",
        body: JSON.stringify({
          origin: formData.origin,
          destination: formData.destination,
          days: formData.days,
          budget: formData.budget,
          preferences: { vehicleType: formData.vehicleType },
          planTrip: true,
          // Send pre-picked coords so the backend skips geocoding
          ...(originCoords && { originCoords }),
          ...(destCoords && { destCoords }),
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      onTripCreated(data.trip);
    } catch (err) {
      setError(err.message || "Failed to create trip");
    } finally {
      setLoading(false);
    }
  }

  // Determine map center: prefer pinned coords, else default to India center
  const mapCenter =
    originCoords
      ? [originCoords.lat, originCoords.lng]
      : destCoords
      ? [destCoords.lat, destCoords.lng]
      : [20.5937, 78.9629];

  const pickHint =
    pickingFor === "origin"
      ? "Click on the map to set your origin"
      : pickingFor === "destination"
      ? "Click on the map to set your destination"
      : null;

  return (
    <div className="card" id="trip-form-card" style={{ animation: "slideUp 0.3s ease" }}>
      <div className="card-header">
        <h3 className="card-title">🗺️ Plan a New Trip</h3>
        {onCancel && (
          <button className="btn btn-secondary btn-sm" onClick={onCancel} type="button">
            ✕ Cancel
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        {/* Origin + Destination */}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="trip-origin">
              Origin
              {originCoords && (
                <span style={{ marginLeft: 6, fontSize: "0.75rem", color: "#38bdf8" }}>
                  📍 pinned
                </span>
              )}
            </label>
            <input
              id="trip-origin"
              className="form-input"
              type="text"
              value={formData.origin}
              onChange={(e) => handleChange("origin", e.target.value)}
              placeholder="e.g. Mumbai"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="trip-destination">
              Destination
              {destCoords && (
                <span style={{ marginLeft: 6, fontSize: "0.75rem", color: "#818cf8" }}>
                  📍 pinned
                </span>
              )}
            </label>
            <input
              id="trip-destination"
              className="form-input"
              type="text"
              value={formData.destination}
              onChange={(e) => handleChange("destination", e.target.value)}
              placeholder="e.g. Goa"
              required
            />
          </div>
        </div>

        {/* Map Picker Toggle */}
        <div style={{ marginBottom: "var(--space-md)" }}>
          <button
            type="button"
            className={`btn btn-secondary btn-sm`}
            onClick={() => {
              setShowMap((v) => !v);
              setPickingFor(null);
            }}
            id="toggle-map-picker"
            style={{ width: "100%", justifyContent: "center" }}
          >
            {showMap ? "🗺️ Hide Map Picker" : "📍 Pick Locations on Map"}
          </button>
        </div>

        {/* Interactive Map Picker */}
        {showMap && (
          <div
            style={{
              marginBottom: "var(--space-lg)",
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {/* Pick mode buttons */}
            <div
              style={{
                display: "flex",
                gap: "var(--space-sm)",
                padding: "var(--space-sm)",
                background: "rgba(0,0,0,0.3)",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <button
                type="button"
                onClick={() => startPicking("origin")}
                id="pick-origin-btn"
                style={{
                  padding: "5px 14px",
                  borderRadius: "6px",
                  border: `2px solid ${pickingFor === "origin" ? "#38bdf8" : "rgba(56,189,248,0.3)"}`,
                  background: pickingFor === "origin" ? "rgba(56,189,248,0.15)" : "transparent",
                  color: "#38bdf8",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  transition: "all 0.15s",
                }}
              >
                {pickingFor === "origin" ? "🔵 Clicking Origin…" : "🔵 Set Origin"}
              </button>
              <button
                type="button"
                onClick={() => startPicking("destination")}
                id="pick-destination-btn"
                style={{
                  padding: "5px 14px",
                  borderRadius: "6px",
                  border: `2px solid ${pickingFor === "destination" ? "#818cf8" : "rgba(129,140,248,0.3)"}`,
                  background: pickingFor === "destination" ? "rgba(129,140,248,0.15)" : "transparent",
                  color: "#818cf8",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  transition: "all 0.15s",
                }}
              >
                {pickingFor === "destination" ? "🟣 Clicking Destination…" : "🟣 Set Destination"}
              </button>

              {(originCoords || destCoords) && (
                <button
                  type="button"
                  onClick={() => {
                    setOriginCoords(null);
                    setDestCoords(null);
                    setFormData((prev) => ({ ...prev, origin: "Mumbai", destination: "Goa" }));
                    setPickingFor(null);
                  }}
                  style={{
                    marginLeft: "auto",
                    padding: "5px 10px",
                    borderRadius: "6px",
                    border: "1px solid rgba(239,68,68,0.3)",
                    background: "transparent",
                    color: "#ef4444",
                    cursor: "pointer",
                    fontSize: "0.78rem",
                  }}
                >
                  ✕ Clear Pins
                </button>
              )}

              {geocoding && (
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginLeft: 6 }}>
                  Resolving name…
                </span>
              )}
            </div>

            {/* Instruction hint */}
            {pickHint && (
              <div
                style={{
                  padding: "6px 12px",
                  background: "rgba(56,189,248,0.08)",
                  borderTop: "1px solid rgba(56,189,248,0.15)",
                  fontSize: "0.82rem",
                  color: "var(--text-secondary)",
                  textAlign: "center",
                }}
              >
                {pickHint}
              </div>
            )}

            {/* Leaflet map */}
            <MapContainer
              center={mapCenter}
              zoom={5}
              style={{
                height: "300px",
                width: "100%",
                cursor: pickingFor ? "crosshair" : "grab",
              }}
              scrollWheelZoom={true}
              key={showMap ? "map-open" : "map-closed"}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
              <MapClickHandler pickingFor={pickingFor} onPick={handleMapPick} />

              {originCoords && (
                <Marker position={[originCoords.lat, originCoords.lng]} icon={originIcon}>
                  <Popup>
                    <div style={{ color: "#222", fontSize: "12px" }}>
                      <strong>Origin</strong>
                      <br />
                      {formData.origin}
                    </div>
                  </Popup>
                </Marker>
              )}

              {destCoords && (
                <Marker position={[destCoords.lat, destCoords.lng]} icon={destIcon}>
                  <Popup>
                    <div style={{ color: "#222", fontSize: "12px" }}>
                      <strong>Destination</strong>
                      <br />
                      {formData.destination}
                    </div>
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          </div>
        )}

        {/* Duration + Budget */}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="trip-days">
              Duration (days)
            </label>
            <input
              id="trip-days"
              className="form-input"
              type="number"
              min="1"
              max="30"
              value={formData.days}
              onChange={(e) => handleChange("days", parseInt(e.target.value))}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="trip-budget">
              Budget (₹)
            </label>
            <input
              id="trip-budget"
              className="form-input"
              type="number"
              min="1000"
              step="500"
              value={formData.budget}
              onChange={(e) => handleChange("budget", parseInt(e.target.value))}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="trip-vehicle">
            Vehicle Type
          </label>
          <select
            id="trip-vehicle"
            className="form-select"
            value={formData.vehicleType}
            onChange={(e) => handleChange("vehicleType", e.target.value)}
          >
            <option value="car">Car</option>
            <option value="bike">Motorcycle</option>
            <option value="bus">Bus</option>
            <option value="train">Train</option>
            <option value="flight">Flight</option>
          </select>
        </div>

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
          >
            ⚠ {error}
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary btn-lg"
          disabled={loading}
          id="create-trip-btn"
          style={{ width: "100%" }}
        >
          {loading ? (
            <>
              <span className="spinner" /> AI is planning your trip...
            </>
          ) : (
            "🚀 Plan Trip with AI"
          )}
        </button>
      </form>
    </div>
  );
}
