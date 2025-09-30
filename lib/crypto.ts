
// Production-ready encryption implementation using tweetnacl
import { blake2b } from '@noble/hashes/blake2.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { hexToBytes } from '@noble/hashes/utils.js';
import { base58 } from '@scure/base';
import * as sr25519 from '@scure/sr25519';
import { mnemonicToEntropy, validateMnemonic, wordlists } from 'bip39';
import * as nacl from 'tweetnacl';
import * as naclUtil from 'tweetnacl-util';

export interface KeyPair {
  seed: string;
  sk: Uint8Array;
  pk: Uint8Array;
  accessKeyId: string;
  ss58Address: string;
}

export interface EncryptedMessage {
  nonce: string;
  ciphertext: string;
}

/**
 * Generate a simple keypair using tweetnacl
 */

/**
 * Derive keypair from a simple seed string (for test users)
 */
export function deriveKeysFromSeed(seed: string, ss58Address: string): KeyPair {
  // Create a deterministic keypair from seed
  const seedBytes = naclUtil.decodeUTF8(seed);
  const hash = nacl.hash(seedBytes);
  
  // Use first 32 bytes as seed for key generation
  const keyPair = nacl.box.keyPair.fromSecretKey(hash.slice(0, 32));
  
  
  return {
    seed: seed,
    sk: keyPair.secretKey,
    pk: keyPair.publicKey,
    accessKeyId: Buffer.from(seed).toString('base64'),
    ss58Address: ss58Address.trim(),
  };
}

/**
 * Generate Hippius S3 credentials from keypair
 */
export function hippiusCredentialsFromKeyPair(keyPair: KeyPair): {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
} {
  return {
    accessKeyId: keyPair.accessKeyId,
    secretAccessKey: keyPair.seed,
    sessionToken: ''
  };
}

/**
 * Encrypt message for recipient using tweetnacl SealedBox (equivalent to nacl.public.SealedBox)
 */
export function encryptFor(recipientPk: Uint8Array, plaintext: Uint8Array): EncryptedMessage {
  // Debug: validate inputs
  if (!(recipientPk instanceof Uint8Array) || recipientPk.length !== 32) {
    console.log('[encryptFor] Invalid recipientPk length:', (recipientPk as any)?.length);
    throw new Error('recipientPk must be 32 bytes');
  }
  if (!(plaintext instanceof Uint8Array)) {
    console.log('[encryptFor] plaintext is not Uint8Array');
    throw new Error('plaintext must be Uint8Array');
  }
  // Use tweetnacl's box for public key encryption
  // Generate ephemeral keypair for this encryption
  const ephemeralKeyPair = nacl.box.keyPair();
  
  // Encrypt using recipient's public key and our ephemeral private key
  const nonce = nacl.randomBytes(24);
  const ciphertext = nacl.box(plaintext, nonce, recipientPk, ephemeralKeyPair.secretKey);
  // console.log('[encryptFor] ephemeralPk[0..3]:', Array.from(ephemeralKeyPair.publicKey.slice(0, 4)));
  // console.log('[encryptFor] nonce(b64):', naclUtil.encodeBase64(nonce));
  
  if (!ciphertext) {
    throw new Error('Encryption failed');
  }
  
  // Combine ephemeral public key with ciphertext
  const combined = new Uint8Array(32 + ciphertext.length);
  combined.set(ephemeralKeyPair.publicKey, 0);
  combined.set(ciphertext, 32);
  // console.log('[encryptFor] combined length:', combined.length);
  
  return {
    nonce: naclUtil.encodeBase64(nonce),
    ciphertext: naclUtil.encodeBase64(combined)
  };
}

/**
 * Decrypt message using tweetnacl SealedBox
 */
export function decryptFrom(senderPk: Uint8Array, ourSk: Uint8Array, encrypted: EncryptedMessage): Uint8Array {
  // Debug: validate inputs
  if (!(ourSk instanceof Uint8Array) || ourSk.length !== 32) {
    console.log('[decryptFrom] Invalid ourSk length:', (ourSk as any)?.length);
    throw new Error('ourSk must be 32 bytes');
  }
  const nonce = naclUtil.decodeBase64(encrypted.nonce);
  const combined = naclUtil.decodeBase64(encrypted.ciphertext);
  
  // Extract ephemeral public key and ciphertext
  const ephemeralPk = combined.slice(0, 32);
  const ciphertext = combined.slice(32);
  // console.log('[decryptFrom] ephemeralPk[0..3]:', Array.from(ephemeralPk.slice(0, 4)));
  // console.log('[decryptFrom] nonce(b64):', naclUtil.encodeBase64(nonce));
  
  // Decrypt using our private key and ephemeral public key
  const plaintext = nacl.box.open(ciphertext, nonce, ephemeralPk, ourSk);
  
  if (!plaintext) {
    console.log('[decryptFrom] Decryption failed. ciphertext length:', ciphertext.length);
    throw new Error('Decryption failed - invalid ciphertext or keys');
  }
  
  return plaintext;
}

