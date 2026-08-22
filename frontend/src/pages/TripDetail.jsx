import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import ItineraryCard from "../components/ItineraryCard";
import MapView from "../components/MapView";
import IncidentList from "../components/IncidentList";
import TransactionList from "../components/TransactionList";
import PaymentModal from "../components/PaymentModal";
import { subscribeToPayments } from "../services/firebase";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
import { fetchWithAuth } from "../services/api";

/**
 * Format currency in INR.
 */
function formatINR(amount) {
  if (amount === undefined || amount === null) return "—";
  return `₹${amount.toLocaleString("en-IN")}`;
}

/**
 * TripDetail Page
 *
 * Shows a single trip with:
 * - Trip info & status controls
 * - Interactive map with waypoints
 * - AI-generated itinerary
 * - Wallet and Budget status (Algorand integrations)
 * - Micropayments transaction history (x402 integrations)
 * - Related incidents list
 */
export default function TripDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [copying, setCopying] = useState(false);

  function copyAddress() {
    if (wallet?.address) {
      navigator.clipboard.writeText(wallet.address);
      setCopying(true);
      setTimeout(() => setCopying(false), 2000);
    }
  }

  async function loadTripData() {
    try {
      // 1. Fetch trip and incidents
      const resTrip = await fetchWithAuth(`${API_URL}/api/trips/${id}`);
      if (!resTrip.ok) throw new Error(`HTTP ${resTrip.status}`);
      const dataTrip = await resTrip.json();
      setTrip(dataTrip.trip);
      setIncidents(dataTrip.incidents || []);

      // 2. Fetch payments history
      const resPayments = await fetchWithAuth(`${API_URL}/api/trips/${id}/payments`);
      if (resPayments.ok) {
        const dataPayments = await resPayments.json();
        setPayments(dataPayments.payments || []);
      }

      // 3. Fetch traveler wallet status
      const resWallet = await fetchWithAuth(`${API_URL}/api/wallet/balance`);
      if (resWallet.ok) {
        const dataWallet = await resWallet.json();
        setWallet(dataWallet);
      }

      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Initial fetch
    loadTripData();

    // Subscribe to payments real-time listener
    const unsubscribePayments = subscribeToPayments(id, (realTimePayments) => {
      setPayments(realTimePayments);
      // Reload trip details to sync budget meter
      loadTripData();
    });

    return () => {
      if (unsubscribePayments) unsubscribePayments();
    };
  }, [id]);

  async function updateStatus(newStatus) {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/trips/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTrip(data.trip);
    } catch (err) {
      console.error("Failed to update trip:", err);
    }
  }

  function handlePaymentSuccess(newPayment) {
    // Append to transactions list
    setPayments((prev) => [newPayment, ...prev]);
    // Reload trip budget status
    loadTripData();
  }

  if (loading) {
    return (
      <div className="page">
        <div className="loading-overlay">
          <span className="spinner" />
          <span>Loading trip...</span>
        </div>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="page">
        <div className="card" style={{ background: "var(--risk-critical-bg)", borderColor: "var(--risk-critical-border)" }}>
          <p style={{ color: "var(--risk-critical)" }}>
            ⚠ {error || "Trip not found"}
          </p>
          <Link to="/trips" style={{ fontSize: "0.9rem", marginTop: "var(--space-sm)", display: "inline-block" }}>
            ← Back to Trips
          </Link>
        </div>
      </div>
    );
  }

  const waypoints = trip.itinerary?.routeWaypoints || [];
  const budgetSpent = trip.budgetSpent || 0;
  const emergencyLimit = 2000; // default emergency limit
  const percentSpent = Math.min((budgetSpent / emergencyLimit) * 100, 100);

  async function handleDeleteTrip() {
    if (!window.confirm("Are you sure you want to remove this trip?")) return;

    try {
      const res = await fetchWithAuth(`${API_URL}/api/trips/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      navigate("/trips");
    } catch (err) {
      alert("Failed to delete trip: " + err.message);
    }
  }

  return (
    <div className="page" id="trip-detail-page">
      {/* Header */}
      <div className="page-header">
        <Link
          to="/trips"
          style={{
            fontSize: "0.85rem",
            color: "var(--text-muted)",
            display: "inline-block",
            marginBottom: "var(--space-sm)",
          }}
        >
          ← Back to Trips
        </Link>
        <div className="trip-header-flex">
          <div>
            <h1 className="page-title">
              {trip.name || `${trip.origin} → ${trip.destination}`}
            </h1>
            <div
              style={{
                display: "flex",
                gap: "var(--space-md)",
                color: "var(--text-secondary)",
                fontSize: "0.95rem",
                marginTop: "var(--space-xs)",
                flexWrap: "wrap",
              }}
            >
              <span>{trip.days} day{trip.days > 1 ? "s" : ""}</span>
              <span>Budget: {formatINR(trip.budget)}</span>
              <span style={{ textTransform: "capitalize" }}>Mode: {trip.preferences?.vehicleType || "car"}</span>
              {(trip.travelers?.length > 0 || trip.travelerName) && (
                <span>
                  Travelers: {trip.travelers?.length > 0 ? trip.travelers.join(", ") : trip.travelerName}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
            {trip.status === "planning" && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => updateStatus("active")}
                id="start-trip-btn"
              >
                Start Trip
              </button>
            )}
            {trip.status === "active" && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => updateStatus("completed")}
                id="complete-trip-btn"
              >
                Complete Trip
              </button>
            )}
            <button
              className="btn btn-danger btn-sm"
              onClick={handleDeleteTrip}
              id="delete-trip-btn"
            >
              Delete Trip
            </button>
          </div>
        </div>
      </div>

      {/* Map */}
      {waypoints.length > 0 && (
        <div style={{ marginBottom: "var(--space-xl)" }}>
          <MapView
            waypoints={waypoints}
            incidents={incidents}
            vehicleType={trip.preferences?.vehicleType || "car"}
            height={380}
          />
        </div>
      )}

      {/* Two-column layout: Itinerary + Wallet/Log/Incidents */}
      <div className="simulator-layout">
        {/* Left: Itinerary */}
        <div>
          {trip.itinerary ? (
            <ItineraryCard itinerary={trip.itinerary} />
          ) : (
            <div className="card empty-state">
              <div className="empty-state-title">No itinerary</div>
              <p>This trip was created without AI planning.</p>
            </div>
          )}
        </div>

        {/* Right Column: Wallet/Budget, Transactions & Incidents */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
          {/* Wallet & Emergency Budget Progress Card */}
          <div className="card" id="wallet-budget-card">
            <div className="card-header" style={{ marginBottom: "var(--space-sm)" }}>
              <h3 className="card-title">Wallet & Safety Budget</h3>
              {trip.status === "active" && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowPaymentModal(true)}
                  id="trigger-payment-btn"
                >
                  Trigger Payment
                </button>
              )}
            </div>

            {wallet && (
              <div style={{ marginBottom: "var(--space-md)", background: "rgba(255,255,255,0.02)", padding: "var(--space-sm)", borderRadius: "var(--radius-sm)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                  <span style={{ color: "var(--text-muted)" }}>Algorand Wallet Address:</span>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <span
                      style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}
                      title={wallet.address}
                    >
                      {wallet.address ? `${wallet.address.substring(0, 8)}...${wallet.address.substring(wallet.address.length - 8)}` : "None"}
                    </span>
                    {wallet.address && (
                      <button
                        onClick={copyAddress}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--accent-primary)",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                          padding: 0
                        }}
                        title="Copy Wallet Address"
                      >
                        {copying ? "Copied!" : "Copy"}
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginTop: "4px" }}>
                  <span style={{ color: "var(--text-muted)" }}>Wallet Balance:</span>
                  <span style={{ fontWeight: 600, color: "var(--accent-primary)" }}>
                    {wallet.balance?.toFixed(4)} ALGO
                  </span>
                </div>
                {wallet.address && (
                  <div style={{ textAlign: "right", marginTop: "8px" }}>
                    <a
                      href="https://bank.testnet.algorand.network/"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: "0.75rem", color: "var(--accent-primary)", textDecoration: "underline" }}
                    >
                      Fund Wallet via Testnet Dispenser
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Budget Meter */}
            <div style={{ margin: "var(--space-md) 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "4px" }}>
                <span style={{ color: "var(--text-secondary)" }}>Emergency Spent</span>
                <span style={{ fontWeight: 600 }}>
                  {formatINR(budgetSpent)} / {formatINR(emergencyLimit)}
                </span>
              </div>
              <div className="risk-score-bar-bg" style={{ height: "10px" }}>
                <div
                  className="risk-score-bar-fill"
                  style={{
                    width: `${percentSpent}%`,
                    background:
                      percentSpent > 80
                        ? "var(--risk-critical)"
                        : percentSpent > 50
                        ? "var(--risk-medium)"
                        : "var(--risk-low)",
                    height: "100%",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Incidents Card */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Trip Incidents</h3>
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                {incidents.length} total
              </span>
            </div>
            <IncidentList incidents={incidents} loading={false} />
          </div>

          {/* Payments Transaction Feed */}
          <div className="card" id="blockchain-payments-card">
            <div className="card-header">
              <h3 className="card-title">Algorand Transaction Proofs</h3>
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                {payments.length} log{payments.length !== 1 ? "s" : ""}
              </span>
            </div>
            <TransactionList payments={payments} />
          </div>
        </div>
      </div>

      {/* Manual Payment Trigger Modal */}
      {showPaymentModal && (
        <PaymentModal
          tripId={trip.id}
          onPaymentComplete={handlePaymentSuccess}
          onClose={() => setShowPaymentModal(false)}
        />
      )}
    </div>
  );
}
