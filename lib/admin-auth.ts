import bcrypt from "bcryptjs";
import { TOTP, Secret } from "otpauth";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function verifyTotp(base32Secret: string, code: string): boolean {
  const totp = new TOTP({
    secret: Secret.fromBase32(base32Secret),
    digits: 6,
    period: 30,
    algorithm: "SHA1",
  });
  return totp.validate({ token: code.replace(/\s/g, ""), window: 1 }) !== null;
}

export function generateTotpUri(email: string, base32Secret: string): string {
  return new TOTP({
    issuer: "OptiWallet",
    label: email,
    secret: Secret.fromBase32(base32Secret),
    digits: 6,
    period: 30,
    algorithm: "SHA1",
  }).toString();
}
