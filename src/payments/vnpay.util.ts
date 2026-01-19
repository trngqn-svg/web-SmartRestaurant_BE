import crypto from 'crypto';

export function sortObject(obj: Record<string, any>) {
  return Object.keys(obj)
    .sort()
    .reduce((acc: any, key) => {
      acc[key] = obj[key];
      return acc;
    }, {});
}

export function buildQuery(params: Record<string, any>) {
  return Object.keys(params)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

export function hmacSHA512(secret: string, data: string) {
  return crypto.createHmac('sha512', secret).update(data, 'utf8').digest('hex');
}

export function formatVnpDate(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

export function toObjectId(id: string, name: string) {
  try {
    const { Types } = require('mongoose');
    return new Types.ObjectId(id);
  } catch {
    throw new Error(`Invalid ${name}`);
  }
}
