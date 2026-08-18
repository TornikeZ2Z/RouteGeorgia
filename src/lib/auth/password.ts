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

/** Minimum viable password policy. Deliberately length-first, not symbol-soup. */
export function validatePassword(pw: string): string[] {
  const errors: string[] = [];
  if (pw.length < 12) errors.push("Password must be at least 12 characters.");
  if (pw.length > 200) errors.push("Password must be under 200 characters.");
  if (/^(.)\1+$/.test(pw)) errors.push("Password cannot be a single repeated character.");
  const common = ["password", "123456789012", "qwertyuiop", "gotrip123456"];
  if (common.some((c) => pw.toLowerCase().includes(c))) errors.push("Password is too easy to guess.");
  return errors;
}
