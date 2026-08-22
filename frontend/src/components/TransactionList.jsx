/**
 * TransactionList Component
 *
 * Renders a list of payments / transactions executed on Algorand.
 */

function formatINR(amount) {
  if (amount === undefined || amount === null) return "—";
  return `₹${amount.toLocaleString("en-IN")}`;
}

export default function TransactionList({ payments = [] }) {
  if (payments.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "var(--space-md) 0" }}>
        No blockchain payments recorded for this trip.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }} id="transaction-list">
      {payments.map((p) => (
        <div
          key={p.id}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: "var(--space-md)",
            alignItems: "center",
            padding: "var(--space-md)",
            background: "var(--bg-glass)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
          }}
          className="transaction-item"
        >
          <div>
            <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "center" }}>
              <span
                style={{
                  fontSize: "0.8rem",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  background: "rgba(56, 189, 248, 0.12)",
                  color: "var(--accent-primary)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                }}
              >
                {p.category?.replace(/_/g, " ")}
              </span>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                {p.timestamp ? new Date(p.timestamp).toLocaleTimeString() : ""}
              </span>
            </div>
            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", margin: "4px 0" }}>
              {p.description}
            </p>
            {p.txId && (
              <a
                href={p.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  textDecoration: "underline",
                }}
              >
                TX: {p.txId.substring(0, 10)}...{p.txId.substring(p.txId.length - 8)}
              </a>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text-primary)" }}>
              {formatINR(p.amount)}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {p.usdcAmount != null ? `~ ${p.usdcAmount} USDC` : `~ ${p.algoAmount?.toFixed(2)} ALGO`}
            </div>
            {p.method && (
              <span style={{
                fontSize: "0.65rem",
                padding: "1px 6px",
                borderRadius: "3px",
                background: p.method === "logicsig" ? "rgba(16,185,129,0.12)" : "rgba(99,102,241,0.12)",
                color: p.method === "logicsig" ? "#10b981" : "#6366f1",
                fontWeight: 600,
              }}>
                {p.method === "logicsig" ? "LogicSig" : p.method === "simulated" ? "Sim" : "Direct"}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
