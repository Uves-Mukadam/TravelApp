/**
 * x402 Micropayment Protocol — USDC Edition
 *
 * Machine-to-machine payment handshakes using USDC on Algorand.
 * Validates payments via the Policy Engine, then dispatches
 * USDC via LogicSig (delegated) or server wallet (fallback).
 * Logs all transactions to Firebase with Algorand Explorer links.
 */

const algorand = require("./algorand");
const policyEngine = require("./policyEngine");
const tripManager = require("./tripManager");
const { getFirestore } = require("firebase-admin/firestore");

let db = null;
const memoryStore = { payments: [] };

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
 * Process a micropayment request via x402 protocol.
 *
 * Converts INR to USDC, validates against policy, dispatches
 * payment via LogicSig or server wallet, and logs the result.
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

  // Step 1: Fetch trip details
  const trip = await tripManager.getTrip(tripId);
  if (!trip) {
    return {
      success: false,
      error: "trip_not_found",
      message: `Trip with ID ${tripId} does not exist.`,
    };
  }

  // Step 2: Validate against Policy Engine
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

  // Step 3: Convert INR → USDC (simulated exchange rate)
  const usdcAmount = parseFloat((amountINR / algorand.INR_PER_USDC).toFixed(2));
  // Also compute legacy ALGO equivalent for backward compatibility
  const algoAmount = amountINR / 100;

  // Validate against LogicSig max
  if (usdcAmount > algorand.MAX_USDC_PER_TXN) {
    console.warn(`[x402] USDC amount ${usdcAmount} exceeds LogicSig limit of ${algorand.MAX_USDC_PER_TXN}.`);
    return {
      success: false,
      error: "exceeds_logicsig_limit",
      message: `Payment of ${usdcAmount} USDC exceeds the on-chain smart signature limit of ${algorand.MAX_USDC_PER_TXN} USDC.`,
    };
  }

  // Step 4: Execute payment
  let txReceipt;
  const txNote = `x402: ${category} - ${description}`;

  if (trip.logicSigBase64 && trip.travelerWalletAddress) {
    // Preferred: Use delegated LogicSig (traveler's wallet)
    console.log("[x402] Using delegated LogicSig for USDC transfer...");
    txReceipt = await algorand.sendUSDCWithLogicSig(
      trip.logicSigBase64,
      trip.travelerWalletAddress,
      receiverAddress || algorand.getWalletAddress(),
      usdcAmount,
      txNote
    );
  } else {
    // Fallback: Use server wallet
    console.log("[x402] No LogicSig on trip. Using server wallet...");
    txReceipt = await algorand.sendPayment(receiverAddress, usdcAmount, txNote);
  }

  if (!txReceipt.success) {
    return {
      success: false,
      error: "blockchain_failure",
      message: txReceipt.error || "Algorand payment transaction failed.",
    };
  }

  // Step 5: Update trip budget spent
  const newBudgetSpent = currentSpent + amountINR;
  await tripManager.updateTrip(tripId, { budgetSpent: newBudgetSpent });
  policyEngine.recordPayment(tripId, amountINR);

  // Step 6: Log payment transaction
  const paymentRecord = {
    tripId,
    timestamp: new Date().toISOString(),
    amount: amountINR,
    usdcAmount,
    algoAmount,
    category,
    description,
    txId: txReceipt.txId,
    senderAddress: txReceipt.sender,
    receiverAddress: txReceipt.receiver,
    status: "completed",
    explorerUrl: txReceipt.explorerUrl,
    method: txReceipt.method || "unknown",
    confirmedRound: txReceipt.confirmedRound || null,
    fee: txReceipt.fee || null,
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
      // Query by tripId only to avoid needing a Firestore composite index
      const snapshot = await db
        .collection("payments")
        .where("tripId", "==", tripId)
        .get();

      const payments = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      payments.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return payments;
    } catch (error) {
      console.error("[x402] Firestore query failed:", error.message);
    }
  }

  return memoryStore.payments
    .filter((p) => p.tripId === tripId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

module.exports = {
  initialize,
  processPayment,
  getPayments,
};
