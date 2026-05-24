export function jsonReplacer(_key: string, value: unknown) {
  if (typeof value === "bigint") {
    return value.toString();
  }

  return value;
}

export function toBigIntId(value: string | number | bigint) {
  if (typeof value === "bigint") {
    return value;
  }

  const normalized = String(value);
  if (!/^\d+$/.test(normalized)) {
    throw new Error("Invalid id");
  }

  return BigInt(normalized);
}

export function toNumber(value: unknown) {
  if (value === null || value === undefined) {
    return 0;
  }

  return Number(value);
}
