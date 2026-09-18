#!/usr/bin/env bash
# Deploy MileAI ke BSC Testnet via WSL (forge ada di WSL).
set -euo pipefail

export PATH="$HOME/.foundry/bin:$PATH"
cd "$(dirname "$0")/../contracts"

# --- baca .env ---
DEPLOYER_KEY=$(grep -E '^DEPLOYER_PRIVATE_KEY=' .env | cut -d= -f2- | tr -d ' \r')
AGENT_KEY=$(grep -E '^AGENT_PRIVATE_KEY=' .env | cut -d= -f2- | tr -d ' \r')
RPC_URL=$(grep -E '^RPC_URL=' .env | cut -d= -f2- | tr -d ' \r')

if [ -z "$DEPLOYER_KEY" ] || [ -z "$RPC_URL" ]; then
  echo "[ERROR] DEPLOYER_PRIVATE_KEY / RPC_URL kosong di contracts/.env"
  exit 1
fi

echo "=== Step 0: cek saldo wallet ==="
ADDR=$(cast wallet address "$DEPLOYER_KEY")
echo "Deployer/Agent/Payer: $ADDR"
BAL=$(cast balance "$ADDR" --rpc-url "$RPC_URL")
python3 - "ADDR" "RPC_URL" "$BAL" <<'PY'
import sys
addr, rpc, bal = sys.argv[1], sys.argv[2], sys.argv[3]
print(f"tBNB balance = {int(bal)/1e18:.6f}")
if int(bal) < 10**16:
    print("[ERROR] Saldo < 0.01 tBNB. Isi faucet dulu: https://testnet.bnbchain.org/faucet-smart")
    sys.exit(1)
sys.exit(0)
PY

echo ""
echo "=== Step 1: forge build ==="
forge build

echo ""
echo "=== Step 2: dry-run (simulasi, tanpa broadcast) ==="
forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL"
echo "[OK] Simulasi berhasil. Menjalankan broadcast..."

echo ""
echo "=== Step 3: forge script --broadcast ==="
forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --broadcast

echo ""
echo "=== Step 4: extract address dari broadcast log ==="
LATEST=$(ls -t broadcast/Deploy.s.sol/97/run-latest.json 2>/dev/null | head -1)
if [ -z "$LATEST" ]; then
    echo "[ERROR] broadcast log tidak ditemukan. Cek output di atas."
    exit 1
fi
FILE="broadcast/Deploy.s.sol/97/run-latest.json"
echo "Log: $FILE"
ESCROW=$(python3 -c "import json,sys; d=json.load(open('$FILE')); tx=[t for t in d['transactions']]; print(tx[1]['contractAddress'] if len(tx)>1 else '')")
TOKEN=$(python3 -c "import json,sys; d=json.load(open('$FILE')); tx=[t for t in d['transactions']]; print(tx[0]['contractAddress'] if len(tx)>0 else '')")
echo "MilestoneEscrow: $ESCROW"
echo "TestToken      : $TOKEN"

echo ""
echo "=== Step 5: update .env files ==="
cd ..
# contracts/.env
sed -i.bak "s|^CONTRACT_ADDRESS=.*|CONTRACT_ADDRESS=$ESCROW|" contracts/.env
sed -i.bak "s|^TOKEN_ADDRESS=.*|TOKEN_ADDRESS=$TOKEN|" contracts/.env
rm -f contracts/.env.bak
# backend/.env
if [ -f backend/.env ]; then
    sed -i.bak "s|^CONTRACT_ADDRESS=.*|CONTRACT_ADDRESS=$ESCROW|" backend/.env
    rm -f backend/.env.bak
fi
# frontend/.env.local
if [ -f frontend/.env.local ]; then
    sed -i.bak "s|^NEXT_PUBLIC_CONTRACT_ADDRESS=.*|NEXT_PUBLIC_CONTRACT_ADDRESS=$ESCROW|" frontend/.env.local
    rm -f frontend/.env.local.bak
fi
echo "[DONE] Address kontrak sudah di-update ke .env semua."

echo ""
echo "=== DEPLOY SELESAI ==="
echo "MilestoneEscrow : $ESCROW"
echo "TestToken       : $TOKEN"
echo "Explorer        : https://testnet.bscscan.com/address/$ESCROW"
echo ""
echo "Agent address   : $(cast wallet address "$AGENT_KEY")"