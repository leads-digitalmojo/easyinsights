import crypto from 'crypto';

/**
 * hashEmail(email): trim -> lowercase -> SHA256 hex
 */
export function hashEmail(email: string): string {
  if (!email) return '';
  const cleanEmail = email.trim().toLowerCase();
  return crypto.createHash('sha256').update(cleanEmail).digest('hex');
}

/**
 * hashPhone(phone): remove non-numeric -> normalize to 12 digits with 91 -> SHA256 hex
 */
export function hashPhone(phone: string): string {
  if (!phone) return '';
  // Remove non-numeric characters
  let cleanPhone = phone.replace(/\D/g, '');
  // Normalize to 12 digits (prepend 91 if it's 10 digits)
  if (cleanPhone.length === 10) {
    cleanPhone = '91' + cleanPhone;
  }
  return crypto.createHash('sha256').update(cleanPhone).digest('hex');
}
