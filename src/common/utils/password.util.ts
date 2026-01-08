import * as bcrypt from 'bcrypt';

export const hashPassword = (raw: string) => bcrypt.hash(raw, 10);

export async function comparePassword(raw: string, hash: string) {
  if (!raw || !hash) return false;
  return bcrypt.compare(raw, hash);
}

export const hashToken = (raw: string) => bcrypt.hash(raw, 10);
export async function compareToken(raw: string, hash: string) {
  if (!raw || !hash) return false;
  return bcrypt.compare(raw, hash);
}
