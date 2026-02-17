import { encrypt, decrypt } from "./crypto.js";

// Set a test ENCRYPTION_KEY if not present
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = "a".repeat(64); // 64 hex chars = 32 bytes
}

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${name} — ${err}`);
    failed++;
  }
}

console.log("Running encryption smoke tests...\n");

// Test 1: Basic round-trip
test("round-trip with typical WhatsApp token", () => {
  const original = "my-whatsapp-access-token-12345";
  const result = decrypt(encrypt(original));
  if (result !== original) throw new Error(`Expected "${original}", got "${result}"`);
});

// Test 2: Empty string
test("round-trip with empty string", () => {
  const original = "";
  const result = decrypt(encrypt(original));
  if (result !== original) throw new Error(`Expected empty string, got "${result}"`);
});

// Test 3: Unicode characters (Brazilian Portuguese accents)
test("round-trip with unicode characters", () => {
  const original = "Clínica São Paulo — configuração #1 ação";
  const result = decrypt(encrypt(original));
  if (result !== original) throw new Error(`Expected "${original}", got "${result}"`);
});

// Test 4: Long string (simulate a long OAuth token)
test("round-trip with long token (512 chars)", () => {
  const original = "a".repeat(512);
  const result = decrypt(encrypt(original));
  if (result !== original) throw new Error(`Length mismatch: expected 512, got ${result.length}`);
});

// Test 5: Each encryption produces different ciphertext (random IV)
test("unique ciphertext per encryption (random IV)", () => {
  const original = "same-input";
  const enc1 = encrypt(original);
  const enc2 = encrypt(original);
  if (enc1 === enc2) throw new Error("Identical ciphertexts for same input — IV is not random!");
  // Both should decrypt correctly
  if (decrypt(enc1) !== original || decrypt(enc2) !== original) {
    throw new Error("Decryption failed for one of the unique ciphertexts");
  }
});

// Test 6: JSON payload (typical token storage pattern)
test("round-trip with JSON payload", () => {
  const original = JSON.stringify({ access_token: "tok_123", refresh_token: "ref_456", expires_at: 1700000000 });
  const result = decrypt(encrypt(original));
  if (result !== original) throw new Error(`JSON payload mismatch`);
});

// Test 7: Missing ENCRYPTION_KEY throws clear error
test("throws clear error when ENCRYPTION_KEY is missing", () => {
  const saved = process.env.ENCRYPTION_KEY;
  delete process.env.ENCRYPTION_KEY;
  try {
    encrypt("test");
    throw new Error("Expected error but none was thrown");
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes("ENCRYPTION_KEY")) {
      throw new Error(`Wrong error: ${err}`);
    }
  } finally {
    process.env.ENCRYPTION_KEY = saved;
  }
});

// Test 8: Wrong-length key throws clear error
test("throws clear error when ENCRYPTION_KEY is wrong length", () => {
  const saved = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = "tooshort";
  try {
    encrypt("test");
    throw new Error("Expected error but none was thrown");
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes("ENCRYPTION_KEY")) {
      throw new Error(`Wrong error: ${err}`);
    }
  } finally {
    process.env.ENCRYPTION_KEY = saved;
  }
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error("\nSome tests failed!");
  process.exit(1);
} else {
  console.log("\nAll encryption tests passed!");
}
