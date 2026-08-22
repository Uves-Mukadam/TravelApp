/**
 * Algorand Service — USDC + LogicSig Smart Signature
 *
 * Manages traveler safety-reserve wallets on Algorand Testnet.
 * Uses USDC (ASA) for emergency micropayments and LogicSig
 * smart signatures for delegated, rule-bound spending.
 *
 * Key features:
 *  - TEAL smart signature compiled at startup (enforces USDC-only,
 *    max 15 USDC per txn, reasonable fees)
 *  - Delegated LogicSig: traveler signs once at trip creation,
 *    backend can dispatch payments without the private key
 *  - Asset transfer (axfer) transactions for USDC
 *  - Clickable Algorand Explorer links for every transaction
 */

const algosdk = require("algosdk");

// ─── Configuration ──────────────────────────────────────────────
const ALGOD_SERVER = process.env.ALGOD_SERVER || "https://testnet-api.algonode.cloud";
const ALGOD_PORT = process.env.ALGOD_PORT || "";
const ALGOD_TOKEN = process.env.ALGOD_TOKEN || "";

// USDC on Algorand Testnet (Circle-issued ASA)
const USDC_ASA_ID = parseInt(process.env.USDC_ASA_ID || "10458941");

// Max USDC per LogicSig transaction (matches on-chain TEAL constraint)
const MAX_USDC_PER_TXN = 15; // 15 USDC
const MAX_USDC_MICRO = MAX_USDC_PER_TXN * 1_000_000; // 15,000,000 microUSDC

// Simulated exchange rate for hackathon demo
const INR_PER_USDC = 83;

// Explorer URL template
const EXPLORER_BASE = "https://testnet.algoexplorer.io/tx";

// ─── State ──────────────────────────────────────────────────────
let algodClient = null;
let serverAccount = null; // Server's operational wallet (for fees, etc.)
let compiledLogicSig = null; // Pre-compiled TEAL bytecode
let initialized = false;

// ─── TEAL Smart Signature Source ────────────────────────────────
// This program enforces:
//  1. Transaction type must be Asset Transfer (axfer)
//  2. Asset must be USDC (ASA ID matches)
//  3. Amount must be <= 15 USDC (15,000,000 micro-units)
//  4. Fee must be reasonable (<= 10,000 microAlgo = 0.01 ALGO)
const TEAL_SOURCE = `#pragma version 8
// --- TravelGenie: Safety Reserve LogicSig ---
// Only allow USDC asset transfers with strict limits.

// Rule 1: Must be an Asset Transfer (type enum 4)
txn TypeEnum
int axfer
==

// Rule 2: Must transfer USDC ASA only
txn XferAsset
int ${USDC_ASA_ID}
==
&&

// Rule 3: Max ${MAX_USDC_PER_TXN} USDC per transaction
txn AssetAmount
int ${MAX_USDC_MICRO}
<=
&&

// Rule 4: Fee cap (prevent fee draining attacks)
txn Fee
int 10000
<=
&&
`;

// ─── Initialization ─────────────────────────────────────────────

/**
 * Initialize Algorand client, server wallet, and compile TEAL.
 */
async function initialize() {
  try {
    algodClient = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT);

    // Recover or generate server operational wallet
    const mnemonic = process.env.ALGORAND_MNEMONIC;
    if (mnemonic) {
      serverAccount = algosdk.mnemonicToSecretKey(mnemonic);
      console.log(`[Algorand] Server wallet: ${serverAccount.addr}`);
    } else {
      serverAccount = algosdk.generateAccount();
      console.log(`[Algorand] No ALGORAND_MNEMONIC set. Generated transient wallet: ${serverAccount.addr}`);
    }

    // Compile TEAL smart signature
    try {
      const compiled = await algodClient.compile(Buffer.from(TEAL_SOURCE)).do();
      compiledLogicSig = new Uint8Array(Buffer.from(compiled.result, "base64"));
      console.log(`[Algorand] TEAL LogicSig compiled. Program hash: ${compiled.hash}`);
    } catch (compileErr) {
      console.warn("[Algorand] TEAL compilation failed (will use simulated mode):", compileErr.message);
      compiledLogicSig = null;
    }

    initialized = true;
    console.log(`[Algorand] Service initialized. USDC ASA ID: ${USDC_ASA_ID}`);
    return true;
  } catch (error) {
    console.error("[Algorand] Initialization failed:", error.message);
    return false;
  }
}

