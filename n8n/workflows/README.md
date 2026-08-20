# n8n Workflows

This directory will contain exported n8n workflow JSON files.

## Current Status

For Milestone 1, the backend uses a lightweight Express.js server that simulates the n8n webhook → Gemini → Firebase pipeline. This allows the vertical slice to work without requiring n8n infrastructure.

## Planned Workflows

### 1. Telemetry Webhook Workflow
- **Trigger**: Webhook receiving traveler telemetry
- **Steps**: Validate → Gemini risk analysis → Policy check → Firebase log → Response
- **Status**: Simulated by Express backend

### 2. Emergency Response Workflow
- **Trigger**: HIGH/CRITICAL risk assessment
- **Steps**: Verify risk → Check policy → Notify contacts → Log actions
- **Status**: PLANNED

## How to Import

When n8n workflows are ready:
1. Open your n8n instance
2. Go to Workflows → Import
3. Select the JSON file from this directory
4. Configure credentials (Gemini API key, Firebase service account)
