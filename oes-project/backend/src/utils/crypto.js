const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const KEY = Buffer.from(
  (process.env.ENCRYPTION_KEY || 'default_key_32_chars_change_me!!').padEnd(32).slice(0, 32)
);

const encrypt = (text) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(text)), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

const decrypt = (encryptedText) => {
  try {
    const [ivHex, encHex] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString();
  } catch {
    return encryptedText; // Return as-is if decryption fails
  }
};

const generateToken = (length = 32) => crypto.randomBytes(length).toString('hex');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

module.exports = { encrypt, decrypt, generateToken, hashToken, generateOTP };
