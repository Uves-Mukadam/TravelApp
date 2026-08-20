import { useState } from "react";
import TelemetryForm from "../components/TelemetryForm";
import RiskCard from "../components/RiskCard";

/**
 * Simulator Page
 *
 * Left panel: Telemetry input form with presets
 * Right panel: Risk analysis result
 */
export default function Simulator() {
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  function handleResult(data) {
    setResult(data);
    setHistory((prev) => [data, ...prev].slice(0, 10)); // Keep last 10
  }

  return (
    <div className="page" id="simulator-page">
      <div className="page-header">
        <h1 className="page-title">🧪 Telemetry Simulator</h1>
        <p className="page-subtitle">
          Simulate traveler telemetry and observe the AI Guardian's risk
          analysis in real time.
        </p>
      </div>

      <div className="simulator-layout">
        {/* Left: Telemetry Form */}
        <TelemetryForm onResult={handleResult} />

        {/* Right: Result + History */}
        <div>
          {result ? (
            <RiskCard result={result} />
          ) : (
            <div className="card empty-state" id="result-empty">
              <div className="empty-state-icon">🛡️</div>
              <div className="empty-state-title">Ready to analyze</div>
              <p>
                Select a scenario preset or customize telemetry data, then
                click "Analyze Risk" to see the AI Guardian's assessment.
              </p>
            </div>
          )}

          {/* Analysis History */}
          {history.length > 1 && (
            <div className="card" style={{ marginTop: "var(--space-lg)" }}>
              <div className="card-header">
                <h3 className="card-title">📜 Recent Analyses</h3>
                <span
                  style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}
                >
                  Last {history.length}
                </span>
              </div>
              <div className="incident-list">
                {history.map((item, i) => {
                  const riskClass = item.riskLevel?.toLowerCase() || "low";
                  return (
                    <div
                      className="incident-item"
                      key={`${item.incidentId}-${i}`}
                      style={{ cursor: "pointer" }}
                      onClick={() => setResult(item)}
                    >
                      <span className={`risk-badge ${riskClass}`}>
                        {item.riskLevel}
                      </span>
                      <span className="incident-summary">
                        Score: {item.riskScore} — {item.reason?.slice(0, 80)}
                        {item.reason?.length > 80 ? "…" : ""}
                      </span>
                      <span className="incident-time">
                        {item.timestamp
                          ? new Date(item.timestamp).toLocaleTimeString()
                          : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
