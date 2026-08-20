import { useState } from "react";
import { fetchWithAuth } from "../services/api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function PaymentModal({ tripId, onPaymentComplete, onClose }) {
  const [formData, setFormData] = useState({
    amountINR: 350,
    category: "roadside_assistance",
    description: "Manual dispatch of highway towing service",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetchWithAuth(`${API_URL}/api/trips/${tripId}/payments`, {
        method: "POST",
        body: JSON.stringify(formData),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || result.error || `HTTP ${response.status}`);
      }

      setSuccess(result.payment);
      if (onPaymentComplete) {
        onPaymentComplete(result.payment);
      }
    } catch (err) {
      setError(err.message || "Payment validation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(10, 14, 26, 0.8)",
        backdropFilter: "blur(8px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      id="payment-modal-overlay"
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: "460px",
          position: "relative",
          animation: "slideUp 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        id="payment-modal"
      >
        <div className="card-header" style={{ marginBottom: "var(--space-md)" }}>
          <h3 className="card-title">💳 x402 Micropayment</h3>
          {!loading && !success && (
            <button className="btn btn-secondary btn-sm" onClick={onClose} type="button">
              ✕ Close
            </button>
          )}
        </div>

        {success ? (
          <div style={{ textAlign: "center", padding: "var(--space-md) 0" }}>
            <div style={{ fontSize: "3rem", marginBottom: "var(--space-md)" }}>✅</div>
            <h4 style={{ color: "var(--risk-low)", marginBottom: "var(--space-sm)" }}>
              Payment Settled!
            </h4>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "var(--space-lg)" }}>
              Transaction verified and completed on Algorand Testnet.
            </p>
            <div
              style={{
                background: "var(--bg-glass)",
                padding: "var(--space-md)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)",
                textAlign: "left",
                marginBottom: "var(--space-lg)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Amount</span>
                <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>₹{success.amount}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Algorand equivalent</span>
                <span style={{ color: "var(--text-primary)" }}>{success.algoAmount} ALGO</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Tx ID</span>
                <a
                  href={success.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: "0.8rem", color: "var(--accent-primary)", textDecoration: "underline" }}
                >
                  {success.txId.substring(0, 12)}...
                </a>
              </div>
            </div>
            <button className="btn btn-primary" onClick={onClose} type="button" style={{ width: "100%" }}>
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="pay-category">
                Payment Category
              </label>
              <select
                id="pay-category"
                className="form-select"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              >
                <option value="roadside_assistance">Roadside Assistance</option>
                <option value="emergency_api">Emergency Weather/Maps API</option>
                <option value="weather">Premium Weather Info</option>
                <option value="maps">Premium Map Service</option>
                <option value="shopping">Shopping (Restricted)</option>
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="pay-amount">
                  Amount (₹ INR)
                </label>
                <input
                  id="pay-amount"
                  className="form-input"
                  type="number"
                  min="1"
                  value={formData.amountINR}
                  onChange={(e) =>
                    setFormData({ ...formData, amountINR: parseInt(e.target.value) })
                  }
                  required
                />
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  fontSize: "0.8rem",
                  color: "var(--text-muted)",
                  paddingTop: "var(--space-md)",
                }}
              >
                ~ {(formData.amountINR / 100).toFixed(2)} ALGO
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="pay-desc">
                Description / Purpose
              </label>
              <input
                id="pay-desc"
                className="form-input"
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                required
              />
            </div>

            {error && (
              <div
                style={{
                  padding: "var(--space-sm) var(--space-md)",
                  background: "var(--risk-critical-bg)",
                  border: "1px solid var(--risk-critical-border)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--risk-critical)",
                  fontSize: "0.85rem",
                  marginBottom: "var(--space-md)",
                }}
              >
                <strong>Policy Engine Denied:</strong>
                <p style={{ marginTop: "2px" }}>{error}</p>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading}
              style={{ width: "100%", marginTop: "var(--space-sm)" }}
            >
              {loading ? (
                <>
                  <span className="spinner" /> Signing Algorand Transaction...
                </>
              ) : (
                "🔒 Authorize & Pay via x402"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
