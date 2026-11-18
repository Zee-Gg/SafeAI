/*
  The Luhn checksum used by every payment card number. The last digit is a check digit, so a
  random 16-digit number passes only 1 time in 10. That filters out most order numbers and typos.
*/

// Only the digits 0–9, at least one.
const DIGITS_ONLY = /^\d+$/;

/** True if the digit string passes the Luhn checksum (false for empty or non-digit input). */
export function passesLuhn(digits: string): boolean {
  if (!DIGITS_ONLY.test(digits)) return false;
  let sum = 0;
  let double = false;
  // Walk from the right; every second digit is doubled (and 9 subtracted if it goes over 9).
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = digits.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}