// ─── Wallet Helpers ─────────────────────────────────────────────

/**
 * Get USDC balance for an address.
 * @param {string} address - Algorand address
 * @returns {number} USDC balance (human-readable, e.g. 15.50)
 */
async function getUSDCBalance(address) {
  if (!initialized || !algodClient) return 0;
  try {
    const addr = address || serverAccount.addr.toString();
    const info = await algodClient.accountInformation(addr).do();
    const assets = info.assets || [];
    const usdcHolding = assets.find((a) => a["asset-id"] === USDC_ASA_ID);
    if (!usdcHolding) return 0;
    return usdcHolding.amount / 1_000_000;
  } catch (error) {
    console.warn(`[Algorand] Failed to fetch USDC balance for ${address}:`, error.message);
    return 0;
  }
}

/**
 * Get ALGO balance for an address.
 */
async function getAlgoBalance(address) {
  if (!initialized || !algodClient) return 0;
  try {
    const addr = address || serverAccount.addr.toString();
    const info = await algodClient.accountInformation(addr).do();
    return Number(info.amount) / 1_000_000;
  } catch (error) {
    console.warn(`[Algorand] Failed to fetch ALGO balance:`, error.message);
    return 0;
  }
}

/**
 * Opt-in a wallet to the USDC ASA.
 * Required before a wallet can receive USDC.
 *
 * @param {string} mnemonic - 25-word mnemonic of the wallet to opt in
 * @returns {Object} { success, txId }
 */
async function optInToUSDC(mnemonic) {
  if (!initialized || !algodClient) {
    return { success: false, error: "Algorand not initialized" };
  }

  try {
    const account = algosdk.mnemonicToSecretKey(mnemonic);
    const params = await algodClient.getTransactionParams().do();

    // Opt-in is a 0-amount asset transfer to yourself
    const optInTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: account.addr,
      receiver: account.addr,
      amount: 0,
      assetIndex: USDC_ASA_ID,
      suggestedParams: params,
    });

    const signedTxn = optInTxn.signTxn(account.sk);
    const { txId } = await algodClient.sendRawTransaction(signedTxn).do();
    await algosdk.waitForConfirmation(algodClient, txId, 4);

    console.log(`[Algorand] Wallet ${account.addr} opted in to USDC. TxID: ${txId}`);
    return { success: true, txId, address: account.addr.toString() };
  } catch (error) {
    console.error("[Algorand] USDC opt-in failed:", error.message);
    return { success: false, error: error.message };
  }
}

// ─── LogicSig Management ────────────────────────────────────────

/**
 * Create a delegated LogicSig for a traveler.
 * The traveler signs the TEAL program with their private key,
 * authorizing future USDC transfers under the TEAL constraints.
 *
 * @param {string} travelerMnemonic - 25-word mnemonic (used once, then discarded)
 * @returns {Object} { success, logicSigBase64, walletAddress }
 */
