import test from "node:test";
import assert from "node:assert/strict";
import { isPrivateIp } from "./url-security.mjs";

test("private IPv4 ranges are rejected", () => {
  for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.1.1"]) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  assert.equal(isPrivateIp("8.8.8.8"), false);
});

test("local IPv6 ranges are rejected", () => {
  for (const ip of ["::1", "fc00::1", "fd00::1", "fe80::1"]) assert.equal(isPrivateIp(ip), true, ip);
});

test("IPv4-mapped IPv6 loopback and private ranges are rejected", () => {
  for (const ip of ["::ffff:127.0.0.1", "::ffff:10.0.0.8", "::ffff:192.168.1.20", "::ffff:c0a8:0114"]) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  assert.equal(isPrivateIp("::ffff:8.8.8.8"), false);
});
