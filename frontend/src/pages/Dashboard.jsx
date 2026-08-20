import { useState, useEffect, useCallback } from "react";
import { fetchIncidents } from "../services/api";
import RiskCard from "../components/RiskCard";
import MapView from "../components/MapView";

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
export default function Dashboard() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [selectedIncident, setSelectedIncident] = useState(null);

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
      const res = await fetch(
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

  // Initial load + auto-refresh every 10 seconds
  useEffect(() => {
    loadIncidents();
    const interval = setInterval(loadIncidents, 10000);
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
      <div className="page-header">
        <h1 className="page-title">📊 Incident Dashboard</h1>
        <p className="page-subtitle">
          Real-time monitoring of traveler safety incidents.
          {lastRefresh && (
            <span style={{ marginLeft: "var(--space-md)", fontSize: "0.85rem" }}>
              Last updated: {lastRefresh.toLocaleTimeString()}
            </span>
          )}
        </p>
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
            <h3 className="card-title">🔔 Recent Incidents</h3>
            <button
              className="btn btn-secondary btn-sm"
              onClick={loadIncidents}
              id="refresh-incidents"
            >
              ↻ Refresh
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
              <div className="empty-state-icon">📋</div>
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
                    <h4 className="card-title">📡 Raw Telemetry</h4>
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
            <div className="card empty-state">
              <div className="empty-state-icon">👆</div>
              <div className="empty-state-title">Select an incident</div>
              <p>Click on any incident to view its full details, telemetry data, and recommended actions.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
