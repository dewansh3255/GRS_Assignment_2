// Helper: Convert ArrayBuffer to Base64 string
export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

// Helper: Derive an AES-GCM key from the user's password using PBKDF2
const deriveAESKeyFromPassword = async (password: string, salt: Uint8Array): Promise<CryptoKey> => {
  const enc = new TextEncoder();

  // 1. Import the password as raw key material
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  // 2. Derive the AES-GCM key using PBKDF2 with 100,000 iterations
  return await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false, // We don't need to export the AES key itself
    ["encrypt", "decrypt"]
  );
};

/**
 * Main Function: Generates RSA keys and wraps the private key with the user's password.
 * This runs when a user REGISTERS.
 */
export const generateAndWrapKeys = async (password: string) => {
  // 1. Generate RSA-OAEP Keypair (2048-bit)
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true, // Must be true so we can export the private key
    ["encrypt", "decrypt"]
  );

  // 2. Export the Public Key to SPKI format (Standard for sharing)
  const exportedPublicKey = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
  const publicKeyBase64 = arrayBufferToBase64(exportedPublicKey);

  // 3. Export the Private Key to PKCS8 format (Standard for storage)
  const exportedPrivateKey = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  // 4. Encrypt the Private Key with AES-GCM using the user's password
  // We use a static salt for the PBKDF2 derivation here for simplicity, 
  // but in production, this should be a random salt stored in the DB per user.
  const salt = new TextEncoder().encode("fcs_secure_salt_2026");
  const aesKey = await deriveAESKeyFromPassword(password, salt);

  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // AES-GCM requires a 12-byte IV
  const encryptedPrivateKeyBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    aesKey,
    exportedPrivateKey
  );

  // Combine IV and Encrypted Key so we can decrypt it later, then convert to Base64
  const combinedBuffer = new Uint8Array(iv.length + encryptedPrivateKeyBuffer.byteLength);
  combinedBuffer.set(iv, 0);
  combinedBuffer.set(new Uint8Array(encryptedPrivateKeyBuffer), iv.length);

  const encryptedPrivateKeyBase64 = arrayBufferToBase64(combinedBuffer.buffer);

  return {
    publicKey: publicKeyBase64,
    encryptedPrivateKey: encryptedPrivateKeyBase64,
  };
};

// Helper: Convert Base64 back to ArrayBuffer
export const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
};

// 1. Decrypt the Private Key using the user's password
export const unwrapPrivateKey = async (encryptedPrivateKeyBase64: string, password: string): Promise<CryptoKey> => {
  const encryptedBuffer = base64ToArrayBuffer(encryptedPrivateKeyBase64);
  const iv = encryptedBuffer.slice(0, 12);
  const data = encryptedBuffer.slice(12);

  // Re-derive the AES key from the password to unlock it
  const salt = new TextEncoder().encode("fcs_secure_salt_2026");
  const aesKey = await deriveAESKeyFromPassword(password, salt); // Note: Make sure deriveAESKeyFromPassword is exported in your file!

  const decryptedPKCS8 = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    aesKey,
    data
  );

  return await window.crypto.subtle.importKey(
    "pkcs8",
    decryptedPKCS8,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"]
  );
};

// 2. MEMBER B: Encrypt a message for a specific recipient
export const encryptMessage = async (plaintext: string, recipientPublicKeyBase64: string) => {
  // Generate random AES key for this specific message
  const aesKey = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  // Encrypt the plaintext with the AES key
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encodedPlaintext = new TextEncoder().encode(plaintext);
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    aesKey,
    encodedPlaintext
  );

  const combinedCiphertext = new Uint8Array(iv.length + ciphertext.byteLength);
  combinedCiphertext.set(iv, 0);
  combinedCiphertext.set(new Uint8Array(ciphertext), iv.length);

  // Encrypt the AES key with the Recipient's RSA Public Key
  const recipientPublicKeyBuffer = base64ToArrayBuffer(recipientPublicKeyBase64);
  const recipientPublicKey = await window.crypto.subtle.importKey(
    "spki",
    recipientPublicKeyBuffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );

  const exportedAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
  const encryptedAesKey = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    recipientPublicKey,
    exportedAesKey
  );

  return {
    encryptedContent: arrayBufferToBase64(combinedCiphertext.buffer),
    encryptedKey: arrayBufferToBase64(encryptedAesKey)
  };
};

// 3. MEMBER B: Decrypt an incoming message
export const decryptMessage = async (encryptedContentBase64: string, encryptedKeyBase64: string, myPrivateKey: CryptoKey) => {
  // Decrypt the AES key using your RSA Private Key
  const encryptedKeyBuffer = base64ToArrayBuffer(encryptedKeyBase64);
  const rawAesKey = await window.crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    myPrivateKey,
    encryptedKeyBuffer
  );

  const aesKey = await window.crypto.subtle.importKey(
    "raw",
    rawAesKey,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  // Decrypt the message content with the AES key
  const combinedCiphertextBuffer = base64ToArrayBuffer(encryptedContentBase64);
  const iv = combinedCiphertextBuffer.slice(0, 12);
  const ciphertext = combinedCiphertextBuffer.slice(12);

  const decryptedContent = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    aesKey,
    ciphertext
  );

  return new TextDecoder().decode(decryptedContent);
};

// --- PHASE 4: PKI & DIGITAL SIGNATURES ---

// 1. Import the Private Key specifically for SIGNING (RSA-PSS)
export const unwrapSigningKey = async (encryptedPrivateKeyBase64: string, password: string): Promise<CryptoKey> => {
  const encryptedBuffer = base64ToArrayBuffer(encryptedPrivateKeyBase64);
  const iv = encryptedBuffer.slice(0, 12);
  const data = encryptedBuffer.slice(12);

  const salt = new TextEncoder().encode("fcs_secure_salt_2026");
  const aesKey = await deriveAESKeyFromPassword(password, salt);

  const decryptedPKCS8 = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    aesKey,
    data
  );

  // We import the exact same mathematical PKCS8 key, but tell the browser it is for RSA-PSS signing
  return await window.crypto.subtle.importKey(
    "pkcs8",
    decryptedPKCS8,
    { name: "RSA-PSS", hash: "SHA-256" },
    true,
    ["sign"]
  );
};

// 2. Generate a SHA-256 Hash of the File and Sign it
export const signFileDocument = async (file: File, signingKey: CryptoKey): Promise<string> => {
  // Read the PDF file into memory as raw bytes
  const arrayBuffer = await file.arrayBuffer();
  
  // The Web Crypto API's sign() function automatically hashes the data using 
  // the algorithm specified in our key (SHA-256) before applying the RSA-PSS signature.
  const signatureBuffer = await window.crypto.subtle.sign(
    {
      name: "RSA-PSS",
      saltLength: 32, // Standard cryptographic salt length for PSS
    },
    signingKey,
    arrayBuffer
  );

  return arrayBufferToBase64(signatureBuffer);
};