import { BadRequestException } from '@nestjs/common';
import { buildQuery, hmacSHA512, sortObject } from './vnpay.util';

export function pickVnpParams(all: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const k of Object.keys(all || {})) {
    if (k.startsWith('vnp_')) out[k] = all[k];
  }
  return out;
}

export function verifyVnpaySecureHash(params: Record<string, any>, hashSecret: string) {
  const secureHash = params?.vnp_SecureHash;
  if (!secureHash || typeof secureHash !== 'string') {
    throw new BadRequestException('Missing vnp_SecureHash');
  }

  const cloned: Record<string, any> = { ...params };
  delete cloned.vnp_SecureHash;
  delete cloned.vnp_SecureHashType;

  const sorted = sortObject(cloned);
  const signData = buildQuery(sorted);
  const expected = hmacSHA512(hashSecret, signData);

  return {
    ok: expected.toLowerCase() === secureHash.toLowerCase(),
    expected,
    provided: secureHash,
    sortedParams: sorted,
  };
}
