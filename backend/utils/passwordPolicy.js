/**
 * Password Policy & Validation Rules
 * 
 * Rules:
 * 1. At least 10 characters
 * 2. At least one uppercase letter (A-Z)
 * 3. At least one lowercase letter (a-z)
 * 4. At least one number (0-9)
 */

export const PASSWORD_RULES = {
  minLength: 10,
  hasUpperCase: /[A-Z]/,
  hasLowerCase: /[a-z]/,
  hasNumber: /[0-9]/
};

/**
 * Validates a password against system security rules.
 * @param {string} password - Raw password to test
 * @returns {{ isValid: boolean, errors: string[] }}
 */
export function validatePasswordPolicy(password) {
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

  if (!PASSWORD_RULES.hasUpperCase.test(password)) {
    errors.push('Password must contain at least one uppercase letter (A-Z).');
  }

  if (!PASSWORD_RULES.hasLowerCase.test(password)) {
    errors.push('Password must contain at least one lowercase letter (a-z).');
  }

  if (!PASSWORD_RULES.hasNumber.test(password)) {
    errors.push('Password must contain at least one number (0-9).');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
