import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser, registerUser, onAuthChange } from "../services/firebase";

/**
 * Login Page
 *
 * Provides a clean email/password interface to log in or register.
 * Uses glassmorphism inputs matching the project design language.
 */
export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Redirect if user is already logged in
  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      if (user) {
        navigate("/", { replace: true });
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isRegister) {
        await registerUser(email, password);
      } else {
        await loginUser(email, password);
      }
      navigate("/", { replace: true });
    } catch (err) {
      console.error("[Auth] Submit failed:", err);
      // Clean up Firebase Auth messages to make them friendly
      const msg = err.code
        ? err.code.replace("auth/", "").replace(/-/g, " ")
        : err.message;
      setError(msg || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="page"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-md)",
      }}
      id="login-page"
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: "400px",
          animation: "slideUp 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
          boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "var(--space-xl)" }}>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
            TripGenie
          </h2>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "4px" }}>
            {isRegister ? "Create an account to get started" : "Enter your credentials to secure your travels"}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="auth-email">
              Email Address
            </label>
            <input
              id="auth-email"
              className="form-input"
              type="email"
              placeholder="name@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: "var(--space-lg)" }}>
            <label className="form-label" htmlFor="auth-password">
              Password
            </label>
            <input
              id="auth-password"
              className="form-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
                textTransform: "capitalize",
              }}
              id="login-error"
            >
              ⚠ {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={loading}
            style={{ width: "100%" }}
            id="auth-submit-btn"
          >
            {loading ? (
              <>
                <span className="spinner" /> Authenticating...
              </>
            ) : isRegister ? (
              "Sign Up"
            ) : (
              "Log In"
            )}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "var(--space-lg)", fontSize: "0.85rem" }}>
          <span style={{ color: "var(--text-muted)" }}>
            {isRegister ? "Already have an account?" : "New to TripGenie?"}{" "}
          </span>
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setError(null);
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--accent-primary)",
              fontWeight: 600,
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
            }}
            id="auth-toggle-btn"
            type="button"
          >
            {isRegister ? "Log In" : "Sign Up"}
          </button>
        </div>
      </div>
    </div>
  );
}