function createDelegatedLogicSig(travelerMnemonic) {
  if (!compiledLogicSig) {
    console.warn("[Algorand] No compiled LogicSig available. Using simulated mode.");
    return { success: false, error: "LogicSig not compiled" };
  }

  try {
    const travelerAccount = algosdk.mnemonicToSecretKey(travelerMnemonic);

    // Create LogicSig from compiled TEAL bytecode
    const lsig = new algosdk.LogicSigAccount(compiledLogicSig);

    // Delegate: sign with the traveler's private key
    lsig.sign(travelerAccount.sk);

    // Serialize for storage (base64-encoded)
    const serialized = Buffer.from(lsig.toByte()).toString("base64");

    console.log(`[Algorand] Delegated LogicSig created for wallet: ${travelerAccount.addr}`);

    return {
      success: true,
      logicSigBase64: serialized,
      walletAddress: travelerAccount.addr.toString(),
    };
  } catch (error) {
    console.error("[Algorand] Failed to create delegated LogicSig:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send USDC using a pre-signed delegated LogicSig.
 * The server constructs the transaction; the LogicSig authorizes it.
 *
 * @param {string} logicSigBase64 - Base64-encoded serialized LogicSig
 * @param {string} fromAddress - Traveler's wallet address
 * @param {string} toAddress - Emergency service provider address
 * @param {number} usdcAmount - Amount in USDC (human-readable, e.g. 5.00)
 * @param {string} note - Transaction note
 * @returns {Object} Transaction receipt
 */
async function sendUSDCWithLogicSig(logicSigBase64, fromAddress, toAddress, usdcAmount, note = "") {
  if (!initialized || !algodClient) {
    console.log("[Algorand] Not initialized. Returning simulated receipt.");
    return getSimulatedReceipt(toAddress, usdcAmount, note);
  }

  // Validate amount against LogicSig constraint
  if (usdcAmount > MAX_USDC_PER_TXN) {
    return {
      success: false,
      error: `Amount ${usdcAmount} USDC exceeds LogicSig limit of ${MAX_USDC_PER_TXN} USDC`,
    };
  }

  try {
    // Deserialize the LogicSig
    const lsigBytes = new Uint8Array(Buffer.from(logicSigBase64, "base64"));
    const lsig = algosdk.LogicSigAccount.fromByte(lsigBytes);

    const params = await algodClient.getTransactionParams().do();
    const microUSDC = Math.round(usdcAmount * 1_000_000);

    const enc = new TextEncoder();
    const txnNote = enc.encode(note || `TravelGenie: Emergency USDC payment`);

    // Construct USDC asset transfer transaction
    const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: fromAddress,
      receiver: toAddress,
      amount: microUSDC,
      assetIndex: USDC_ASA_ID,
      note: txnNote,
      suggestedParams: params,
    });

    // Sign with the delegated LogicSig (no private key needed!)
    const signedTxn = algosdk.signLogicSigTransactionObject(txn, lsig);

    console.log(`[Algorand] Submitting USDC transfer: ${usdcAmount} USDC to ${toAddress}...`);
    const { txId } = await algodClient.sendRawTransaction(signedTxn.blob).do();
    console.log(`[Algorand] Transaction submitted. TxID: ${txId}`);

    // Wait for confirmation
    const confirmation = await algosdk.waitForConfirmation(algodClient, txId, 4);
    console.log(`[Algorand] Confirmed in round ${confirmation["confirmed-round"]}`);

    return {
      success: true,
      txId,
      sender: fromAddress,
      receiver: toAddress,
      usdcAmount,
      algoAmount: null, // No ALGO transferred
      fee: (confirmation["fee"] || 1000) / 1_000_000,
      confirmedRound: confirmation["confirmed-round"],
      explorerUrl: `${EXPLORER_BASE}/${txId}`,
      note,
      method: "logicsig",
    };
  } catch (error) {
    console.error("[Algorand] LogicSig USDC transfer failed:", error.message);
    console.log("[Algorand] Falling back to simulated receipt.");
    return getSimulatedReceipt(toAddress, usdcAmount, note);
  }
}

/**
 * Send a direct USDC payment from the server wallet.
 * Used as fallback when no LogicSig is available for a trip.
 *
 * @param {string} toAddress - Receiver address
 * @param {number} usdcAmount - Amount in USDC
 * @param {string} note - Transaction note
 * @returns {Object} Transaction receipt
 */
async function sendPayment(toAddress, usdcAmount, note = "") {
  if (!initialized || !algodClient || !serverAccount) {
    return getSimulatedReceipt(toAddress, usdcAmount, note);
  }

  try {
    const params = await algodClient.getTransactionParams().do();
    const microUSDC = Math.round(usdcAmount * 1_000_000);
    const receiver = toAddress || serverAccount.addr.toString();

    const enc = new TextEncoder();
    const txnNote = enc.encode(note || `TravelGenie emergency payment`);

    // Try USDC asset transfer first
    const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: serverAccount.addr,
      receiver: receiver,
      amount: microUSDC,
      assetIndex: USDC_ASA_ID,
      note: txnNote,
      suggestedParams: params,
    });

    const signedTxn = txn.signTxn(serverAccount.sk);
    console.log(`[Algorand] Submitting server USDC payment: ${usdcAmount} USDC to ${receiver}...`);
    const { txId } = await algodClient.sendRawTransaction(signedTxn).do();
    const confirmation = await algosdk.waitForConfirmation(algodClient, txId, 4);

    console.log(`[Algorand] Payment confirmed. TxID: ${txId}`);

    return {
      success: true,
      txId,
      sender: serverAccount.addr.toString(),
      receiver,
      usdcAmount,
      algoAmount: null,
      fee: (confirmation["fee"] || 1000) / 1_000_000,
      confirmedRound: confirmation["confirmed-round"],
      explorerUrl: `${EXPLORER_BASE}/${txId}`,
      note,
      method: "server-wallet",
    };
  } catch (error) {
    console.error("[Algorand] Server USDC payment failed:", error.message);

    // Fallback: try raw ALGO payment
    try {
      return await sendAlgoPayment(toAddress, usdcAmount / 100, note);
    } catch (algoErr) {
      console.error("[Algorand] ALGO fallback also failed:", algoErr.message);
      return getSimulatedReceipt(toAddress, usdcAmount, note);
    }
  }
}

