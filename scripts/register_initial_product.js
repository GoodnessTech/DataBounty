require("dotenv").config();
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const deploymentPath = path.join(__dirname, "../deployments/botchain_mainnet.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  const [deployer] = await ethers.getSigners();
  console.log("Interacting from deployer:", deployer.address);
  console.log("Contract Address:", deployment.contractAddress);

  const core = await ethers.getContractAt("DataBountyCore", deployment.contractAddress, deployer);

  const productId = ethers.encodeBytes32String("climate-grid");
  const pricePerCredit = ethers.parseEther("0.0001"); // 0.0001 BOT per credit
  const metadataURI = "ipfs://bafybeicgclimategridsignalsv1metadata";

  console.log("Registering product 'climate-grid' on BOT Chain Mainnet...");
  const tx = await core.registerProduct(productId, pricePerCredit, metadataURI);
  console.log("Transaction broadcasted:", tx.hash);

  const receipt = await tx.wait();
  console.log("Product registration confirmed!");
  console.log("Block Number:", receipt.blockNumber);
  console.log("Gas Used:    ", receipt.gasUsed.toString());
  console.log("Explorer Link: https://scan.botchain.ai/tx/" + receipt.hash);

  // Read back product
  const prod = await core.getProduct(productId);
  console.log("Onchain Product Verified:");
  console.log("  Provider:        ", prod.provider);
  console.log("  Active:          ", prod.active);
  console.log("  Price per Credit:", ethers.formatEther(prod.pricePerCredit), "BOT");
  console.log("  Metadata URI:    ", prod.metadataURI);
}

main().catch(console.error);
