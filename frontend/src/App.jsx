import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Dashboard from "./pages/Dashboard";
import Simulator from "./pages/Simulator";
import Trips from "./pages/Trips";
import TripDetail from "./pages/TripDetail";
import Login from "./pages/Login";
import AuthRoute from "./components/AuthRoute";

/**
 * App Root
 *
 * Sets up routing between Dashboard, Trips, and Simulator pages,
 * guarded by Firebase Authentication guards.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <AuthRoute>
              <Dashboard />
            </AuthRoute>
          }
        />
        <Route
          path="/trips"
          element={
            <AuthRoute>
              <Trips />
            </AuthRoute>
          }
        />
        <Route
          path="/trips/:id"
          element={
            <AuthRoute>
              <TripDetail />
            </AuthRoute>
          }
        />
        <Route
          path="/simulator"
          element={
            <AuthRoute>
              <Simulator />
            </AuthRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
