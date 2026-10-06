interface OTPData {
  otp: string;
  expiresAt: number;
}

// Global in-memory map to store active OTPs across API requests
const store = new Map<string, OTPData>();

/**
 * Saves a generated OTP for a given identifier (email or phone).
 * The OTP will expire in 5 minutes.
 * @param identifier Email or phone number
 * @param otp 6-digit verification code
 */
export function saveOTP(identifier: string, otp: string): void {
  const cleanId = identifier.toLowerCase().trim();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  store.set(cleanId, { otp, expiresAt });
}

/**
 * Verifies a submitted OTP for a given identifier.
 * If the OTP is correct and not expired, returns true and removes the OTP from the store.
 * @param identifier Email or phone number
 * @param otp Submitted OTP code
 * @returns boolean indicating if the code was valid
 */
export function verifyOTP(identifier: string, otp: string): boolean {
  const cleanId = identifier.toLowerCase().trim();
  const data = store.get(cleanId);
  
  if (!data) {
    return false;
  }
  
  // Check if expired
  if (Date.now() > data.expiresAt) {
    store.delete(cleanId);
    return false;
  }
  
  // Verify code
  if (data.otp === otp.trim()) {
    store.delete(cleanId);
    return true;
  }
  
  return false;
}
