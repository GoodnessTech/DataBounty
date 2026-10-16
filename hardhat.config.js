require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    botchain: {
      url: process.env.BOTCHAIN_RPC_URL || "https://rpc.botchain.ai",
      chainId: 677,
      accounts: [DEPLOYER_PRIVATE_KEY],
    },
  },
  mocha: {
    timeout: 120000,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
