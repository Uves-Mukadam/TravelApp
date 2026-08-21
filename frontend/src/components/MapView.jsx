import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

/* Fix Leaflet's default marker icon issue in bundled apps */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/**
 * Custom colored marker icons for different point types.
 */
function createIcon(color) {
  return L.divIcon({
    className: "custom-map-marker",
    html: `<div style="
      width: 14px; height: 14px;
      background: ${color};
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -12],
  });
}

const ICONS = {
  origin: createIcon("#38bdf8"),       // Accent blue
  destination: createIcon("#818cf8"),  // Purple
  waypoint: createIcon("#f59e0b"),     // Yellow
  checkpoint: createIcon("#22c55e"),   // Green
  incident_LOW: createIcon("#22c55e"),
  incident_MEDIUM: createIcon("#f59e0b"),
  incident_HIGH: createIcon("#f97316"),
  incident_CRITICAL: createIcon("#ef4444"),
};

/**
 * MapView Component
 *
 * Interactive Leaflet map showing:
 * - Route waypoints (origin, destination, checkpoints)
 * - Incident markers color-coded by risk level
 * - Polyline connecting waypoints
 *
 * @param {Object} props
 * @param {Array} props.waypoints - Route waypoints [{ name, lat, lng, type }]
 * @param {Array} props.incidents - Incidents with telemetry [{ riskLevel, telemetry: { latitude, longitude } }]
 * @param {number} [props.height] - Map height in pixels
 */
export default function MapView({
  waypoints = [],
  incidents = [],
  vehicleType = "car",
  height = 400,
}) {
  const [isLight, setIsLight] = useState(
    () => document.documentElement.getAttribute("data-theme") === "light"
  );
  const [roadGeometry, setRoadGeometry] = useState([]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const currentTheme = document.documentElement.getAttribute("data-theme");
      setIsLight(currentTheme === "light");
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  // Check if mode is road-based
  const isRoadVehicle = ["car", "motorcycle", "bike", "bus", "auto"].includes(
    vehicleType?.toLowerCase()
  );

  // Fetch actual road geometry from OSRM for road vehicles
  useEffect(() => {
    if (!isRoadVehicle || waypoints.length < 2) {
      setRoadGeometry([]);
      return;
    }

    let isMounted = true;

    async function fetchRoadRoute() {
      try {
        // Format coordinates as lng,lat for OSRM API
        const coordsString = waypoints
          .map((wp) => `${wp.lng},${wp.lat}`)
          .join(";");

        const osrmProfile =
          vehicleType?.toLowerCase() === "bike" ? "bike" : "car";
        const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${coordsString}?overview=full&geometries=geojson`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("OSRM request failed");
        const data = await res.json();

        if (data.routes && data.routes.length > 0 && isMounted) {
          // OSRM returns coordinates as [lng, lat], convert to Leaflet [lat, lng]
          const routeCoords = data.routes[0].geometry.coordinates.map(
            (c) => [c[1], c[0]]
          );
          setRoadGeometry(routeCoords);
        }
      } catch (err) {
        console.warn("[MapView] Road routing failed, falling back to direct polyline:", err);
        if (isMounted) setRoadGeometry([]);
      }
    }

    fetchRoadRoute();

    return () => {
      isMounted = false;
    };
  }, [waypoints, vehicleType, isRoadVehicle]);

  // Calculate map center and bounds
  const allPoints = [
    ...waypoints.map((w) => [w.lat, w.lng]),
    ...incidents
      .filter((i) => i.telemetry?.latitude && i.telemetry?.longitude)
      .map((i) => [i.telemetry.latitude, i.telemetry.longitude]),
  ];

  if (allPoints.length === 0) {
    // Default to India center
    allPoints.push([20.5937, 78.9629]);
  }

  const center =
    allPoints.length === 1
      ? allPoints[0]
      : [
          allPoints.reduce((s, p) => s + p[0], 0) / allPoints.length,
          allPoints.reduce((s, p) => s + p[1], 0) / allPoints.length,
        ];

  // Fallback straight route line
  const straightRouteLine = waypoints.map((w) => [w.lat, w.lng]);
  const activePolyline = roadGeometry.length > 0 ? roadGeometry : straightRouteLine;

  const tileUrl = isLight
    ? "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

  return (
    <div
      className="card"
      style={{ padding: 0, overflow: "hidden" }}
      id="map-container"
    >
      <MapContainer
        center={center}
        zoom={allPoints.length === 1 ? 6 : 7}
        style={{ height: `${height}px`, width: "100%", borderRadius: "var(--radius-lg)" }}
        scrollWheelZoom={true}
      >
        <TileLayer
          key={tileUrl}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url={tileUrl}
        />

        {/* Route polyline (Actual roads when available, straight line for flights/trains) */}
        {activePolyline.length > 1 && (
          <Polyline
            positions={activePolyline}
            pathOptions={{
              color: "#38bdf8",
              weight: roadGeometry.length > 0 ? 4 : 3,
              opacity: 0.85,
              dashArray: roadGeometry.length > 0 ? undefined : "8, 8",
            }}
          />
        )}

        {/* Waypoint markers */}
        {waypoints.map((wp, i) => (
          <Marker
            key={`wp-${i}`}
            position={[wp.lat, wp.lng]}
            icon={ICONS[wp.type] || ICONS.waypoint}
          >
            <Popup>
              <div style={{ color: "#222", fontSize: "13px" }}>
                <strong>{wp.name}</strong>
                <br />
                <span style={{ textTransform: "capitalize", opacity: 0.7 }}>
                  {wp.type}
                  {wp.day ? ` · Day ${wp.day}` : ""}
                </span>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Incident markers */}
        {incidents
          .filter((inc) => inc.telemetry?.latitude && inc.telemetry?.longitude)
          .map((inc, i) => (
            <Marker
              key={`inc-${i}`}
              position={[inc.telemetry.latitude, inc.telemetry.longitude]}
              icon={ICONS[`incident_${inc.riskLevel}`] || ICONS.incident_LOW}
            >
              <Popup>
                <div style={{ color: "#222", fontSize: "13px", maxWidth: 220 }}>
                  <strong>
                    {inc.riskLevel} Risk (Score: {inc.riskScore})
                  </strong>
                  <br />
                  <span style={{ opacity: 0.8 }}>
                    {inc.reason?.slice(0, 120)}
                    {inc.reason?.length > 120 ? "…" : ""}
                  </span>
                  <br />
                  <span style={{ fontSize: "11px", opacity: 0.5 }}>
                    {inc.timestamp
                      ? new Date(inc.timestamp).toLocaleString()
                      : ""}
                  </span>
                </div>
              </Popup>
            </Marker>
          ))}
      </MapContainer>
    </div>
  );
}
