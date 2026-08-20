/**
 * IncidentList Component
 *
 * Displays a list of logged incidents with risk level badges
 * and timestamps. Supports real-time updates.
 */

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
 * Truncate text to maxLen characters.
 */
function truncate(text, maxLen = 100) {
  if (!text || text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}

export default function IncidentList({ incidents, loading }) {
  if (loading) {
    return (
      <div className="loading-overlay" id="incidents-loading">
        <span className="spinner" />
        <span>Loading incidents...</span>
      </div>
    );
  }

  if (!incidents || incidents.length === 0) {
    return (
      <div className="empty-state" id="incidents-empty">
        <div className="empty-state-icon">📋</div>
        <div className="empty-state-title">No incidents yet</div>
        <p>Use the Simulator to send telemetry data and create incidents.</p>
      </div>
    );
  }

  return (
    <div className="incident-list" id="incident-list">
      {incidents.map((incident) => {
        const riskClass = incident.riskLevel?.toLowerCase() || "low";
        return (
          <div
            className="incident-item"
            key={incident.id}
            id={`incident-${incident.id}`}
          >
            <span className={`risk-badge ${riskClass}`}>
              {incident.riskLevel}
            </span>
            <span className="incident-summary">
              {truncate(incident.reason)}
            </span>
            <span className="incident-time">
              {formatTime(incident.timestamp)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
