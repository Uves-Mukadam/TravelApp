import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { onAuthChange } from "../services/firebase";

/**
 * AuthRoute Guard Component
 *
 * Checks if the user is authenticated.
 * Renders loading spinner while verifying auth state.
 * Redirects to /login if unauthenticated.
 */
export default function AuthRoute({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthChange((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="page" style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="loading-overlay" style={{ position: "static", background: "none" }}>
          <span className="spinner" />
          <span>Verifying identity...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
