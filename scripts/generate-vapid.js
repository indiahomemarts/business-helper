// Run once with: npm run generate-vapid
// Copy the printed keys into your .env.local (for local dev) and into your
// Vercel project's Environment Variables (for production).
const webpush = require("web-push");

const keys = webpush.generateVAPIDKeys();

console.log("\nAdd these to your environment variables:\n");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log("\nKeep VAPID_PRIVATE_KEY secret. The public key is safe to expose to the browser.\n");
