import dns from "node:dns/promises";
import net from "node:net";

function mappedIpv4FromIpv6(address) {
  const normalized = String(address).toLowerCase();
  if (!net.isIPv6(normalized)) return null;
  const marker = normalized.lastIndexOf("::ffff:");
  if (marker < 0) return null;
  const tail = normalized.slice(marker + 7);
  if (net.isIPv4(tail)) return tail;
  const groups = normalized.split(":");
  if (groups.length < 2) return null;
  const last = groups[groups.length - 2];
  const last2 = groups[groups.length - 1];
  if (!/^[0-9a-f]{1,4}$/.test(last) || !/^[0-9a-f]{1,4}$/.test(last2)) return null;
  const value = BigInt(`0x${last}${last2}`);
  return `${Number((value >> 24n) & 255n)}.${Number((value >> 16n) & 255n)}.${Number((value >> 8n) & 255n)}.${Number(value & 255n)}`;
}

export function isPrivateIp(address) {
  const normalized = String(address).toLowerCase();
  const mapped = mappedIpv4FromIpv6(normalized);
  if (mapped) return isPrivateIp(mapped);
  if (net.isIPv4(normalized)) {
    const [a,b] = normalized.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (net.isIPv6(normalized)) {
    return normalized === "::" || normalized === "::1" ||
      normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
  }
  return true;
}

export async function assertPublicHostname(hostname) {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("Private or local network addresses are not allowed.");
    return;
  }
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isPrivateIp(record.address))) {
    throw new Error("The target host resolves to a private or local network address.");
  }
}
