<#
.SYNOPSIS
    Deploy MileAI ke BSC Testnet.
.DESCRIPTION
    1. Deploy MilestoneEscrow + TestToken via forge script
    2. Extract CONTRACT_ADDRESS & TOKEN_ADDRESS dari broadcast log
    3. Auto-update .env (contracts + backend)
    4. (Opsional) Mint TestToken ke wallet payer
    5. (Opsional) Jalankan E2E test

    Usage: .\scripts\deploy-testnet.ps1
#>

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $PSScriptRoot
$CONTRACTS_DIR = Join-Path $ROOT "contracts"
$BACKEND_DIR = Join-Path $ROOT "backend"
$FRONTEND_DIR = Join-Path $ROOT "frontend"

# ============================================================
# Helper: baca env value dari file
# ============================================================
function Get-EnvValue {
    param([string]$Path, [string]$Key)
    $line = Get-Content $Path | Where-Object { $_ -match "^$Key=" } | Select-Object -First 1
    if ($line) { return ($line -split "=", 2)[1].Trim() }
    return ""
}

# ============================================================
# Helper: update/set env value di file
# ============================================================
function Set-EnvValue {
    param([string]$Path, [string]$Key, [string]$Value)
    $lines = Get-Content $Path -ErrorAction SilentlyContinue
    $found = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^$Key=") {
            $lines[$i] = "$Key=$Value"
            $found = $true
            break
        }
    }
    if (-not $found) {
        $lines += "$Key=$Value"
    }
    $lines | Set-Content $Path
}

# ============================================================
# Cek prerequisites
# ============================================================
Write-Host ""
Write-Host "=== MileAI BSC Testnet Deploy ===" -ForegroundColor Cyan
Write-Host ""

# Cek forge
try {
    $forgeVer = & forge --version 2>&1
    Write-Host "[OK] forge: $forgeVer" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] forge tidak ditemukan. Install Foundry: https://book.getfoundry.sh" -ForegroundColor Red
    exit 1
}

# Cek .env contracts
$contractsEnv = Join-Path $CONTRACTS_DIR ".env"
if (-not (Test-Path $contractsEnv)) {
    Write-Host "[ERROR] $contractsEnv tidak ditemukan. Copy dari .env.example lalu isi." -ForegroundColor Red
    exit 1
}

$DEPLOYER_KEY = Get-EnvValue $contractsEnv "DEPLOYER_PRIVATE_KEY"
$AGENT_KEY = Get-EnvValue $contractsEnv "AGENT_PRIVATE_KEY"
$RPC = Get-EnvValue $contractsEnv "RPC_URL"
if (-not $RPC) { $RPC = "https://bsc-testnet.drpc.org" }

if (-not $DEPLOYER_KEY) {
    Write-Host "[ERROR] DEPLOYER_PRIVATE_KEY kosong di contracts/.env" -ForegroundColor Red
    exit 1
}
if (-not $AGENT_KEY) {
    Write-Host "[ERROR] AGENT_PRIVATE_KEY kosong di contracts/.env" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] contracts/.env loaded" -ForegroundColor Green
Write-Host "     Deployer: $($DEPLOYER_KEY.Substring(0,10))..." -ForegroundColor Gray
Write-Host "     Agent:    $($AGENT_KEY.Substring(0,10))..." -ForegroundColor Gray
Write-Host "     RPC:      $RPC" -ForegroundColor Gray
Write-Host ""

# ============================================================
# Step 1: Deploy
# ============================================================
Write-Host "--- Step 1: Deploy MilestoneEscrow + TestToken ---" -ForegroundColor Yellow
Write-Host "RPC: $RPC" -ForegroundColor Gray
Write-Host ""

Set-Location $CONTRACTS_DIR

$deployOutput = & forge script script/Deploy.s.sol:Deploy `
    --rpc-url $RPC `
    --broadcast 2>&1 | Out-String

Write-Host $deployOutput

# ============================================================
# Step 2: Extract addresses dari broadcast log
# ============================================================
Write-Host "--- Step 2: Extract addresses ---" -ForegroundColor Yellow

$broadcastDir = Join-Path $CONTRACTS_DIR "broadcast\Deploy.s.sol"
$chainId = 97  # BSC Testnet

# Cari run-latest.json
$latestJson = Get-ChildItem -Path $broadcastDir -Recurse -Filter "run-latest.json" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $latestJson) {
    Write-Host "[WARN] Tidak bisa auto-detect addresses dari broadcast log." -ForegroundColor Yellow
    Write-Host "       Copy addresses dari output deploy di atas, lalu paste ke contracts/.env" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Contoh format output:" -ForegroundColor Gray
    Write-Host '  TestToken: 0x...' -ForegroundColor Gray
    Write-Host '  MilestoneEscrow: 0x...' -ForegroundColor Gray
    Write-Host ""
    Write-Host "Lalu edit manual:" -ForegroundColor Gray
    Write-Host '  contracts/.env: CONTRACT_ADDRESS=0x... TOKEN_ADDRESS=0x...' -ForegroundColor Gray
    Write-Host '  backend/.env: CONTRACT_ADDRESS=0x...' -ForegroundColor Gray
    Write-Host ""
    Set-Location $ROOT
    exit 0
}

Write-Host "Broadcast log: $($latestJson.FullName)" -ForegroundColor Gray

