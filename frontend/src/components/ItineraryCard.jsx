/**
 * ItineraryCard Component
 *
 * Displays an AI-generated trip itinerary with daily plans,
 * cost breakdown, and safety information.
 */

/**
 * Format currency in INR.
 */
function formatINR(amount) {
  if (amount === undefined || amount === null) return "—";
  return `₹${amount.toLocaleString("en-IN")}`;
}

export default function ItineraryCard({ itinerary }) {
  if (!itinerary) return null;

  const { costBreakdown, dailyPlans, safetyTips, summary, totalEstimatedCost } =
    itinerary;

  return (
    <div id="itinerary-card">
      {/* Summary & Cost */}
      <div className="card" style={{ marginBottom: "var(--space-lg)" }}>
        <div className="card-header">
          <h3 className="card-title">📋 Trip Plan</h3>
          <span
            style={{
              fontSize: "1.2rem",
              fontWeight: 700,
              color: "var(--accent-primary)",
            }}
          >
            {formatINR(totalEstimatedCost)}
          </span>
        </div>

        <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-lg)" }}>
          {summary}
        </p>

        {/* Cost Breakdown */}
        {costBreakdown && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: "var(--space-sm)",
            }}
          >
            {Object.entries(costBreakdown).map(([key, value]) => (
              <div
                key={key}
                style={{
                  background: "var(--bg-glass)",
                  padding: "var(--space-sm) var(--space-md)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: "1.1rem",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                  }}
                >
                  {formatINR(value)}
                </div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    textTransform: "capitalize",
                  }}
                >
                  {key.replace(/_/g, " ")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Daily Plans */}
      {dailyPlans &&
        dailyPlans.map((day) => (
          <div
            className="card"
            key={day.day}
            style={{ marginBottom: "var(--space-md)" }}
          >
            <div className="card-header">
              <h4 className="card-title">
                Day {day.day}: {day.title}
              </h4>
              {day.accommodation && (
                <span
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--text-muted)",
                  }}
                >
                  🏨 {day.accommodation.name} ({formatINR(day.accommodation.estimatedCost)})
                </span>
              )}
            </div>

            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "0.9rem",
                marginBottom: "var(--space-md)",
              }}
            >
              {day.description}
            </p>

            {/* Activities Timeline */}
            <div style={{ marginBottom: "var(--space-md)" }}>
              {day.activities?.map((act, i) => (
                <div
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "80px 1fr auto",
                    gap: "var(--space-md)",
                    padding: "var(--space-sm) 0",
                    borderBottom:
                      i < day.activities.length - 1
                        ? "1px solid var(--border-subtle)"
                        : "none",
                    alignItems: "start",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "var(--accent-primary)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {act.time}
                  </span>
                  <div>
                    <div
                      style={{
                        fontSize: "0.9rem",
                        color: "var(--text-primary)",
                        fontWeight: 500,
                      }}
                    >
                      {act.activity}
                    </div>
                    {act.location && (
                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        📍 {act.location}
                      </div>
                    )}
                    {act.notes && (
                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--text-muted)",
                          fontStyle: "italic",
                        }}
                      >
                        {act.notes}
                      </div>
                    )}
                  </div>
                  {act.estimatedCost > 0 && (
                    <span
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "var(--text-secondary)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatINR(act.estimatedCost)}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Safety Checkpoint */}
            {day.safetyCheckpoint && (
              <div
                style={{
                  background: "rgba(34, 197, 94, 0.06)",
                  border: "1px solid rgba(34, 197, 94, 0.15)",
                  borderRadius: "var(--radius-md)",
                  padding: "var(--space-sm) var(--space-md)",
                  fontSize: "0.85rem",
                }}
              >
                <span style={{ color: "var(--risk-low)", fontWeight: 600 }}>
                  🛡️ Safety Checkpoint — {day.safetyCheckpoint.time}
                </span>
                <span style={{ color: "var(--text-muted)", marginLeft: "var(--space-sm)" }}>
                  {day.safetyCheckpoint.location}
                  {day.safetyCheckpoint.notes
                    ? ` · ${day.safetyCheckpoint.notes}`
                    : ""}
                </span>
              </div>
            )}
          </div>
        ))}

      {/* Safety Tips */}
      {safetyTips && safetyTips.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h4 className="card-title">🛡️ Safety Tips</h4>
          </div>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
            }}
          >
            {safetyTips.map((tip, i) => (
              <li
                key={i}
                style={{
                  padding: "var(--space-sm) 0",
                  borderBottom:
                    i < safetyTips.length - 1
                      ? "1px solid var(--border-subtle)"
                      : "none",
                  color: "var(--text-secondary)",
                  fontSize: "0.9rem",
                  display: "flex",
                  gap: "var(--space-sm)",
                  alignItems: "flex-start",
                }}
              >
                <span style={{ color: "var(--risk-low)", flexShrink: 0 }}>✓</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
