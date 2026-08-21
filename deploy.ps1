# AI Travel Guardian — Vercel Deployment Script (Local Terminal)
# Run this script using: .\deploy.ps1

Write-Host "🛡️ Starting Vercel Deployment for AI Travel Guardian..." -ForegroundColor Cyan

# Step 1: Verify Vercel Login
Write-Host "`n[Step 1] Checking Vercel login status..." -ForegroundColor Yellow
$whoami = npx vercel whoami 2>&1
if ($whoami -like "*not logged in*" -or $whoami -like "*Error:*") {
    Write-Host "⚠️ You are not logged into Vercel CLI. Opening login page..." -ForegroundColor Red
    npx vercel login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Vercel login failed. Exiting." -ForegroundColor Red
        Exit
    }
} else {
    Write-Host "✅ Logged in as: $whoami" -ForegroundColor Green
}

# Step 2: Set up Backend Project
Write-Host "`n[Step 2] Linking and deploying Backend..." -ForegroundColor Yellow
cd backend

Write-Host "🔗 Linking project to Vercel (Interactive setup)..." -ForegroundColor Cyan
# Run interactive linking
npx vercel link --yes
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to link backend project." -ForegroundColor Red
    cd ..
    Exit
}

# Read secrets from local config
Write-Host "🔑 Reading credentials from .env and serviceAccountKey.json..." -ForegroundColor Cyan

$envContent = Get-Content .env -Raw
$geminiKey = ""
$algoMnemonic = ""
$fbProjectId = ""

if ($envContent -match 'GEMINI_API_KEY=(.*)') {
    $geminiKey = $Matches[1].Trim().Trim('"').Trim("'")
}
if ($envContent -match 'ALGORAND_MNEMONIC=(.*)') {
    $algoMnemonic = $Matches[1].Trim().Trim('"').Trim("'")
}
if ($envContent -match 'FIREBASE_PROJECT_ID=(.*)') {
    $fbProjectId = $Matches[1].Trim().Trim('"').Trim("'")
}

$saJson = Get-Content serviceAccountKey.json -Raw | ConvertFrom-Json
$fbClientEmail = $saJson.client_email
$fbPrivateKey = $saJson.private_key

# Function to add env var safely
function Add-VercelEnv($name, $value) {
    if (-not $value) {
        Write-Host "⚠️ Warning: No value found for $name, skipping." -ForegroundColor Yellow
        return
    }
    Write-Host "⚙️ Setting Vercel env var: $name" -ForegroundColor Cyan
    # Remove existing to prevent errors
    npx vercel env rm $name production -y 2>$null | Out-Null
    # Add new
    $value | npx vercel env add $name production | Out-Null
}

Add-VercelEnv "GEMINI_API_KEY" $geminiKey
Add-VercelEnv "ALGORAND_MNEMONIC" $algoMnemonic
Add-VercelEnv "FIREBASE_PROJECT_ID" $fbProjectId
Add-VercelEnv "FIREBASE_CLIENT_EMAIL" $fbClientEmail
Add-VercelEnv "FIREBASE_PRIVATE_KEY" $fbPrivateKey

Write-Host "🚀 Deploying backend to production..." -ForegroundColor Cyan
$deployOutput = npx vercel --prod
Write-Host $deployOutput

# Extract production URL from output
$backendUrl = ""
foreach ($line in ($deployOutput -split "`n")) {
    if ($line -match 'https://[a-zA-Z0-9-]+\.vercel\.app') {
        $backendUrl = $Matches[0]
        break
    }
}

if (-not $backendUrl) {
    # Fallback search in project info
    Write-Host "🔍 Fetching project URL..." -ForegroundColor Cyan
    $projInfo = npx vercel info
    foreach ($line in ($projInfo -split "`n")) {
        if ($line -match 'https://[a-zA-Z0-9-]+\.vercel\.app') {
            $backendUrl = $Matches[0]
            break
        }
    }
}

if (-not $backendUrl) {
    Write-Host "❌ Could not retrieve backend URL. Please paste it manually when prompted." -ForegroundColor Red
    $backendUrl = Read-Host "Enter backend Vercel URL"
}

Write-Host "✅ Backend deployed at: $backendUrl" -ForegroundColor Green

# Step 3: Set up Frontend Project
Write-Host "`n[Step 3] Linking and deploying Frontend..." -ForegroundColor Yellow
cd ../frontend

Write-Host "🔗 Linking frontend project to Vercel..." -ForegroundColor Cyan
npx vercel link --yes

# Read frontend env
$frontendEnv = Get-Content .env -Raw
$viteFbApiKey = ""
$viteFbAuthDomain = ""
$viteFbProjectId = ""
$viteFbStorageBucket = ""
$viteFbMsgId = ""
$viteFbAppId = ""

if ($frontendEnv -match 'VITE_FIREBASE_API_KEY=(.*)') { $viteFbApiKey = $Matches[1].Trim() }
if ($frontendEnv -match 'VITE_FIREBASE_AUTH_DOMAIN=(.*)') { $viteFbAuthDomain = $Matches[1].Trim() }
if ($frontendEnv -match 'VITE_FIREBASE_PROJECT_ID=(.*)') { $viteFbProjectId = $Matches[1].Trim() }
if ($frontendEnv -match 'VITE_FIREBASE_STORAGE_BUCKET=(.*)') { $viteFbStorageBucket = $Matches[1].Trim() }
if ($frontendEnv -match 'VITE_FIREBASE_MESSAGING_SENDER_ID=(.*)') { $viteFbMsgId = $Matches[1].Trim() }
if ($frontendEnv -match 'VITE_FIREBASE_APP_ID=(.*)') { $viteFbAppId = $Matches[1].Trim() }

Add-VercelEnv "VITE_API_URL" $backendUrl
Add-VercelEnv "VITE_FIREBASE_API_KEY" $viteFbApiKey
Add-VercelEnv "VITE_FIREBASE_AUTH_DOMAIN" $viteFbAuthDomain
Add-VercelEnv "VITE_FIREBASE_PROJECT_ID" $viteFbProjectId
Add-VercelEnv "VITE_FIREBASE_STORAGE_BUCKET" $viteFbStorageBucket
Add-VercelEnv "VITE_FIREBASE_MESSAGING_SENDER_ID" $viteFbMsgId
Add-VercelEnv "VITE_FIREBASE_APP_ID" $viteFbAppId

Write-Host "🚀 Deploying frontend to production..." -ForegroundColor Cyan
npx vercel --prod

Write-Host "`n🎉 Deployment finished successfully!" -ForegroundColor Green
cd ..
