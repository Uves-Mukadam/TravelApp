import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { onAuthChange, logoutUser } from "../services/firebase";

/**
 * Navbar Component
 *
 * Sticky navigation with glassmorphism effect.
 * Shows links to pages and Logout controls for authenticated sessions.
 */
export default function Navbar() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthChange((currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  async function handleLogout() {
    try {
      await logoutUser();
      navigate("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  }

  // Hide completely if not logged in
  if (!user) return null;

  return (
    <nav className="navbar" id="main-navbar">
      <div className="navbar-inner">
        <div className="navbar-brand">
          <span className="shield-icon">🛡️</span>
          <span>AI Travel Guardian</span>
        </div>
        <div className="navbar-links">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `nav-link ${isActive ? "active" : ""}`
            }
            id="nav-dashboard"
            end
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/trips"
            className={({ isActive }) =>
              `nav-link ${isActive ? "active" : ""}`
            }
            id="nav-trips"
          >
            Trips
          </NavLink>
          <NavLink
            to="/simulator"
            className={({ isActive }) =>
              `nav-link ${isActive ? "active" : ""}`
            }
            id="nav-simulator"
          >
            Simulator
          </NavLink>
          
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", marginLeft: "var(--space-lg)", borderLeft: "1px solid var(--border-subtle)", paddingLeft: "var(--space-lg)" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }} title={user.email}>
              👤 {user.email?.split("@")[0]}
            </span>
            <button
              onClick={handleLogout}
              className="btn btn-secondary btn-sm"
              style={{ padding: "4px 10px", fontSize: "0.75rem" }}
              id="nav-logout-btn"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
