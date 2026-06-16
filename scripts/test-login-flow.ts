import { TOTP, Secret } from "otpauth";
import "dotenv/config";

const BASE_URL = "http://localhost:3000";

async function runTest() {
  console.log("Starting login flow programmatic test...");

  // 1. Password step
  console.log("Sending POST /api/admin/auth/login...");
  const loginRes = await fetch(`${BASE_URL}/api/admin/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "test-admin@mail.udp.cl",
      password: "test-password-123",
    }),
  });

  if (!loginRes.ok) {
    throw new Error(`Login failed with status ${loginRes.status}: ${await loginRes.text()}`);
  }

  const loginData = await loginRes.json() as { status: string; mfa_token?: string };
  console.log("Login response:", loginData);

  if (loginData.status !== "mfa_required" || !loginData.mfa_token) {
    throw new Error("Expected mfa_required and mfa_token");
  }

  // 2. Generate TOTP code
  const totp = new TOTP({
    secret: Secret.fromBase32("JBSWY3DPEHPK3PXP"),
    digits: 6,
    period: 30,
    algorithm: "SHA1",
  });
  const code = totp.generate();
  console.log(`Generated TOTP code: ${code}`);

  // 3. Verify TOTP step
  console.log("Sending POST /api/admin/auth/verify-totp...");
  const verifyRes = await fetch(`${BASE_URL}/api/admin/auth/verify-totp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mfa_token: loginData.mfa_token,
      code,
    }),
  });

  if (!verifyRes.ok) {
    throw new Error(`TOTP verification failed with status ${verifyRes.status}: ${await verifyRes.text()}`);
  }

  const verifyData = await verifyRes.json();
  console.log("Verify response:", verifyData);

  // Extract set-cookie header
  const rawCookie = verifyRes.headers.get("set-cookie");
  if (!rawCookie) {
    throw new Error("No set-cookie header found in verify-totp response");
  }
  console.log("Cookie received successfully");

  // 4. Verify /me endpoint
  console.log("Sending GET /api/admin/auth/me...");
  const meRes = await fetch(`${BASE_URL}/api/admin/auth/me`, {
    headers: {
      Cookie: rawCookie,
    },
  });

  if (!meRes.ok) {
    throw new Error(`/api/admin/auth/me failed with status ${meRes.status}: ${await meRes.text()}`);
  }

  const meData = await meRes.json();
  console.log("Me endpoint response:", meData);

  if (meData.email !== "test-admin@mail.udp.cl" || meData.totp_enabled !== true) {
    throw new Error(`Unexpected /me data: ${JSON.stringify(meData)}`);
  }

  console.log("✅ All login flow checks passed successfully!");
}

runTest().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
