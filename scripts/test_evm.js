require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  const artifactPath = path.join(__dirname, "../artifacts/contracts/DataBountyCore.sol/DataBountyCore.json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const rpcUrl = process.env.BOTCHAIN_RPC_URL || "https://rpc.botchain.ai";
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log("=== Dry-Run Deployment & EVM Compatibility Test on BOT Chain ===");
  console.log("Deployer:", wallet.address);

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const deployTx = await factory.getDeployTransaction(250); // 2.50% initial fee

  try {
    const estimatedGas = await provider.estimateGas(deployTx);
    console.log("SUCCESS: Bytecode is fully compatible with BOT Chain!");
    console.log("Estimated Deployment Gas:", estimatedGas.toString());
    
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || ethers.parseUnits("20", "gwei");
    const estimatedCostWei = estimatedGas * gasPrice;
    console.log("Estimated Cost in BOT:", ethers.formatEther(estimatedCostWei), "BOT");
  } catch (err) {
    console.error("estimateGas failed:", err.message);
  }
}

main().catch(console.error);
