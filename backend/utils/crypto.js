import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 bytes recommended for AES-GCM
const AUTH_TAG_LENGTH = 16; // 16 bytes auth tag

/**
 * Validates and retrieves the 32-byte encryption key from the environment.
 * @returns {Buffer} 32-byte Buffer
 */
export function getEncryptionKey() {
  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey || !String(rawKey).trim()) {
    throw new Error('ENCRYPTION_KEY environment variable is missing.');
  }

  const cleanKey = String(rawKey).trim();
  let keyBuffer;

  // Support 64-character hex string (32 bytes) or raw 32-byte string
  if (/^[0-9a-fA-F]{64}$/.test(cleanKey)) {
    keyBuffer = Buffer.from(cleanKey, 'hex');
  } else if (Buffer.byteLength(cleanKey, 'utf8') === 32) {
    keyBuffer = Buffer.from(cleanKey, 'utf8');
  } else {
    throw new Error(
      `Invalid ENCRYPTION_KEY length: Expected 64-character hex string (32 bytes) or 32 raw bytes, got ${cleanKey.length} characters.`
    );
  }

  return keyBuffer;
}

/**
 * Validates the encryption key at server startup.
 * Refuses to start and halts process if key is missing or invalid.
 *
 * @param {boolean} [exitOnError=true]
 * @returns {boolean}
 */
export function validateEncryptionKey(exitOnError = true) {
  try {
    getEncryptionKey();
    return true;
  } catch (err) {
    console.error('====================================================================');
    console.error('FATAL STARTUP ERROR: Missing or Invalid ENCRYPTION_KEY');
    console.error('--------------------------------------------------------------------');
    console.error(err.message);
    console.error('The application requires ENCRYPTION_KEY (32-byte AES-256 key) to');
    console.error('safely encrypt and decrypt SAP server connection credentials.');
    console.error('Please configure ENCRYPTION_KEY in your .env file and restart.');
    console.error('====================================================================');

    if (exitOnError) {
      process.exit(1);
    }
    return false;
  }
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * @param {string} text - Plaintext password
 * @returns {string} iv:authTag:ciphertext format in hex
 */
export function encryptPassword(text) {
  if (text === null || text === undefined || text === '') {
    return null;
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(String(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string.
 *
 * @param {string} cipherPayload - iv:authTag:ciphertext in hex
 * @returns {string} Decrypted plaintext password
 */
export function decryptPassword(cipherPayload) {
  if (!cipherPayload || typeof cipherPayload !== 'string') {
    return null;
  }

  const parts = cipherPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted password payload: Expected iv:authTag:ciphertext');
  }

  const [ivHex, tagHex, dataHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(dataHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Masks a SAP username for non-admin user responses.
 * Example: 'SAP_OPERATOR_01' -> 'S*************1'
 *
 * @param {string|null} username
 * @returns {string|null}
 */
export function maskSapUsername(username) {
  if (!username) return null;
  const str = String(username).trim();
  if (str.length <= 2) {
    return str[0] + '*';
  }
  return str[0] + '*'.repeat(str.length - 2) + str[str.length - 1];
}
