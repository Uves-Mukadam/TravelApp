/**
 * Policy Engine — Spending & Action Authorization
 *
 * Deterministic policy validation for AI-recommended actions.
 * The AI (Gemini) can RECOMMEND actions, but this engine DECIDES
 * whether they are authorized based on defined policies.
 *
 * For Milestone 1: This is a stub that logs policy decisions
 * but does not block actions (no real payments yet).
 */

/**
 * Default spending policy.
 * In production, this would be loaded from Firebase per-user or per-trip.
 */
const DEFAULT_POLICY = {
  emergencyBudget: 2000, // ₹2,000 per trip
  maxSinglePayment: 500, // ₹500 maximum per transaction
  allowedCategories: [
    "roadside_assistance",
    "emergency_api",
    "maps",
    "weather",
  ],
  restrictedCategories: [
    "shopping",
    "entertainment",
    "hotels", // unless explicitly approved
  ],
  autoApproveActions: [
    "request_checkin",
    "retrieve_last_location",
    "check_route",
    "check_weather",
    "log_incident",
  ],
  requireApprovalActions: [
    "contact_roadside_assistance",
    "notify_emergency_contacts",
    "find_assistance",
  ],
};

/**
 * Track spending per trip (in-memory for now).
 */
const tripSpending = {};

/**
 * Validate whether an action is authorized.
 *
 * @param {Object} params
 * @param {string} params.tripId
 * @param {string} params.action - The recommended action ID
 * @param {number} [params.amount] - Payment amount (if applicable)
 * @param {string} [params.category] - Payment category (if applicable)
 * @param {string} params.riskLevel - Current risk level
 * @returns {Object} { authorized, reason, requiresApproval }
 */
function validateAction({ tripId, action, amount, category, riskLevel }) {
  const policy = DEFAULT_POLICY;

  // Auto-approved actions
  if (policy.autoApproveActions.includes(action)) {
    return {
      authorized: true,
      reason: `Action '${action}' is auto-approved by policy.`,
      requiresApproval: false,
    };
  }

  // Actions that require user approval
  if (policy.requireApprovalActions.includes(action)) {
    // In CRITICAL situations, allow without approval
    if (riskLevel === "CRITICAL") {
      return {
        authorized: true,
        reason: `Action '${action}' auto-authorized due to CRITICAL risk level.`,
        requiresApproval: false,
      };
    }

    return {
      authorized: false,
      reason: `Action '${action}' requires user approval.`,
      requiresApproval: true,
    };
  }

  // Payment validation
  if (amount !== undefined) {
    return validatePayment({ tripId, amount, category, policy });
  }

  // Unknown action — deny by default
  return {
    authorized: false,
    reason: `Unknown action '${action}'. Denied by default.`,
    requiresApproval: true,
  };
}

/**
 * Validate a payment against spending policy.
 */
function validatePayment({ tripId, amount, category, policy }) {
  const checks = [];

  // Check 1: Category allowed?
  if (category && policy.restrictedCategories.includes(category)) {
    checks.push({
      check: "category_allowed",
      passed: false,
      detail: `Category '${category}' is restricted.`,
    });
  } else {
    checks.push({ check: "category_allowed", passed: true });
  }

  // Check 2: Under max single payment?
  const underMax = amount <= policy.maxSinglePayment;
  checks.push({
    check: "under_max_single",
    passed: underMax,
    detail: underMax
      ? undefined
      : `Amount ₹${amount} exceeds max single payment ₹${policy.maxSinglePayment}.`,
  });

  // Check 3: Within budget?
  const spent = tripSpending[tripId] || 0;
  const withinBudget = spent + amount <= policy.emergencyBudget;
  checks.push({
    check: "within_budget",
    passed: withinBudget,
    detail: withinBudget
      ? undefined
      : `Spending ₹${spent + amount} would exceed budget ₹${policy.emergencyBudget}.`,
  });

  const allPassed = checks.every((c) => c.passed);

  return {
    authorized: allPassed,
    reason: allPassed
      ? "Payment authorized by policy."
      : checks
          .filter((c) => !c.passed)
          .map((c) => c.detail)
          .join(" "),
    requiresApproval: !allPassed,
    checks,
  };
}

/**
 * Record a payment for budget tracking.
 */
function recordPayment(tripId, amount) {
  tripSpending[tripId] = (tripSpending[tripId] || 0) + amount;
}

/**
 * Get current spending for a trip.
 */
function getTripSpending(tripId) {
  return tripSpending[tripId] || 0;
}

module.exports = {
  validateAction,
  validatePayment,
  recordPayment,
  getTripSpending,
  DEFAULT_POLICY,
};
