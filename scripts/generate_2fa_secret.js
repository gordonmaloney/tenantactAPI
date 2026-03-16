/**
 * scripts/generate_2fa_secret.js
 * 
 * Generates a fresh TOTP secret for use with FETCH_2FA_SECRET.
 */

import { generateSecret, generateURI } from "otplib";

const secret = generateSecret();
const user = "Gordon";
const service = "TenantActAPI";
const otpauth = generateURI({ issuer: service, label: user, secret });

console.log("🔐 New 2FA setup generated!");
console.log("\n1. Add this secret to your FETCH_2FA_SECRET environment variable:");
console.log(`   ${secret}`);

console.log("\n2. Scan this URL or manually enter the secret into your authenticator app (Google Authenticator, Authy, Microsoft Authenticator, etc.):");
console.log(`   ${otpauth}`);

console.log("\n3. Alternatively, use a QR code generator for the URL above.");
