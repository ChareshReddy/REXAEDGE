/**
 * Password Policy & Validation Rules
 * 
 * Rules:
 * 1. Minimum 12 characters
 * 2. At least one letter (a-z or A-Z)
 * 3. At least one digit (0-9)
 */

export const PASSWORD_RULES = {
  minLength: 12,
  hasLetter: /[a-zA-Z]/,
  hasNumber: /[0-9]/
};

/**
 * Validates a password against system security rules.
 * @param {string} password - Raw password to test
 * @param {string} [initialPassword] - Optional previous/initial password to prevent re-use
 * @returns {{ isValid: boolean, errors: string[] }}
 */
export function validatePasswordPolicy(password, initialPassword = null) {
  const errors = [];

  if (!password || typeof password !== 'string') {
    return {
      isValid: false,
      errors: ['Password is required.']
    };
  }

  if (password.length < PASSWORD_RULES.minLength) {
    errors.push(`Password must be at least ${PASSWORD_RULES.minLength} characters long.`);
  }

  if (!PASSWORD_RULES.hasLetter.test(password)) {
    errors.push('Password must contain at least one letter.');
  }

  if (!PASSWORD_RULES.hasNumber.test(password)) {
    errors.push('Password must contain at least one digit.');
  }

  if (initialPassword && password === initialPassword) {
    errors.push('New password cannot be equal to the initial or current password.');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
