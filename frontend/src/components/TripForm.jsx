import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

/**
 * TripForm Component
 *
 * Form for creating a new trip with the Travel Planner Agent.
 * Shows a loading state while Gemini generates the itinerary.
 */
export default function TripForm({ onTripCreated, onCancel }) {
  const [formData, setFormData] = useState({
    origin: "Mumbai",
    destination: "Goa",
    days: 3,
    budget: 15000,
    vehicleType: "car",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function handleChange(field, value) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/trips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: formData.origin,
          destination: formData.destination,
          days: formData.days,
          budget: formData.budget,
          preferences: { vehicleType: formData.vehicleType },
          planTrip: true,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      onTripCreated(data.trip);
    } catch (err) {
      setError(err.message || "Failed to create trip");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" id="trip-form-card" style={{ animation: "slideUp 0.3s ease" }}>
      <div className="card-header">
        <h3 className="card-title">🗺️ Plan a New Trip</h3>
        {onCancel && (
          <button className="btn btn-secondary btn-sm" onClick={onCancel} type="button">
            ✕ Cancel
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="trip-origin">
              Origin
            </label>
            <input
              id="trip-origin"
              className="form-input"
              type="text"
              value={formData.origin}
              onChange={(e) => handleChange("origin", e.target.value)}
              placeholder="e.g. Mumbai"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="trip-destination">
              Destination
            </label>
            <input
              id="trip-destination"
              className="form-input"
              type="text"
              value={formData.destination}
              onChange={(e) => handleChange("destination", e.target.value)}
              placeholder="e.g. Goa"
              required
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="trip-days">
              Duration (days)
            </label>
            <input
              id="trip-days"
              className="form-input"
              type="number"
              min="1"
              max="30"
              value={formData.days}
              onChange={(e) => handleChange("days", parseInt(e.target.value))}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="trip-budget">
              Budget (₹)
            </label>
            <input
              id="trip-budget"
              className="form-input"
              type="number"
              min="1000"
              step="500"
              value={formData.budget}
              onChange={(e) => handleChange("budget", parseInt(e.target.value))}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="trip-vehicle">
            Vehicle Type
          </label>
          <select
            id="trip-vehicle"
            className="form-select"
            value={formData.vehicleType}
            onChange={(e) => handleChange("vehicleType", e.target.value)}
          >
            <option value="car">Car</option>
            <option value="bike">Motorcycle</option>
            <option value="bus">Bus</option>
            <option value="train">Train</option>
            <option value="flight">Flight</option>
          </select>
        </div>

        {error && (
          <div
            style={{
              padding: "var(--space-sm) var(--space-md)",
              background: "var(--risk-critical-bg)",
              border: "1px solid var(--risk-critical-border)",
              borderRadius: "var(--radius-md)",
              color: "var(--risk-critical)",
              fontSize: "0.9rem",
              marginBottom: "var(--space-md)",
            }}
          >
            ⚠ {error}
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary btn-lg"
          disabled={loading}
          id="create-trip-btn"
          style={{ width: "100%" }}
        >
          {loading ? (
            <>
              <span className="spinner" /> AI is planning your trip...
            </>
          ) : (
            "🚀 Plan Trip with AI"
          )}
        </button>
      </form>
    </div>
  );
}
