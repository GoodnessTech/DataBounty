import { ethers } from 'ethers';

export interface UsageReceiptData {
  productId: string; // e.g. "climate-grid"
  buyer: string; // EVM address
  quantity: number; // e.g. 5
  billingUnit: string; // e.g. "request" | "records" | "query"
  nonce: string; // unique random or sequential identifier
  timeInterval: {
    start: number; // unix timestamp seconds
    end: number;
  };
  meteringEvidenceHash: string; // hash of offchain delivery logs / query traces
  timestamp: number; // creation unix timestamp
}

export interface CanonicalReceipt {
  data: UsageReceiptData;
  receiptHash: string; // bytes32 hex
  canonicalJson: string;
}

/**
 * Creates a canonically sorted JSON string of receipt data to ensure deterministic hashing
 */
export function canonicalizeReceiptData(data: UsageReceiptData): string {
  const sortedPayload = {
    billingUnit: data.billingUnit,
    buyer: data.buyer.toLowerCase(),
    meteringEvidenceHash: data.meteringEvidenceHash,
    nonce: data.nonce,
    productId: data.productId,
    quantity: data.quantity,
    timeInterval: {
      end: data.timeInterval.end,
      start: data.timeInterval.start,
    },
    timestamp: data.timestamp,
  };
  return JSON.stringify(sortedPayload);
}

/**
 * Computes deterministic Keccak256 hash matching smart contract receipt verification
 */
export function hashCanonicalReceipt(canonicalJson: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(canonicalJson));
}

/**
 * Generates a full canonical receipt object ready for settlement
 */
export function generateUsageReceipt(params: {
  productId: string;
  buyer: string;
  quantity: number;
  billingUnit?: string;
  meteringEvidence?: string;
}): CanonicalReceipt {
  const now = Math.floor(Date.now() / 1000);
  const evidence = params.meteringEvidence || `api_call_${now}_${Math.random().toString(36).substring(2, 10)}`;
  const meteringEvidenceHash = ethers.keccak256(ethers.toUtf8Bytes(evidence));

  const receiptData: UsageReceiptData = {
    productId: params.productId,
    buyer: params.buyer,
    quantity: params.quantity,
    billingUnit: params.billingUnit || 'query',
    nonce: `rcpt_${now}_${Math.random().toString(36).substring(2, 8)}`,
    timeInterval: {
      start: now - 300,
      end: now,
    },
    meteringEvidenceHash,
    timestamp: now,
  };

  const canonicalJson = canonicalizeReceiptData(receiptData);
  const receiptHash = hashCanonicalReceipt(canonicalJson);

  return {
    data: receiptData,
    receiptHash,
    canonicalJson,
  };
}

/**
 * Converts text productId (e.g. 'climate-grid') to bytes32 format
 */
export function toProductIdBytes32(id: string): string {
  try {
    return ethers.encodeBytes32String(id);
  } catch {
    return ethers.keccak256(ethers.toUtf8Bytes(id));
  }
}
