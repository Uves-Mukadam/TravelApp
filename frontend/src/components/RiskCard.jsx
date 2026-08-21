/**
 * RiskCard Component
 *
 * Displays a risk assessment result with color-coded badge,
 * score meter, reason, key factors, and recommended actions.
 */

/**
 * Get the CSS color variable for a risk level.
 */
function getRiskColor(level) {
  const map = {
    LOW: "var(--risk-low)",
    MEDIUM: "var(--risk-medium)",
    HIGH: "var(--risk-high)",
    CRITICAL: "var(--risk-critical)",
  };
  return map[level] || "var(--text-muted)";
}

export default function RiskCard({ result, onApproveAction }) {
  if (!result) return null;

  const riskClass = result.riskLevel?.toLowerCase() || "low";

  return (
    <div className="card result-panel" id="risk-card">
      {/* Header with badge and score */}
      <div className="result-header">
        <span className={`risk-badge ${riskClass}`} id="risk-level-badge">
          {result.riskLevel}
        </span>
        {result.urgency && result.urgency !== "none" && (
          <span
            style={{
              fontSize: "0.8rem",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Urgency: {result.urgency}
          </span>
        )}
      </div>

      {/* Risk Score Meter */}
      {result.riskScore !== undefined && (
        <div className="risk-score-meter" style={{ marginBottom: "var(--space-lg)" }}>
          <div className="risk-score-bar-bg">
            <div
              className="risk-score-bar-fill"
              style={{
                width: `${result.riskScore}%`,
                background: `linear-gradient(90deg, var(--risk-low), ${getRiskColor(result.riskLevel)})`,
              }}
            />
          </div>
          <span
            className="risk-score-value"
            style={{ color: getRiskColor(result.riskLevel) }}
          >
            {result.riskScore}
          </span>
        </div>
      )}

      {/* Reason */}
      <div className="result-reason" id="risk-reason">
        {result.reason}
      </div>

      {/* Key Factors */}
      {result.keyFactors && result.keyFactors.length > 0 && (
        <div style={{ marginBottom: "var(--space-lg)" }}>
          <h4
            style={{
              fontSize: "0.85rem",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "var(--space-sm)",
            }}
          >
            Key Factors
          </h4>
          <ul className="factors-list" id="key-factors-list">
            {result.keyFactors.map((factor, i) => (
              <li key={i}>{factor}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommended Actions */}
      {result.recommendedActions && result.recommendedActions.length > 0 && (
        <div>
          <h4
            style={{
              fontSize: "0.85rem",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "var(--space-sm)",
            }}
          >
            Recommended Actions
          </h4>
          <div className="actions-list" id="actions-list" style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
            {result.recommendedActions.map((action, i) => {
              const actionData =
                typeof action === "string" ? { action } : action;
              const statusClass = actionData.authorized
                ? "authorized"
                : actionData.requiresApproval
                  ? "requires-approval"
                  : "";
              const icon = actionData.authorized
                ? "✓"
                : actionData.requiresApproval
                  ? "⏳"
                  : "→";
              return (
                <div key={i} style={{ display: "flex", gap: "10px", alignItems: "center", width: "100%" }}>
                  <span className={`action-tag ${statusClass}`} style={{ flex: 1 }}>
                    {icon} {actionData.action}
                  </span>
                  {actionData.requiresApproval && onApproveAction && (
                    <button
                      onClick={() => onApproveAction(actionData.action)}
                      className="btn btn-primary btn-sm"
                      style={{ padding: "2px 10px", fontSize: "0.75rem" }}
                    >
                      👍 Approve
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
