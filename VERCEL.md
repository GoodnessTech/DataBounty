# Vercel Deployment Guide — DataBounty

This guide details how to deploy the **DataBounty** frontend to Vercel and configure all required environment variables.

---

## 1. Required Environment Variables

Add the following environment variables in your **Vercel Project Settings** > **Environment Variables** (apply to *Production*, *Preview*, and *Development*):

| Key | Recommended Value | Description |
|---|---|---|
| `VITE_DATABOUNTY_CONTRACT_ADDRESS` | `0xcB74535569cE34da878bC1Ac76d6f6B8e62bF994` | Deployed `DataBountyCore` contract on BOT Chain Mainnet |
| `VITE_BOTCHAIN_RPC_URL` | `https://rpc.botchain.ai` | Official BOT Chain Mainnet RPC endpoint |
| `VITE_BOTCHAIN_CHAIN_ID` | `677` | Official BOT Chain Mainnet Chain ID |
| `VITE_BOTCHAIN_EXPLORER_URL` | `https://scan.botchain.ai` | Official BOTScan block explorer |

> **Security Note:** Never add `DEPLOYER_PRIVATE_KEY` to Vercel! The frontend does not need or use private keys; all transactions are signed directly by user wallets (MetaMask, Rabby, OKX).

---

## 2. Deploying on Vercel

### Option A: Root Repository (Recommended & Preconfigured)
The repository includes a root `vercel.json` and a root build script.

1. Go to [vercel.com/new](https://vercel.com/new) and import `GoodnessTech/DataBounty`.
2. Keep the **Root Directory** as `./` (default).
3. **Framework Preset:** Vite (or Other).
4. **Build & Output Settings:**
   - **Build Command:** `npm run build` *(Preconfigured)*
   - **Output Directory:** `DataBounty Frontend/dist` *(Preconfigured)*
5. Paste the 4 environment variables listed in Section 1.
6. Click **Deploy**.

### Option B: Monorepo Subfolder Directory
If you prefer setting the Vercel Root Directory to the frontend folder:
1. In Vercel Project Settings, set **Root Directory** to `DataBounty Frontend`.
2. **Framework Preset:** Vite.
3. Build Command: `npm run build`
4. Output Directory: `dist`
5. Paste the environment variables and deploy.

---

## 3. SPA Routing & Deep Links

Both `vercel.json` at root and `DataBounty Frontend/vercel.json` include single-page application (SPA) rewrite rules:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```
This ensures refreshing pages like `/marketplace`, `/marketplace/:id`, `/provider`, `/buyer`, `/activity`, `/analytics`, and `/publish` will load seamlessly without 404 errors.