/**
 * Generate message ID using cryptographic hash
 */
export function generateMessageId(
  timestamp: string,
  from: string,
  to: string,
  nonce: string,
  ciphertext: string
): string {
  const data = `${timestamp}|${from}|${to}|${nonce}|${ciphertext}`;
  const dataBytes = naclUtil.decodeUTF8(data);
  const hash = nacl.hash(dataBytes);
  return naclUtil.encodeBase64(hash);
}

/**
 * Convert keypair to hex strings for storage/transmission
 */
export function keyPairToHex(keyPair: KeyPair): { sk: string; pk: string } {
  return {
    sk: Buffer.from(keyPair.sk).toString('hex'),
    pk: Buffer.from(keyPair.pk).toString('hex')
  };
}

/**
 * Convert hex strings back to keypair
 */
export function hexToKeyPair(skHex: string, pkHex: string, accessKeyId: string, ss58Address: string): KeyPair {
  return {
    seed: '',
    sk: Buffer.from(skHex, 'hex'),
    pk: Buffer.from(pkHex, 'hex'),
    accessKeyId,
    ss58Address
  };
}

/**
 * Sign a message with private key
 */
export function signMessage(message: Uint8Array, privateKey: Uint8Array): string {
  const signature = nacl.sign.detached(message, privateKey);
  return naclUtil.encodeBase64(signature);
}

/**
 * Verify a message signature
 */
export function verifySignature(message: Uint8Array, signature: string, publicKey: Uint8Array): boolean {
  const sigBytes = naclUtil.decodeBase64(signature);
  return nacl.sign.detached.verify(message, sigBytes, publicKey);
}

/**
 * Get SS58 address and public key from seed using API
 */
export async function getAddressFromSeed(seed: string): Promise<{ ss58_address: string; public_key: string }> {
  try {
    const response = await fetch('http://172.86.122.52:8000/get_address', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ seed }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.ss58_address || !data.public_key) {
      throw new Error('Invalid response from API');
    }

    return data;
  } catch (error) {
    console.error('Failed to get address from seed:', error);
    throw new Error(`Failed to get address from seed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function mnemonicToSs58(mnemonic: string, ss58Prefix = 42, password = '') {
  // Ensure WASM is initialized for util-crypto
//   await cryptoWaitReady();

  // 1) Substrate way: mnemonic -> mini-secret (32 bytes)
  const miniSecret = customMnemonicToMiniSecret(mnemonic, password);
//   console.log('miniSecret', miniSecret);

  const secretKey = sr25519.secretFromSeed(miniSecret);
//   console.log('secretKey', secretKey);

  // 2) Derive sr25519 keypair from mini-secret
  const publicKey = sr25519.getPublicKey(secretKey);
//   console.log('publicKey', publicKey);
  // (optional) hex form
//   const pubHex = u8aToHex(publicKey);
//   console.log('pubHex', pubHex);

  // 3) SS58 encode the public key (choose chain prefix)
//   const ss58 = encodeAddress(publicKey, ss58Prefix);
  const ss58 = ss58Encode(publicKey, ss58Prefix);

  return { ss58_address: ss58, public_key: publicKey };
}

function ss58Encode(publicKey: Uint8Array, prefix = 42) {
    if (publicKey.length !== 32) {
      throw new Error('Public key must be 32 bytes')
    }
  
    const prefixBytes = new Uint8Array([prefix])
    const payload = new Uint8Array(prefixBytes.length + publicKey.length)
    payload.set(prefixBytes, 0)
    payload.set(publicKey, prefixBytes.length)
  
    const pre = new TextEncoder().encode('SS58PRE')
    const hash = blake2b(new Uint8Array([...pre, ...payload]), { dkLen: 64 })
    const checksum = hash.slice(0, 2)
  
    const finalBytes = new Uint8Array(payload.length + 2)
    finalBytes.set(payload, 0)
    finalBytes.set(checksum, payload.length)
  
    return base58.encode(finalBytes)
  }

function customMnemonicToMiniSecret(mnemonic: string, password = '') {
    if (!validateMnemonic(mnemonic, wordlists.english)) {
      throw new Error('Invalid BIP39 mnemonic')
    }
  
    // entropy from mnemonic
    const entropy = mnemonicToEntropy(mnemonic, wordlists.english)
    const entropyBytes = hexToBytes(entropy)
  
    // salt = "mnemonic" + password
    const salt = new TextEncoder().encode('mnemonic' + password)
  
    // pbkdf2-HMAC-SHA512(entropy, salt, 2048) → 64 bytes
    const seed64 = pbkdf2(sha512, entropyBytes, salt, { c: 2048, dkLen: 64 })
  
    // first 32 bytes only (mini-secret)
    return seed64.slice(0, 32)
  }