/**
 * Algorand Service
 *
 * Connects to the Algorand Testnet.
 * Recovers wallet from mnemonic or generates a transient wallet for testing.
 * Submits payments and waits for confirmation.
 */

const algosdk = require("algosdk");

let algodClient = null;
let walletAccount = null;
let initialized = false;

// Default node settings (using Algonode free public testnet)
const DEFAULT_ALGOD_SERVER = "https://testnet-api.algonode.cloud";
const DEFAULT_ALGOD_PORT = "";
const DEFAULT_ALGOD_TOKEN = "";

/**
 * Initialize Algorand client and wallet account.
 */
function initialize() {
  try {
    const server = process.env.ALGOD_SERVER || DEFAULT_ALGOD_SERVER;
    const port = process.env.ALGOD_PORT || DEFAULT_ALGOD_PORT;
    const token = process.env.ALGOD_TOKEN || DEFAULT_ALGOD_TOKEN;

    algodClient = new algosdk.Algodv2(token, server, port);

    // Retrieve or generate traveler wallet
    const mnemonic = process.env.ALGORAND_MNEMONIC;
    if (mnemonic) {
      walletAccount = algosdk.mnemonicToSecretKey(mnemonic);
      console.log(`[Algorand] Wallet recovered from mnemonic: ${walletAccount.addr}`);
    } else {
      // Generate transient testing wallet
      walletAccount = algosdk.generateAccount();
      console.log("\n⚠️  [Algorand] No ALGORAND_MNEMONIC set. Generated a transient test wallet:");
      console.log(`   Address:   ${walletAccount.addr}`);
      console.log(`   Mnemonic:  ${algosdk.secretKeyToMnemonic(walletAccount.sk)}`);
      console.log("   (Fund this wallet via the Algorand Testnet Dispenser if you want real transactions)\n");
    }

    initialized = true;
    console.log("[Algorand] Service initialized successfully.");
    return true;
  } catch (error) {
    console.error("[Algorand] Initialization failed:", error.message);
    return false;
  }
}

/**
 * Get account info/balance.
 */
async function getBalance(address) {
  if (!initialized || !algodClient) return 0;
  try {
    const addr = address || walletAccount.addr.toString();
    const info = await algodClient.accountInformation(addr).do();
    // Balance is in microAlgos
    return Number(info.amount) / 1_000_000;
  } catch (error) {
    console.warn(`[Algorand] Failed to fetch balance for ${address}:`, error.message);
    return 0;
  }
}

/**
 * Submit an ALGO payment transaction on Testnet.
 *
 * @param {string} toAddress - Receiver address
 * @param {number} algoAmount - Amount in ALGO (will be converted to microAlgos)
 * @param {string} note - Optional transaction note
 * @returns {Object} Transaction receipt / info
 */
async function sendPayment(toAddress, algoAmount, note = "") {
  // If not fully initialized or connection fails, fallback to a simulated txn
  if (!initialized || !algodClient) {
    console.log("[Algorand] Client not initialized. Simulating transaction...");
    return getMockTxReceipt(toAddress, algoAmount, note);
  }

  try {
    const params = await algodClient.getTransactionParams().do();
    const receiver = toAddress || "7J53NMQJ2CGE4LQXDXR7LFLC5QZ3O66W5Q742SZDX24S4KHY2CSYV4N74Q"; // Placeholder service provider
    const amountMicroAlgos = Math.round(algoAmount * 1_000_000);

    const enc = new TextEncoder();
    const txnNote = enc.encode(note || `AI Travel Guardian payment of ₹${algoAmount * 100}`); // ₹ scale simulation

    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: walletAccount.addr,
      to: receiver,
      amount: amountMicroAlgos,
      note: txnNote,
      suggestedParams: params,
    });

    // Sign transaction
    const signedTxn = txn.signTxn(walletAccount.sk);

    // Submit transaction
    console.log(`[Algorand] Submitting payment of ${algoAmount} ALGO to ${receiver}...`);
    const { txId } = await algodClient.sendRawTransaction(signedTxn).do();
    console.log(`[Algorand] Transaction submitted. ID: ${txId}`);

    // Wait for confirmation
    const confirmation = await algosdk.waitForConfirmation(algodClient, txId, 4);
    console.log(`[Algorand] Transaction confirmed in round ${confirmation["confirmed-round"]}`);

    return {
      success: true,
      txId,
      sender: walletAccount.addr.toString(),
      receiver,
      amount: algoAmount,
      fee: confirmation["fee"] / 1_000_000,
      confirmedRound: confirmation["confirmed-round"],
      explorerUrl: `https://testnet.algoexplorer.io/tx/${txId}`,
      note,
    };
  } catch (error) {
    console.error("[Algorand] Transaction failed:", error.message);
    console.log("[Algorand] Falling back to simulated transaction receipt.");
    return getMockTxReceipt(toAddress, algoAmount, note);
  }
}

/**
 * Generate a simulated receipt for testing when testnet connection fails or dispenser balance is 0.
 */
function getMockTxReceipt(toAddress, algoAmount, note) {
  const mockTxId = "MOCK_TX_" + Math.random().toString(36).substring(2, 15).toUpperCase();
  const sender = walletAccount ? walletAccount.addr.toString() : "MOCK_SENDER_ADDR_77777777777777777777777777777";
  const receiver = toAddress || "MOCK_PROVIDER_ADDR_88888888888888888888888888888";
  return {
    success: true,
    txId: mockTxId,
    sender,
    receiver,
    amount: algoAmount,
    fee: 0.001,
    confirmedRound: 999999,
    explorerUrl: `https://lora.algodev.network/tx/${mockTxId}`, // standard fallback explorer link
    note: `[SIMULATED] ${note}`,
  };
}

module.exports = {
  initialize,
  getBalance,
  sendPayment,
  getWalletAddress: () => (walletAccount ? walletAccount.addr.toString() : null),
};
