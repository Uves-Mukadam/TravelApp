import { useState, useEffect, useCallback } from "react";
import { fetchIncidents } from "../services/api";
import IncidentList from "../components/IncidentList";

/**
 * Dashboard Page
 *
 * Shows real-time incident feed with summary statistics.
 * Auto-refreshes every 10 seconds.
 */
export default function Dashboard() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

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

      {/* Incident List */}
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
        <IncidentList incidents={incidents} loading={loading} />
      </div>
    </div>
  );
}
