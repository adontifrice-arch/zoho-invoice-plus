import assert from "node:assert/strict";
import { isAllowedGoogleAccount } from "../shared/access.js";
import { openSession, signSession } from "./auth.js";

assert.equal(isAllowedGoogleAccount("Adontifrice@gmail.com"), true);
assert.equal(isAllowedGoogleAccount("tliliyassmine@gmail.com"), true);
assert.equal(isAllowedGoogleAccount("autre@gmail.com"), false);
assert.equal(isAllowedGoogleAccount("adontifrice@gmail.com.evil"), false);

const secret = "test-secret";
const now = 1_700_000_000;
const token = signSession({ email: "adontifrice@gmail.com", exp: now + 60 }, secret);
assert.equal(openSession(token, secret, now), "adontifrice@gmail.com");
assert.equal(openSession(token, secret, now + 61), null);
assert.equal(openSession(`${token}x`, secret, now), null);
assert.equal(openSession(signSession({ email: "autre@gmail.com", exp: now + 60 }, secret), secret, now), null);

console.log("auth ok");
