require("dotenv").config();
const { ethers } = require("ethers");

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.error("DEPLOYER_PRIVATE_KEY is missing from .env");
    process.exit(1);
  }

  const rpcUrl = process.env.BOTCHAIN_RPC_URL || "https://rpc.botchain.ai";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const wallet = new ethers.Wallet(privateKey, provider);
  console.log("=== BOT Chain Preflight Validation ===");
  console.log("RPC Endpoint:", rpcUrl);
  
  const network = await provider.getNetwork();
  console.log("Network Name:", network.name);
  console.log("Chain ID:", network.chainId.toString());

  console.log("Deployer Address:", wallet.address);

  const balanceWei = await provider.getBalance(wallet.address);
  const balanceEth = ethers.formatEther(balanceWei);
  console.log("Deployer Balance:", balanceEth, "BOT");

  const feeData = await provider.getFeeData();
  console.log("Gas Price:", feeData.gasPrice ? ethers.formatUnits(feeData.gasPrice, "gwei") + " gwei" : "N/A");

  const blockNumber = await provider.getBlockNumber();
  console.log("Latest Block Number:", blockNumber);
}

main().catch(err => {
  console.error("Validation error:", err.message);
  process.exit(1);
});
