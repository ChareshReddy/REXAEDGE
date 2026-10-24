/**
 * Password Policy & Validation for Client
 * 
 * Rules:
 * 1. At least 10 characters
 * 2. At least one uppercase letter (A-Z)
 * 3. At least one lowercase letter (a-z)
 * 4. At least one number (0-9)
 */

export const PASSWORD_RULES = [
  {
    id: 'length',
    label: 'At least 10 characters',
    test: (pwd) => typeof pwd === 'string' && pwd.length >= 10
  },
  {
    id: 'upper',
    label: 'At least one uppercase letter (A-Z)',
    test: (pwd) => /[A-Z]/.test(pwd || '')
  },
  {
    id: 'lower',
    label: 'At least one lowercase letter (a-z)',
    test: (pwd) => /[a-z]/.test(pwd || '')
  },
  {
    id: 'number',
    label: 'At least one number (0-9)',
    test: (pwd) => /[0-9]/.test(pwd || '')
  }
];

export function checkPasswordRules(password) {
  const results = PASSWORD_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    passed: rule.test(password)
  }));

  const allPassed = results.every((r) => r.passed);
  return {
    results,
    allPassed
  };
}
