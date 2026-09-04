import bcrypt from "bcryptjs";

/**
 * bcrypt at cost 12. The specification asks for Argon2id or bcrypt; bcryptjs
 * is chosen here because it is pure JavaScript and needs no native build
 * toolchain, which keeps first-run setup painless. Moving to @node-rs/argon2
 * later only touches this file — store the algorithm prefix and rehash on
 * next successful login.
 */
const COST = 12;

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, COST);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);

/**
 * The floor, in one place so the form, its hint and the server cannot drift
 * apart. Eight is the NIST 800-63B minimum for a user-chosen secret; this was
 * 12 and was lowered deliberately.
 */
export const PASSWORD_MIN_LENGTH = 8;

/** Minimum viable password policy. Deliberately length-first, not symbol-soup. */
export function validatePassword(pw: string): string[] {
  const errors: string[] = [];
  if (pw.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (pw.length > 200) errors.push("Password must be under 200 characters.");
  if (/^(.)\1+$/.test(pw)) errors.push("Password cannot be a single repeated character.");
  /*
   * The blocklist carries more weight at eight characters than at twelve: the
   * short guesses an attacker actually tries were unreachable under the old
   * floor. Matching is substring, so "password" also rejects "password1".
   */
  const common = [
    "password", "12345678", "qwerty", "abc12345", "iloveyou",
    "admin123", "letmein", "welcome", "routeplan", "gotrip",
  ];
  if (common.some((c) => pw.toLowerCase().includes(c))) errors.push("Password is too easy to guess.");
  return errors;
}
