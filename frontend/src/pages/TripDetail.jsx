import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import ItineraryCard from "../components/ItineraryCard";
import MapView from "../components/MapView";
import IncidentList from "../components/IncidentList";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

/**
 * Format currency in INR.
 */
function formatINR(amount) {
  if (amount === undefined || amount === null) return "—";
  return `₹${amount.toLocaleString("en-IN")}`;
}

/**
 * TripDetail Page
 *
 * Shows a single trip with:
 * - Trip info & status controls
 * - Interactive map with waypoints
 * - AI-generated itinerary
 * - Related incidents
 */
export default function TripDetail() {
  const { id } = useParams();
  const [trip, setTrip] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadTrip() {
    try {
      const res = await fetch(`${API_URL}/api/trips/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTrip(data.trip);
      setIncidents(data.incidents || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTrip();
  }, [id]);

  async function updateStatus(newStatus) {
    try {
      const res = await fetch(`${API_URL}/api/trips/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTrip(data.trip);
    } catch (err) {
      console.error("Failed to update trip:", err);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="loading-overlay">
          <span className="spinner" />
          <span>Loading trip...</span>
        </div>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="page">
        <div className="card" style={{ background: "var(--risk-critical-bg)", borderColor: "var(--risk-critical-border)" }}>
          <p style={{ color: "var(--risk-critical)" }}>
            ⚠ {error || "Trip not found"}
          </p>
          <Link to="/trips" style={{ fontSize: "0.9rem", marginTop: "var(--space-sm)", display: "inline-block" }}>
            ← Back to Trips
          </Link>
        </div>
      </div>
    );
  }

  const waypoints = trip.itinerary?.routeWaypoints || [];

  return (
    <div className="page" id="trip-detail-page">
      {/* Header */}
      <div className="page-header">
        <Link
          to="/trips"
          style={{
            fontSize: "0.85rem",
            color: "var(--text-muted)",
            display: "inline-block",
            marginBottom: "var(--space-sm)",
          }}
        >
          ← Back to Trips
        </Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 className="page-title">
              {trip.name || `${trip.origin} → ${trip.destination}`}
            </h1>
            <div
              style={{
                display: "flex",
                gap: "var(--space-lg)",
                color: "var(--text-secondary)",
                fontSize: "0.95rem",
                marginTop: "var(--space-xs)",
              }}
            >
              <span>📅 {trip.days} day{trip.days > 1 ? "s" : ""}</span>
              <span>💰 {formatINR(trip.budget)}</span>
              <span>🚗 {trip.preferences?.vehicleType || "car"}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "var(--space-sm)" }}>
            {trip.status === "planning" && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => updateStatus("active")}
                id="start-trip-btn"
              >
                ▶ Start Trip
              </button>
            )}
            {trip.status === "active" && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => updateStatus("completed")}
                id="complete-trip-btn"
              >
                ✓ Complete Trip
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Map */}
      {waypoints.length > 0 && (
        <div style={{ marginBottom: "var(--space-xl)" }}>
          <MapView waypoints={waypoints} incidents={incidents} height={380} />
        </div>
      )}

      {/* Two-column layout: Itinerary + Incidents */}
      <div className="simulator-layout">
        {/* Left: Itinerary */}
        <div>
          {trip.itinerary ? (
            <ItineraryCard itinerary={trip.itinerary} />
          ) : (
            <div className="card empty-state">
              <div className="empty-state-icon">📋</div>
              <div className="empty-state-title">No itinerary</div>
              <p>This trip was created without AI planning.</p>
            </div>
          )}
        </div>

        {/* Right: Incidents */}
        <div>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">🔔 Trip Incidents</h3>
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                {incidents.length} total
              </span>
            </div>
            <IncidentList incidents={incidents} loading={false} />
          </div>
        </div>
      </div>
    </div>
  );
}