/**
 * Fallback: Send raw ALGO payment (legacy compatibility).
 */
async function sendAlgoPayment(toAddress, algoAmount, note = "") {
  const params = await algodClient.getTransactionParams().do();
  const receiver = toAddress || "7J53NMQJ2CGE4LQXDXR7LFLC5QZ3O66W5Q742SZDX24S4KHY2CSYV4N74Q";
  const amountMicroAlgos = Math.round(algoAmount * 1_000_000);

  const enc = new TextEncoder();
  const txnNote = enc.encode(note || `TravelGenie ALGO payment`);

  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: serverAccount.addr,
    receiver: receiver,
    amount: amountMicroAlgos,
    note: txnNote,
    suggestedParams: params,
  });

  const signedTxn = txn.signTxn(serverAccount.sk);
  const { txId } = await algodClient.sendRawTransaction(signedTxn).do();
  const confirmation = await algosdk.waitForConfirmation(algodClient, txId, 4);

  return {
    success: true,
    txId,
    sender: serverAccount.addr.toString(),
    receiver,
    usdcAmount: null,
    algoAmount,
    fee: (confirmation["fee"] || 1000) / 1_000_000,
    confirmedRound: confirmation["confirmed-round"],
    explorerUrl: `${EXPLORER_BASE}/${txId}`,
    note,
    method: "algo-direct",
  };
}

// ─── Simulated Receipt ──────────────────────────────────────────

/**
 * Generate a simulated receipt for demo/testing when blockchain is unavailable.
 */
function getSimulatedReceipt(toAddress, usdcAmount, note) {
  const mockTxId = "SIM_" + Date.now().toString(36).toUpperCase() + "_" + Math.random().toString(36).substring(2, 8).toUpperCase();
  const sender = serverAccount ? serverAccount.addr.toString() : "SIMULATED_SENDER_ADDRESS";
  const receiver = toAddress || "SIMULATED_PROVIDER_ADDRESS";

  return {
    success: true,
    txId: mockTxId,
    sender,
    receiver,
    usdcAmount,
    algoAmount: null,
    fee: 0.001,
    confirmedRound: 999999,
    explorerUrl: `${EXPLORER_BASE}/${mockTxId}`,
    note: `[SIMULATED] ${note}`,
    method: "simulated",
  };
}

// ─── Exports ────────────────────────────────────────────────────

module.exports = {
  initialize,
  getUSDCBalance,
  getAlgoBalance,
  getBalance: getUSDCBalance, // Alias for backward compatibility
  optInToUSDC,
  createDelegatedLogicSig,
  sendUSDCWithLogicSig,
  sendPayment,
  getWalletAddress: () => (serverAccount ? serverAccount.addr.toString() : null),
  getExplorerUrl: (txId) => `${EXPLORER_BASE}/${txId}`,
  USDC_ASA_ID,
  MAX_USDC_PER_TXN,
  INR_PER_USDC,
};
