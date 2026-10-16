# DataBounty Protocol & Marketplace

DataBounty is an onchain data marketplace and usage-billing protocol deployed directly to **BOT Chain Mainnet (Chain ID 677)**. It connects data providers, datasets, APIs, and live feeds to transparent commercial terms, prepaid credits, cryptographic usage receipts, and instant pull-payment settlement.

---

## 1. Verified BOT Chain Mainnet Deployment

- **Network:** BOT Chain Mainnet
- **Chain ID:** `677` (`0x2a5`)
- **Native Currency:** `BOT` (18 decimals)
- **RPC Endpoint:** `https://rpc.botchain.ai`
- **Explorer:** `https://scan.botchain.ai`
- **Documentation:** `https://dev-docs.botchain.ai/docs/Developers/quick-guide/`
- **DataBountyCore Contract Address:** [`0xcB74535569cE34da878bC1Ac76d6f6B8e62bF994`](https://scan.botchain.ai/address/0xcB74535569cE34da878bC1Ac76d6f6B8e62bF994)
- **Deployment Transaction Hash:** [`0x1e48236e0a622483c321f5c73a9ab0e298961c9573d00a8450a36ba39ba609cc`](https://scan.botchain.ai/tx/0x1e48236e0a622483c321f5c73a9ab0e298961c9573d00a8450a36ba39ba609cc)
- **Deployment Block Height:** `26870629`
- **Deployment Gas Used:** `1,092,070`
- **Gas Price:** `20.0 gwei`
- **Total Deployment Fee Paid:** `0.0218414 BOT`
- **Initial Protocol Fee:** `2.50%` (250 BPS, Hard capped at 10.00% max)
- **Initial Registered Product:** `climate-grid` (Tx: [`0xeb9d71e29dd3d274f033ebfa426b6c57345ffbab63853817a985a02293713d47`](https://scan.botchain.ai/tx/0xeb9d71e29dd3d274f033ebfa426b6c57345ffbab63853817a985a02293713d47), Block `26870800`, Gas `137,992`)

---

## 2. Protocol Architecture & Lifecycle

```
[ Data Provider ]
       │
       ▼ (1) registerProduct(productId, pricePerCredit, metadataURI)
┌────────────────────────────────────────────────────────┐
│                   DataBountyCore                       │
│              (BOT Chain Mainnet: 677)                  │
└────────────────────────────────────────────────────────┘
       ▲                                ▲
       │ (2) purchaseCredits{value}      │ (4) settleUsage(productId, quantity, receiptHash)
       │                                │
[ Data Buyer ] ──(3) Query API ──► [ Provider API / Metering Engine ]
                     & Get Canonical Receipt
```

### Lifecycle Steps:
1. **Product Registration:** Providers register catalog items specifying `productId` (bytes32), `pricePerCredit` (wei BOT), and offchain `metadataURI`.
2. **Prepaid Credit Purchases:** Buyers deposit exact native BOT to purchase usage credits.
3. **Offchain Consumption & Metering:** Buyers query API endpoints or consume datasets offchain. The metering engine produces a canonical receipt.
4. **Usage Settlement:** The buyer submits the canonical `receiptHash` onchain. The contract verifies available credits, prevents replay, deducts credits, and credits the provider balance minus protocol fee.
5. **Pull-Payment Withdrawals:** Providers withdraw accumulated earnings (`withdrawProviderProceeds`) using CEI + reentrancy protection.

---

## 3. Gas Benchmarks (Hardhat & Mainnet)

| Operation | Typical Gas Used | Native Cost @ 20 gwei |
|---|---|---|
| Contract Deployment | 1,092,070 gas (Mainnet) | 0.02184 BOT |
| `registerProduct` | 93,041 gas (test) / 137,992 gas (Mainnet) | ~0.00276 BOT |
| `purchaseCredits` | 50,801 gas | ~0.00101 BOT |
| `settleUsage` | 104,622 gas | ~0.00209 BOT |
| `withdrawProviderProceeds` | 32,578 gas | ~0.00065 BOT |
| `withdrawMarketplaceFees` | 35,593 gas | ~0.00071 BOT |

---

## 4. Security & Threat Model

- **No Custom Token Friction:** Operates directly with native `BOT`. No approvals, permit signatures, or ERC-20 edge cases.
- **Replay Protection:** Unique `receiptHash` is permanently recorded upon settlement. Re-submitting the same hash reverts with `ReceiptAlreadySettled`.
- **Reentrancy Protection:** All withdrawals follow the Checks-Effects-Interactions (CEI) pattern and are protected by a gas-optimized reentrancy lock.
- **Fee Abuse Prevention:** Protocol fee is strictly capped at `MAX_FEE_BPS = 1000` (10.00%). Admin cannot set arbitrary confiscatory fees.
- **Fair Settlement Policy:** If a provider deactivates a product, new purchases are halted, but buyers holding existing prepaid credits can still settle valid usage.
- **Data Delivery Boundary:** The smart contract cryptographically enforces payment settlement against the canonical receipt hash. It does not inspect dataset payloads or offchain delivery contents directly.

---

## 5. Automated Tests

The test suite contains 28 unit and integration tests covering:
- Constructor parameters and fee cap limits
- Product registration, deactivation, and price modifications
- Unauthorized attempts to modify third-party products
- Exact-payment enforcement and under/over-payment reverts
- Non-existent product purchases
- Canonical usage settlement and credit deductions
- Receipt replay prevention
- Provider pull withdrawals and zero-balance rejection
- Marketplace fee withdrawals and access controls
- Deactivated product settlement honoring

Run tests:
```bash
npm test
```

---

## 6. Frontend Integration

The existing Bolt frontend design has been preserved and connected to the deployed contract:
- **Wallet Connection:** Injected browser wallet (MetaMask, Rabby) with automatic network detection for Chain ID 677.
- **Footer Navigation:** Clickable text links for **BOT Chain** (`https://dev-docs.botchain.ai/docs/Developers/quick-guide/`) and **BOTScan** (`https://scan.botchain.ai`) per requirements.
- **Marketplace & Purchases:** Live product catalog with purchase modals broadcasting transactions to BOT Chain Mainnet.
- **Receipt Simulator & Settlement:** Onchain usage settlement with canonical deterministic hashing.
- **Provider Workspace:** Live balance queries and pull withdrawals.

Run the frontend locally:
```bash
cd "DataBounty Frontend"
npm run dev
```

Build for production:
```bash
cd "DataBounty Frontend"
npm run build
```
