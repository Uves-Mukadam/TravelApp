/**
 * x402 Micropayment Protocol Simulator
 *
 * Simulates machine-to-machine payment handshakes.
 * Validates payments via the Policy Engine.
 * Submits authorized transactions to the Algorand blockchain.
 * Updates trip budgets and logs payment transactions.
 */

const algorand = require("./algorand");
const policyEngine = require("./policyEngine");
const tripManager = require("./tripManager");
const { getFirestore } = require("firebase-admin/firestore");

let db = null;
const memoryStore = {
  payments: [],
};

/**
 * Initialize x402 service.
 */
function initialize() {
  try {
    db = getFirestore();
    console.log("[x402] Initialized with Firestore.");
  } catch {
    console.log("[x402] Firebase not available. Using in-memory transaction logs.");
  }
}

/**
 * Process a micropayment request via x402.
 *
 * @param {Object} params
 * @param {string} params.tripId - The current trip ID
 * @param {number} params.amountINR - Payment amount in ₹
 * @param {string} params.category - Payment category (e.g. "roadside_assistance")
 * @param {string} params.description - Payment description
 * @param {string} [params.receiverAddress] - Provider's Algorand address
 * @returns {Object} Payment result / receipt
 */
async function processPayment({ tripId, amountINR, category, description, receiverAddress }) {
  console.log(`[x402] Incoming payment request: ₹${amountINR} for '${category}' (${description})`);

  // Step 1: Fetch trip details to verify existence and get current budget status
  const trip = await tripManager.getTrip(tripId);
  if (!trip) {
    return {
      success: false,
      error: "trip_not_found",
      message: `Trip with ID ${tripId} does not exist.`,
    };
  }

  // Step 2: Validate against Policy Engine
  // Convert current trip spending and limit check
  const currentSpent = trip.budgetSpent || 0;
  const policy = policyEngine.DEFAULT_POLICY;
  
  const validation = policyEngine.validatePayment({
    tripId,
    amount: amountINR,
    category,
    policy,
  });

  if (!validation.authorized) {
    console.warn(`[x402] Payment rejected by Policy Engine: ${validation.reason}`);
    return {
      success: false,
      error: "policy_denied",
      message: validation.reason,
      checks: validation.checks,
    };
  }

  console.log("[x402] Payment authorized by policy. Constructing Algorand transaction...");

  // Step 3: Map ₹ INR to ALGO (1 ALGO = ₹100 simulated exchange rate for the hackathon)
  const algoAmount = amountINR / 100;
  
  // Step 4: Execute payment on Algorand
  const txReceipt = await algorand.sendPayment(
    receiverAddress,
    algoAmount,
    `x402 payment: ${category} - ${description}`
  );

  if (!txReceipt.success) {
    return {
      success: false,
      error: "blockchain_failure",
      message: "Algorand payment transaction failed.",
    };
  }

  // Step 5: Update trip budget spent persistently
  const newBudgetSpent = currentSpent + amountINR;
  await tripManager.updateTrip(tripId, { budgetSpent: newBudgetSpent });
  
  // also update policyEngine's in-memory tracker if it's being used
  policyEngine.recordPayment(tripId, amountINR);

  // Step 6: Log payment transaction
  const paymentRecord = {
    tripId,
    timestamp: new Date().toISOString(),
    amount: amountINR,
    algoAmount,
    category,
    description,
    txId: txReceipt.txId,
    senderAddress: txReceipt.sender,
    receiverAddress: txReceipt.receiver,
    status: "completed",
    explorerUrl: txReceipt.explorerUrl,
  };

  if (db) {
    try {
      const docRef = await db.collection("payments").add(paymentRecord);
      paymentRecord.id = docRef.id;
      console.log(`[x402] Payment logged in Firestore: ${docRef.id}`);
    } catch (error) {
      console.error("[x402] Firestore write failed:", error.message);
      paymentRecord.id = `mem_pay_${Date.now()}`;
      memoryStore.payments.push(paymentRecord);
    }
  } else {
    paymentRecord.id = `mem_pay_${Date.now()}`;
    memoryStore.payments.push(paymentRecord);
    console.log(`[x402] Payment logged in memory: ${paymentRecord.id}`);
  }

  return {
    success: true,
    payment: paymentRecord,
  };
}

/**
 * Get payment logs for a trip.
 */
async function getPayments(tripId) {
  if (db) {
    try {
      const snapshot = await db
        .collection("payments")
        .where("tripId", "==", tripId)
        .orderBy("timestamp", "desc")
        .get();

      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error("[x402] Firestore query failed:", error.message);
    }
  }

  return memoryStore.payments
    .filter((p) => p.tripId === tripId)
    .reverse();
}

module.exports = {
  initialize,
  processPayment,
  getPayments,
};