$broadcast = Get-Content $latestJson.FullName -Raw | ConvertFrom-Json
$transactions = $broadcast.transactions

$escrowAddr = ""
$tokenAddr = ""

foreach ($tx in $transactions) {
    $desc = $tx.description
    if ($desc -match "MilestoneEscrow") {
        $escrowAddr = $tx.contractAddress
    }
    if ($desc -match "TestToken") {
        $tokenAddr = $tx.contractAddress
    }
}

if (-not $escrowAddr -or -not $tokenAddr) {
    # Fallback: cek return value / contractAddress dari tx receipt
    Write-Host "[WARN] Tidak bisa extract dari broadcast. Coba parse manual dari output." -ForegroundColor Yellow
    Write-Host ""
    Set-Location $ROOT
    exit 0
}

Write-Host ""
Write-Host "[OK] Addresses ditemukan:" -ForegroundColor Green
Write-Host "  CONTRACT_ADDRESS = $escrowAddr" -ForegroundColor Cyan
Write-Host "  TOKEN_ADDRESS    = $tokenAddr" -ForegroundColor Cyan
Write-Host ""

# ============================================================
# Step 3: Update .env files
# ============================================================
Write-Host "--- Step 3: Update .env files ---" -ForegroundColor Yellow

# Update contracts/.env
Set-EnvValue $contractsEnv "CONTRACT_ADDRESS" $escrowAddr
Set-EnvValue $contractsEnv "TOKEN_ADDRESS" $tokenAddr
Write-Host "[OK] contracts/.env updated" -ForegroundColor Green

# Update backend/.env
$backendEnv = Join-Path $BACKEND_DIR ".env"
if (Test-Path $backendEnv) {
    Set-EnvValue $backendEnv "CONTRACT_ADDRESS" $escrowAddr
    Write-Host "[OK] backend/.env updated (CONTRACT_ADDRESS)" -ForegroundColor Green
} else {
    Write-Host "[WARN] backend/.env tidak ditemukan, skip update" -ForegroundColor Yellow
}

# Update frontend/.env.local
$frontendEnv = Join-Path $FRONTEND_DIR ".env.local"
if (Test-Path $frontendEnv) {
    Set-EnvValue $frontendEnv "NEXT_PUBLIC_CONTRACT_ADDRESS" $escrowAddr
    Write-Host "[OK] frontend/.env.local updated (NEXT_PUBLIC_CONTRACT_ADDRESS)" -ForegroundColor Green
} else {
    Write-Host "[WARN] frontend/.env.local tidak ditemukan, skip update" -ForegroundColor Yellow
}

Write-Host ""

# ============================================================
# Step 4: Mint TestToken ke payer (opsional)
# ============================================================
Write-Host "--- Step 4: Mint TestToken ---" -ForegroundColor Yellow

$payerKey = Get-EnvValue $contractsEnv "PAYER_PRIVATE_KEY"
if ($payerKey) {
    # Derive payer address dari private key
    $payerAddr = & cast wallet address $payerKey 2>&1
    if ($payerAddr -match "^0x") {
        Write-Host "Payer address: $payerAddr" -ForegroundColor Gray
        Write-Host "Minting 1000 TestToken..." -ForegroundColor Gray

        $mintAmount = "1000000000000000000000"  # 1000 * 10^18
        & cast send $tokenAddr "mint(address,uint256)" $payerAddr $mintAmount `
            --rpc-url $RPC `
            --private-key $payerKey 2>&1 | Out-Null

        if ($LASTEXITCODE -eq 0) {
            Write-Host "[OK] 1000 TestToken dimint ke $payerAddr" -ForegroundColor Green
        } else {
            Write-Host "[WARN] Mint gagal (mungkin token belum ada atau gas kurang)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[WARN] Tidak bisa derive payer address dari PAYER_PRIVATE_KEY" -ForegroundColor Yellow
    }
} else {
    Write-Host "[SKIP] PAYER_PRIVATE_KEY kosong di contracts/.env — mint dilewati" -ForegroundColor Yellow
    Write-Host "       Isi PAYER_PRIVATE_KEY lalu jalankan manual:" -ForegroundColor Gray
    Write-Host "       cast send $TOKEN_ADDRESS `"mint(address,uint256)`" <PAYER_ADDR> 1000000000000000000000 --rpc-url $RPC --private-key <KEY>" -ForegroundColor Gray
}

Write-Host ""

# ============================================================
# Step 5: Summary
# ============================================================
Write-Host "=== DEPLOY SELESAI ===" -ForegroundColor Green
Write-Host ""
Write-Host "Alamat kontrak BSC Testnet:" -ForegroundColor Cyan
Write-Host "  MilestoneEscrow : $escrowAddr"
Write-Host "  TestToken       : $tokenAddr"
Write-Host ""
Write-Host "Explorer:" -ForegroundColor Cyan
Write-Host "  https://testnet.bscscan.com/address/$escrowAddr"
Write-Host "  https://testnet.bscscan.com/address/$tokenAddr"
Write-Host ""
Write-Host "Selanjutnya:" -ForegroundColor Yellow
Write-Host "  1. Jalankan backend:  cd backend && uvicorn main:app --reload"
Write-Host "  2. Jalankan frontend: cd frontend && npm run dev"
Write-Host "  3. Buka http://localhost:3000"
Write-Host ""

Set-Location $ROOT
