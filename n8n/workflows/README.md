# n8n Workflows

This directory contains exported n8n workflow JSON configuration files representing the production travel safety and assistance orchestration layer.

---

## Workflows

### 1. Telemetry Risk Analysis & Policy Pipeline
- **File**: [`telemetry_risk_analysis.json`](file:///c:/uves/Antigravity/TravelApp/n8n/workflows/telemetry_risk_analysis.json)
- **Endpoint**: POST `/webhook/telemetry`
- **Data Flow**:
  1. **Webhook Trigger**: Receives telemetry data from the traveler simulator.
  2. **Gemini Node**: Invokes Gemini risk analysis agent.
  3. **Policy Engine (Code Node)**: Validates actions/spending rules deterministically.
  4. **Log Incident (HTTP Request)**: Sends structured incident payload to the database storage.
  5. **Auto Payout Check (IF Node)**: Bypasses approval if CRITICAL emergency roadside assistance is recommended.
  6. **x402 Micropayment (HTTP Request)**: Dispatches automated Algorand Testnet payment request.
  7. **Response Node**: Returns final transaction proofs, incident details, and risk scores.

---

## How to Import & Run

1. Open your **n8n instance** (Self-hosted or n8n Cloud).
2. Go to **Workflows** → Click **Import from File...**
3. Select the [`telemetry_risk_analysis.json`](file:///c:/uves/Antigravity/TravelApp/n8n/workflows/telemetry_risk_analysis.json) file.
4. **Configure Credentials**:
   - Double-click the **Gemini Risk Analysis** node and choose or create your **Google Gemini API** credentials (supplying your `GEMINI_API_KEY`).
5. **Configure Base Endpoints**:
   - Verify that the HTTP request node URLs point to your backend host (defaults to `http://localhost:3001`).
6. Click **Save** and click **Active** toggle in n8n.
7. Point your Simulator telemetry requests target path from `http://localhost:3001/api/telemetry` to your n8n Webhook URL (e.g. `http://localhost:5678/webhook/telemetry`).
