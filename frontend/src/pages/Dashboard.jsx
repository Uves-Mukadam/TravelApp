import { useState, useEffect, useCallback, useRef } from "react";
import { fetchIncidents, fetchWithAuth } from "../services/api";
import RiskCard from "../components/RiskCard";
import MapView from "../components/MapView";
import { subscribeToIncidents } from "../services/firebase";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

/** Fix Leaflet default icons in Vite */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/** Red pin for incident location */
const incidentPin = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

/** Reverse geocode lat/lng → human-readable place name via Nominatim */
async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "User-Agent": "AITravelGuardian/1.0", Accept: "application/json" } }
    );
    if (!res.ok) throw new Error("bad response");
    const data = await res.json();
    const addr = data.address || {};
    const parts = [
      addr.road || addr.pedestrian || addr.footway,
      addr.suburb || addr.neighbourhood,
      addr.city || addr.town || addr.village || addr.county,
      addr.state,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : (data.display_name?.split(",").slice(0, 3).join(",") || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

/** Inner Leaflet click handler (must live inside MapContainer) */
function LocClickHandler({ onPick }) {
  useMapEvents({
    click(e) { onPick(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

/**
 * Format ISO timestamp to a human-readable relative or absolute time.
 */
function formatTime(isoString) {
  if (!isoString) return "—";
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Dashboard Page
 *
 * Shows real-time incident feed with summary statistics,
 * a map of recent incidents, and expandable incident detail.
 * Auto-refreshes every 10 seconds.
 */
const INCIDENT_TYPES = [
  { value: "theft", label: "Theft / Robbery" },
  { value: "lost_item", label: "Lost Item / Belongings" },
  { value: "medical", label: "Medical Emergency" },
  { value: "accident", label: "Vehicle Accident" },
  { value: "harassment", label: "Harassment / Assault" },
  { value: "missing_person", label: "Missing Person" },
  { value: "natural_disaster", label: "Natural Disaster / Flood" },
  { value: "other", label: "Other Emergency" },
];

export default function Dashboard() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [selectedIncident, setSelectedIncident] = useState(null);

  // Report Incident modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportStatus, setReportStatus] = useState(null); // null | "sending" | "sent"
  const [reportForm, setReportForm] = useState({
    type: "theft",
    description: "",
    location: "",
    name: "",
  });
  // Location picker state
  const [locPickedCoords, setLocPickedCoords] = useState(null);   // { lat, lng }
  const [showLocMap, setShowLocMap]     = useState(false);
  const [gpsLoading, setGpsLoading]     = useState(false);
  const [geocoding, setGeocoding]       = useState(false);

  const loadIncidents = useCallback(async () => {
    try {
      const data = await fetchIncidents(50);
      setIncidents(data.incidents || []);
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err.message);
      console.error("[Dashboard] Failed to load incidents:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleApproveAction = async (actionName) => {
    if (!selectedIncident) return;
    try {
      const res = await fetchWithAuth(
        `${API_URL}/api/incidents/${selectedIncident.id}/actions/${actionName}/approve`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      
      // Update local selected incident state
      setSelectedIncident(data.incident);
      // Refresh incidents list to update status markers
      loadIncidents();
    } catch (err) {
      console.error("Failed to approve action:", err);
      alert(`Action approval failed: ${err.message}`);
    }
  };

  function openReportModal() {
    setReportForm({ type: "theft", description: "", location: "", name: "" });
    setReportStatus(null);
    setLocPickedCoords(null);
    setShowLocMap(false);
    setShowReportModal(true);
  }

  function closeReportModal() {
    setShowReportModal(false);
    setReportStatus(null);
    setShowLocMap(false);
  }

  /** Browser GPS → Nominatim reverse geocode */
  async function handleUseMyLocation() {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude: lat, longitude: lng } = coords;
        setLocPickedCoords({ lat, lng });
        setGeocoding(true);
        const name = await reverseGeocode(lat, lng);
        setReportForm((p) => ({ ...p, location: name }));
        setGeocoding(false);
        setGpsLoading(false);
        setShowLocMap(true);   // show map so user can see the pin
      },
      (err) => {
        setGpsLoading(false);
        alert("Could not get location: " + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  /** Map click → reverse geocode */
  async function handleMapPick(lat, lng) {
    setLocPickedCoords({ lat, lng });
    setGeocoding(true);
    const name = await reverseGeocode(lat, lng);
    setReportForm((p) => ({ ...p, location: name }));
    setGeocoding(false);
  }

  async function handleReportIncident(e) {
    e.preventDefault();
    setReportStatus("sending");
    // Simulate a 1.5s dispatch to authorities
    await new Promise((r) => setTimeout(r, 1500));
    setReportStatus("sent");
    // Auto-close after 4 seconds
    setTimeout(() => closeReportModal(), 4000);
  }

  // Real-time listener subscription (falls back to polling if Firebase not configured)
  useEffect(() => {
    const unsubscribe = subscribeToIncidents((realTimeIncidents) => {
      setIncidents(realTimeIncidents);
      setLoading(false);
      setError(null);
      setLastRefresh(new Date());
    }, 50);

    if (unsubscribe) {
      console.log("[Dashboard] Listening to Firestore real-time snapshots.");
      return () => unsubscribe();
    }

    // Fallback: poll every 5 seconds
    console.log("[Dashboard] Firebase config missing. Using HTTP polling fallback (5s).");
    loadIncidents();
    const interval = setInterval(loadIncidents, 5000);
    return () => clearInterval(interval);
  }, [loadIncidents]);

  // Compute stats
  const stats = {
    total: incidents.length,
    critical: incidents.filter((i) => i.riskLevel === "CRITICAL").length,
    high: incidents.filter((i) => i.riskLevel === "HIGH").length,
    medium: incidents.filter((i) => i.riskLevel === "MEDIUM").length,
    low: incidents.filter((i) => i.riskLevel === "LOW").length,
  };

  // Incidents with valid coordinates for the map
  const mappableIncidents = incidents.filter(
    (i) => i.telemetry?.latitude && i.telemetry?.longitude
  );

  return (
    <div className="page" id="dashboard-page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "var(--space-md)" }}>
        <div>
          <h1 className="page-title">Incident Dashboard</h1>
          <p className="page-subtitle">
            Real-time monitoring of traveler safety incidents.
            {lastRefresh && (
              <span style={{ marginLeft: "var(--space-md)", fontSize: "0.85rem" }}>
                Last updated: {lastRefresh.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <button
          id="report-incident-btn"
          className="btn"
          onClick={openReportModal}
          style={{
            background: "linear-gradient(135deg, #dc2626, #b91c1c)",
            color: "#fff",
            border: "1px solid rgba(220,38,38,0.5)",
            fontWeight: 700,
            letterSpacing: "0.02em",
            padding: "10px 22px",
            borderRadius: "var(--radius-md)",
            boxShadow: "0 2px 12px rgba(220,38,38,0.25)",
            transition: "all 0.2s",
          }}
        >
          Report Incident
        </button>
      </div>

      {/* Stats Row */}
      <div className="stats-row" id="dashboard-stats">
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--text-primary)" }}>
            {stats.total}
          </div>
          <div className="stat-label">Total Incidents</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--risk-critical)" }}>
            {stats.critical}
          </div>
          <div className="stat-label">Critical</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--risk-high)" }}>
            {stats.high}
          </div>
          <div className="stat-label">High</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--risk-low)" }}>
            {stats.low + stats.medium}
          </div>
          <div className="stat-label">Low / Medium</div>
        </div>
      </div>

      {/* Map of Incidents */}
      {mappableIncidents.length > 0 && (
        <div style={{ marginBottom: "var(--space-xl)" }}>
          <MapView waypoints={[]} incidents={mappableIncidents} height={320} />
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div
          className="card"
          style={{
            marginBottom: "var(--space-lg)",
            background: "var(--risk-critical-bg)",
            borderColor: "var(--risk-critical-border)",
          }}
          id="dashboard-error"
        >
          <p style={{ color: "var(--risk-critical)" }}>
            ⚠ Failed to load incidents: {error}
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "var(--space-xs)" }}>
            Make sure the backend is running on{" "}
            <code style={{ color: "var(--accent-primary)" }}>
              http://localhost:3001
            </code>
          </p>
        </div>
      )}

      {/* Two-column: Incident List + Detail */}
      <div className="simulator-layout">
        {/* Left: Incident List */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Recent Incidents</h3>
            <button
              className="btn btn-secondary btn-sm"
              onClick={loadIncidents}
              id="refresh-incidents"
            >
              Refresh
            </button>
          </div>

          {loading && (
            <div className="loading-overlay">
              <span className="spinner" />
              <span>Loading incidents...</span>
            </div>
          )}

          {!loading && incidents.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-title">No incidents yet</div>
              <p>Use the Simulator to send telemetry and create incidents.</p>
            </div>
          )}

          {!loading && incidents.length > 0 && (
            <div className="incident-list" id="incident-list">
              {incidents.map((incident) => {
                const riskClass = incident.riskLevel?.toLowerCase() || "low";
                const isSelected = selectedIncident?.id === incident.id;
                return (
                  <div
                    className="incident-item"
                    key={incident.id}
                    id={`incident-${incident.id}`}
                    style={{
                      cursor: "pointer",
                      borderColor: isSelected
                        ? "var(--accent-primary)"
                        : undefined,
                      background: isSelected
                        ? "rgba(56, 189, 248, 0.05)"
                        : undefined,
                    }}
                    onClick={() =>
                      setSelectedIncident(
                        isSelected ? null : incident
                      )
                    }
                  >
                    <span className={`risk-badge ${riskClass}`}>
                      {incident.riskLevel}
                    </span>
                    <span className="incident-summary">
                      {incident.reason?.slice(0, 80)}
                      {incident.reason?.length > 80 ? "…" : ""}
                    </span>
                    <span className="incident-time">
                      {formatTime(incident.timestamp)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Incident Detail */}
        <div>
          {selectedIncident ? (
            <div>
              <RiskCard result={selectedIncident} onApproveAction={handleApproveAction} />

              {/* Telemetry Data */}
              {selectedIncident.telemetry && (
                <div className="card" style={{ marginTop: "var(--space-lg)" }}>
                  <div className="card-header">
                    <h4 className="card-title">Raw Telemetry</h4>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      Trip: {selectedIncident.tripId || "—"}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "var(--space-sm)",
                    }}
                  >
                    {Object.entries(selectedIncident.telemetry).map(
                      ([key, value]) => (
                        <div
                          key={key}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "var(--space-xs) var(--space-sm)",
                            background: "var(--bg-glass)",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border-subtle)",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.8rem",
                              color: "var(--text-muted)",
                            }}
                          >
                            {key}
                          </span>
                          <span
                            style={{
                              fontSize: "0.85rem",
                              fontWeight: 600,
                              color: "var(--text-primary)",
                            }}
                          >
                            {String(value)}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="card empty-state" id="incident-detail-empty">
              <div className="empty-state-title">Select an incident</div>
              <p>Click on any incident from the list to view its full details.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Report Incident Modal ── */}
      {showReportModal && (
        <div
          id="report-incident-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && closeReportModal()}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "var(--space-md)",
          }}
        >
          <div
            id="report-incident-modal"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-glass)",
              borderRadius: "var(--radius-lg)",
              padding: "var(--space-xl)",
              width: "100%",
              maxWidth: "500px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
            }}
          >
            {reportStatus !== "sent" ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-lg)" }}>
                  <div>
                    <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Report an Incident</h2>
                    <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "4px" }}>Authorities will be notified immediately.</p>
                  </div>
                  <button
                    onClick={closeReportModal}
                    style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1.4rem", lineHeight: 1, padding: "4px" }}
                    id="close-report-modal"
                  >
                    ×
                  </button>
                </div>

                <form onSubmit={handleReportIncident}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="report-type">Incident Type</label>
                    <select
                      id="report-type"
                      className="form-select"
                      value={reportForm.type}
                      onChange={(e) => setReportForm((p) => ({ ...p, type: e.target.value }))}
                      required
                    >
                      {INCIDENT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="report-location">Your Current Location</label>

                    {/* Action buttons row */}
                    <div style={{ display: "flex", gap: "var(--space-xs)", marginBottom: "var(--space-xs)" }}>
                      <button
                        type="button"
                        id="use-gps-btn"
                        onClick={handleUseMyLocation}
                        disabled={gpsLoading || geocoding}
                        style={{
                          flex: 1,
                          padding: "7px 10px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--accent-primary)",
                          background: "rgba(56,189,248,0.08)",
                          color: "var(--accent-primary)",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: gpsLoading || geocoding ? "not-allowed" : "pointer",
                          opacity: gpsLoading || geocoding ? 0.6 : 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                          transition: "all 0.15s",
                        }}
                      >
                        {gpsLoading ? (
                          <><span className="spinner" style={{ width: "12px", height: "12px", borderWidth: "2px" }} />Locating...</>
                        ) : geocoding ? (
                          <><span className="spinner" style={{ width: "12px", height: "12px", borderWidth: "2px" }} />Geocoding...</>
                        ) : "Use My Location"}
                      </button>

                      <button
                        type="button"
                        id="toggle-loc-map-btn"
                        onClick={() => setShowLocMap((v) => !v)}
                        style={{
                          flex: 1,
                          padding: "7px 10px",
                          borderRadius: "var(--radius-sm)",
                          border: `1px solid ${showLocMap ? "var(--accent-secondary)" : "var(--border-glass)"}`,
                          background: showLocMap ? "rgba(129,140,248,0.1)" : "transparent",
                          color: showLocMap ? "var(--accent-secondary)" : "var(--text-secondary)",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        {showLocMap ? "Hide Map" : "Pick on Map"}
                      </button>
                    </div>

                    {/* Text input */}
                    <input
                      id="report-location"
                      className="form-input"
                      type="text"
                      placeholder={geocoding ? "Fetching address..." : "e.g. Near Calangute Beach, Goa"}
                      value={reportForm.location}
                      onChange={(e) => setReportForm((p) => ({ ...p, location: e.target.value }))}
                      required
                      style={{ marginBottom: showLocMap ? "var(--space-xs)" : 0 }}
                    />

                    {/* Collapsible map */}
                    {showLocMap && (
                      <div style={{
                        borderRadius: "var(--radius-md)",
                        overflow: "hidden",
                        border: "1px solid var(--border-glass)",
                        marginTop: "var(--space-xs)",
                      }}>
                        <p style={{ padding: "6px 10px", fontSize: "0.75rem", color: "var(--text-muted)", background: "rgba(0,0,0,0.2)", margin: 0 }}>
                          Click anywhere on the map to set your location
                        </p>
                        <MapContainer
                          center={locPickedCoords ? [locPickedCoords.lat, locPickedCoords.lng] : [20.5937, 78.9629]}
                          zoom={locPickedCoords ? 14 : 5}
                          style={{ height: "220px", width: "100%" }}
                          scrollWheelZoom
                          key={showLocMap ? "loc-map-open" : "loc-map-closed"}
                        >
                          <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                            url={
                              document.documentElement.getAttribute("data-theme") === "light"
                                ? "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                                : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                            }
                          />
                          <LocClickHandler onPick={handleMapPick} />
                          {locPickedCoords && (
                            <Marker
                              position={[locPickedCoords.lat, locPickedCoords.lng]}
                              icon={incidentPin}
                            />
                          )}
                        </MapContainer>
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="report-name">Your Name (optional)</label>
                    <input
                      id="report-name"
                      className="form-input"
                      type="text"
                      placeholder="e.g. Uves"
                      value={reportForm.name}
                      onChange={(e) => setReportForm((p) => ({ ...p, name: e.target.value }))}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="report-description">Brief Description</label>
                    <textarea
                      id="report-description"
                      className="form-input"
                      rows={3}
                      placeholder="Describe what happened..."
                      value={reportForm.description}
                      onChange={(e) => setReportForm((p) => ({ ...p, description: e.target.value }))}
                      required
                      style={{ resize: "vertical", minHeight: "80px" }}
                    />
                  </div>

                  <div style={{ display: "flex", gap: "var(--space-sm)", marginTop: "var(--space-md)" }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={closeReportModal}
                      style={{ flex: 1 }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      id="submit-report-btn"
                      disabled={reportStatus === "sending"}
                      style={{
                        flex: 2,
                        background: "linear-gradient(135deg, #dc2626, #b91c1c)",
                        color: "#fff",
                        border: "1px solid rgba(220,38,38,0.4)",
                        borderRadius: "var(--radius-md)",
                        padding: "10px",
                        fontWeight: 700,
                        cursor: reportStatus === "sending" ? "not-allowed" : "pointer",
                        opacity: reportStatus === "sending" ? 0.75 : 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        transition: "all 0.2s",
                      }}
                    >
                      {reportStatus === "sending" ? (
                        <><span className="spinner" style={{ borderTopColor: "#fff", borderColor: "rgba(255,255,255,0.3)" }} />Dispatching...</>
                      ) : "Alert Authorities Now"}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              /* Success state */
              <div style={{ textAlign: "center", padding: "var(--space-lg) 0" }}>
                <div style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  background: "rgba(34,197,94,0.15)",
                  border: "2px solid #22c55e",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto var(--space-lg)",
                  fontSize: "2rem",
                }}
                >
                  ✓
                </div>
                <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#22c55e", marginBottom: "var(--space-sm)" }}>
                  Authorities Notified!
                </h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", marginBottom: "var(--space-xs)" }}>
                  The nearest police station and emergency services have been alerted.
                </p>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  Incident Type: <strong style={{ color: "var(--text-primary)" }}>
                    {INCIDENT_TYPES.find((t) => t.value === reportForm.type)?.label}
                  </strong>
                </p>
                {reportForm.location && (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "4px" }}>
                    Location reported: <strong style={{ color: "var(--text-primary)" }}>{reportForm.location}</strong>
                  </p>
                )}
                <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "var(--space-md)" }}>
                  This window will close automatically...
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
