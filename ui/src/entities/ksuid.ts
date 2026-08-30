const KSUID_EPOCH = 1_400_000_000;
const ENCODED_LENGTH = 27;
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Generates a standard 27-character KSUID using the browser's cryptographic RNG. */
export function generateKsuid(
  now: Date = new Date(),
  randomValues: (bytes: Uint8Array<ArrayBuffer>) => void = (bytes) => {
    crypto.getRandomValues(bytes);
  },
): string {
  const bytes = new Uint8Array(new ArrayBuffer(20));
  const timestamp = Math.floor(now.getTime() / 1000) - KSUID_EPOCH;
  if (timestamp < 0 || timestamp > 0xffffffff) throw new Error("Date is outside the KSUID timestamp range");
  new DataView(bytes.buffer).setUint32(0, timestamp);
  randomValues(bytes.subarray(4));
  return encodeBase62(bytes);
}

function encodeBase62(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  let encoded = "";
  do {
    encoded = BASE62[Number(value % 62n)] + encoded;
    value /= 62n;
  } while (value > 0n);
  return encoded.padStart(ENCODED_LENGTH, "0");
}
