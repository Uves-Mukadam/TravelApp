import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import TripForm from "../components/TripForm";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
import { fetchWithAuth } from "../services/api";

/**
 * Format currency in INR.
 */
function formatINR(amount) {
  if (amount === undefined || amount === null) return "—";
  return `₹${amount.toLocaleString("en-IN")}`;
}

const STATUS_STYLES = {
  planning: { color: "#38bdf8", bg: "rgba(56, 189, 248, 0.1)", border: "rgba(56, 189, 248, 0.25)" },
  active: { color: "#22c55e", bg: "rgba(34, 197, 94, 0.1)", border: "rgba(34, 197, 94, 0.25)" },
  completed: { color: "#94a3b8", bg: "rgba(148, 163, 184, 0.1)", border: "rgba(148, 163, 184, 0.25)" },
  cancelled: { color: "#ef4444", bg: "rgba(239, 68, 68, 0.1)", border: "rgba(239, 68, 68, 0.25)" },
};

/**
 * Trips Page
 *
 * Lists all trips and provides a form to create new ones.
 */
export default function Trips() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  async function loadTrips() {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/trips`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTrips(data.trips || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTrips();
  }, []);

  function handleTripCreated(trip) {
    setShowForm(false);
    // Navigate to the trip detail page
    navigate(`/trips/${trip.id}`);
  }

  async function handleDeleteTrip(e, tripId) {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to remove this trip?")) return;

    try {
      const res = await fetchWithAuth(`${API_URL}/api/trips/${tripId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTrips((prev) => prev.filter((t) => t.id !== tripId));
    } catch (err) {
      alert("Failed to delete trip: " + err.message);
    }
  }

  return (
    <div className="page" id="trips-page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Trips</h1>
          <p className="page-subtitle">
            Plan and manage your trips with AI assistance.
          </p>
        </div>
        {!showForm && (
          <button
            className="btn btn-primary"
            onClick={() => setShowForm(true)}
            id="new-trip-btn"
          >
            + New Trip
          </button>
        )}
      </div>

      {/* Trip Form */}
      {showForm && (
        <div style={{ marginBottom: "var(--space-xl)" }}>
          <TripForm
            onTripCreated={handleTripCreated}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="card"
          style={{
            marginBottom: "var(--space-lg)",
            background: "var(--risk-critical-bg)",
            borderColor: "var(--risk-critical-border)",
          }}
        >
          <p style={{ color: "var(--risk-critical)" }}>
            Failed to load trips: {error}
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "var(--space-xs)" }}>
            Make sure the backend is running on{" "}
            <code style={{ color: "var(--accent-primary)" }}>http://localhost:3001</code>
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="loading-overlay">
          <span className="spinner" />
          <span>Loading trips...</span>
        </div>
      )}

      {/* Trip List */}
      {!loading && trips.length === 0 && !showForm && (
        <div className="card empty-state">
          <div className="empty-state-title">No trips yet</div>
          <p>Click "New Trip" to plan your first AI-assisted trip.</p>
        </div>
      )}

      {!loading && trips.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          {trips.map((trip) => {
            const st = STATUS_STYLES[trip.status] || STATUS_STYLES.planning;
            return (
              <div
                className="card"
                key={trip.id}
                style={{ cursor: "pointer" }}
                onClick={() => navigate(`/trips/${trip.id}`)}
                id={`trip-${trip.id}`}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto auto",
                    gap: "var(--space-md)",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <h3
                      style={{
                        fontSize: "1.1rem",
                        fontWeight: 600,
                        marginBottom: "var(--space-xs)",
                      }}
                    >
                      {trip.name || `${trip.origin} → ${trip.destination}`}
                    </h3>
                    <div style={{ display: "flex", gap: "var(--space-lg)", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                      <span>{trip.days} day{trip.days > 1 ? "s" : ""}</span>
                      <span>Budget: {formatINR(trip.budget)}</span>
                      {trip.createdAt && (
                        <span>
                          Created: {new Date(trip.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    style={{
                      padding: "var(--space-xs) var(--space-md)",
                      borderRadius: "100px",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: st.color,
                      background: st.bg,
                      border: `1px solid ${st.border}`,
                    }}
                  >
                    {trip.status}
                  </span>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={(e) => handleDeleteTrip(e, trip.id)}
                    title="Remove Trip"
                    style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                  >
                    Remove
                  </button>
                  <span style={{ color: "var(--text-muted)", fontSize: "1.2rem" }}>→</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
