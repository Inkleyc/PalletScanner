const qr = require("qrcode-terminal");

const expoUrl = process.argv[2] || "exp://192.168.1.150:8081";

qr.generate(expoUrl, { small: false });
console.log(`\nScan with Expo Go: ${expoUrl}`);
