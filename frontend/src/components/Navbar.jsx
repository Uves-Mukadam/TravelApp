import { NavLink } from "react-router-dom";

/**
 * Navbar Component
 *
 * Sticky navigation with glassmorphism effect.
 * Shows brand name and links to main pages.
 */
export default function Navbar() {
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
        </div>
      </div>
    </nav>
  );
}
