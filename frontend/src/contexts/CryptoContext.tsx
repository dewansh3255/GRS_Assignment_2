import { createContext, useContext, useState, ReactNode } from 'react';
import { getMyKeys } from '../services/api';
import { unwrapPrivateKey, unwrapSigningKey } from '../utils/crypto';

interface UnlockedKeys {
  decryptionKey: CryptoKey; // RSA-OAEP — for E2EE chat decryption
  signingKey: CryptoKey;    // RSA-PSS  — for resume digital signing
}

interface CryptoContextType {
  decryptionKey: CryptoKey | null;
  signingKey: CryptoKey | null;
  isUnlocked: boolean;
  /**
   * Fetches the encrypted private key from the server, decrypts it with the
   * given password, and caches both the decryption key and signing key in
   * memory for the rest of the session.
   *
   * Returns the unlocked keys immediately so callers don't have to wait for
   * a re-render to use them.
   */
  unlockKey: (password: string) => Promise<UnlockedKeys>;
  clearKey: () => void;
}

const CryptoContext = createContext<CryptoContextType | null>(null);

export const CryptoProvider = ({ children }: { children: ReactNode }) => {
  const [decryptionKey, setDecryptionKey] = useState<CryptoKey | null>(null);
  const [signingKey, setSigningKey] = useState<CryptoKey | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);

  const unlockKey = async (password: string): Promise<UnlockedKeys> => {
    const myKeys = await getMyKeys();
    const username = localStorage.getItem('username') || '';

    // Derive both key types in parallel — same encrypted blob, different Web Crypto usages
    const [decKey, signKey] = await Promise.all([
      unwrapPrivateKey(myKeys.encrypted_private_key, password, username),
      unwrapSigningKey(myKeys.encrypted_private_key, password, username),
    ]);

    setDecryptionKey(decKey);
    setSigningKey(signKey);
    setIsUnlocked(true);

    return { decryptionKey: decKey, signingKey: signKey };
  };

  const clearKey = () => {
    setDecryptionKey(null);
    setSigningKey(null);
    setIsUnlocked(false);
  };

  return (
    <CryptoContext.Provider value={{ decryptionKey, signingKey, isUnlocked, unlockKey, clearKey }}>
      {children}
    </CryptoContext.Provider>
  );
};

export const useCrypto = () => {
  const ctx = useContext(CryptoContext);
  if (!ctx) throw new Error('useCrypto must be used inside CryptoProvider');
  return ctx;
};
