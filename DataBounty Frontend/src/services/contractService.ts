import { ethers } from 'ethers';
import { BOT_CHAIN_CONFIG, DATABOUNTY_ABI } from '../config/chain';
import { toProductIdBytes32 } from './receiptService';

// Fallback read-only provider connected directly to BOT Chain Mainnet RPC
export const publicProvider = new ethers.JsonRpcProvider(BOT_CHAIN_CONFIG.rpcUrl);

// Read-only contract instance
export const readOnlyContract = new ethers.Contract(
  BOT_CHAIN_CONFIG.contractAddress,
  DATABOUNTY_ABI,
  publicProvider
);

export interface WalletState {
  address: string | null;
  chainId: number | null;
  isCorrectChain: boolean;
  balanceBOT: string;
}

/**
 * Request wallet connection and check chain
 */
export async function connectBrowserWallet(): Promise<{
  address: string;
  chainId: number;
  balanceBOT: string;
  isCorrectChain: boolean;
}> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('No EVM browser wallet detected. Please install MetaMask or another Web3 wallet.');
  }

  const provider = new ethers.BrowserProvider((window as any).ethereum);
  const accounts = await provider.send('eth_requestAccounts', []);
  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts authorized.');
  }

  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  const isCorrectChain = chainId === BOT_CHAIN_CONFIG.chainId;

  let balanceBOT = '0.0';
  try {
    const balWei = await provider.getBalance(accounts[0]);
    balanceBOT = ethers.formatEther(balWei);
  } catch (e) {
    console.error('Error fetching balance:', e);
  }

  return {
    address: accounts[0],
    chainId,
    balanceBOT,
    isCorrectChain,
  };
}

/**
 * Prompts user to switch network to BOT Chain Mainnet, or adds it if not present
 */
export async function switchToBotChain(): Promise<void> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('No EVM browser wallet detected.');
  }

  const ethereum = (window as any).ethereum;

  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: BOT_CHAIN_CONFIG.chainIdHex }],
    });
  } catch (switchError: any) {
    // Error code 4902 indicates that the chain has not been added to MetaMask
    if (switchError.code === 4902 || switchError?.data?.originalError?.code === 4902) {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: BOT_CHAIN_CONFIG.chainIdHex,
            chainName: BOT_CHAIN_CONFIG.name,
            nativeCurrency: BOT_CHAIN_CONFIG.currency,
            rpcUrls: [BOT_CHAIN_CONFIG.rpcUrl],
            blockExplorerUrls: [BOT_CHAIN_CONFIG.explorerUrl],
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}

/**
 * Gets a signer-bound contract instance
 */
export async function getSignerContract(): Promise<ethers.Contract> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('No wallet connected.');
  }

  const provider = new ethers.BrowserProvider((window as any).ethereum);
  const signer = await provider.getSigner();
  return new ethers.Contract(BOT_CHAIN_CONFIG.contractAddress, DATABOUNTY_ABI, signer);
}

// ----------------------------------------------------------------------------
// Contract Read Operations
// ----------------------------------------------------------------------------

export async function fetchOnchainProduct(productId: string) {
  try {
    const bytes32Id = toProductIdBytes32(productId);
    const result = await readOnlyContract.getProduct(bytes32Id);
    return {
      exists: true,
      provider: result[0],
      active: result[1],
      pricePerCreditWei: result[2],
      pricePerCreditBOT: ethers.formatEther(result[2]),
      metadataURI: result[3],
    };
  } catch {
    return { exists: false, provider: '', active: false, pricePerCreditWei: 0n, pricePerCreditBOT: '0', metadataURI: '' };
  }
}

export async function fetchBuyerCredits(productId: string, buyerAddress: string): Promise<bigint> {
  try {
    const bytes32Id = toProductIdBytes32(productId);
    const credits: bigint = await readOnlyContract.getCredits(bytes32Id, buyerAddress);
    return credits;
  } catch {
    return 0n;
  }
}

export async function fetchProviderProceeds(providerAddress: string): Promise<bigint> {
  try {
    const proceeds: bigint = await readOnlyContract.getProviderBalance(providerAddress);
    return proceeds;
  } catch {
    return 0n;
  }
}

export async function isReceiptAlreadySettled(receiptHash: string): Promise<boolean> {
  try {
    return await readOnlyContract.isReceiptSettled(receiptHash);
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------------------
// Contract Write Operations
// ----------------------------------------------------------------------------

export async function purchaseCreditsOnchain(productId: string, quantity: number, pricePerCreditWei: bigint) {
  const contract = await getSignerContract();
  const bytes32Id = toProductIdBytes32(productId);
  const totalCostWei = BigInt(quantity) * pricePerCreditWei;

  const tx = await contract.purchaseCredits(bytes32Id, quantity, {
    value: totalCostWei,
  });
  const receipt = await tx.wait();
  return receipt;
}

export async function settleUsageOnchain(productId: string, quantity: number, receiptHash: string) {
  const contract = await getSignerContract();
  const bytes32Id = toProductIdBytes32(productId);

  const tx = await contract.settleUsage(bytes32Id, quantity, receiptHash);
  const receipt = await tx.wait();
  return receipt;
}

export async function registerProductOnchain(productId: string, pricePerCreditBOT: string, metadataURI: string) {
  const contract = await getSignerContract();
  const bytes32Id = toProductIdBytes32(productId);
  const priceWei = ethers.parseEther(pricePerCreditBOT);

  const tx = await contract.registerProduct(bytes32Id, priceWei, metadataURI);
  const receipt = await tx.wait();
  return receipt;
}

export async function withdrawProviderProceedsOnchain() {
  const contract = await getSignerContract();
  const tx = await contract.withdrawProviderProceeds();
  const receipt = await tx.wait();
  return receipt;
}
