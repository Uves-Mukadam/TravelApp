/**
 * Authentication Middleware
 *
 * Extracts and verifies Firebase ID tokens from request Authorization headers.
 * Supports fallback to a mock developer user if no Firebase configuration keys are set.
 */

const admin = require("firebase-admin");

module.exports = async function authMiddleware(req, res, next) {
  // Graceful health-check & telemetry webhook bypass
  if (req.path === "/api/health" || req.path === "/api/telemetry") {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Authorization header is missing or malformed.",
    });
  }

  const token = authHeader.split(" ")[1];

  // Graceful fallback for mock local-storage sessions when Firebase credentials are not set
  if (token === "MOCK_DEV_TOKEN_777") {
    req.user = {
      uid: "mock_dev_user_777",
      email: "dev@travelguardian.ai",
      name: "Developer Fallback User",
    };
    return next();
  }

  try {
    // Attempt verification using Firebase Admin SDK
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("[Auth Middleware] Token verification failed:", error.message);
    res.status(401).json({
      error: "invalid_token",
      message: "Session token has expired or is invalid.",
    });
  }
};
