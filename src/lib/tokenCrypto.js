import crypto from 'crypto';

// AES-256-GCM. Server-only (Node's crypto module) - this file must never be
// imported by client components, only by API routes running on the server.
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96-bit, the standard/recommended IV size for GCM
const TAG_LENGTH = 16;  // GCM auth tag is always 16 bytes

function getKey() {
    const keyB64 = process.env.TWITCH_TOKEN_ENCRYPTION_KEY;
    if (!keyB64) throw new Error('TWITCH_TOKEN_ENCRYPTION_KEY is not set');
    const key = Buffer.from(keyB64, 'base64');
    if (key.length !== 32) throw new Error('TWITCH_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256) - generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
    return key;
}

// Packs iv + authTag + ciphertext into one base64 string so a single
// Firestore string field round-trips cleanly, instead of storing three
// separate fields.
export function encryptToken(plaintext) {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decryptToken(packedBase64) {
    const key = getKey();
    const packed = Buffer.from(packedBase64, 'base64');
    const iv = packed.subarray(0, IV_LENGTH);
    const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = packed.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
