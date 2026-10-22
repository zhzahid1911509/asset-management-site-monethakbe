import "dotenv/config";
import {scanDocument,ScannerError} from "../src/server/malware-scanner";
import {documentScanMode} from "../src/server/document-storage";
const mode = documentScanMode();
const hints:Record<string,string>={
 SCANNER_NOT_CONFIGURED:"Set DOCUMENT_SCAN_URL + DOCUMENT_SCAN_TOKEN for HTTPS, or CLAMAV_HOST for private TCP.",
 ECONNREFUSED:"ClamAV is not listening at the configured host/port. Start it and wait until its database is loaded.",
 ENOTFOUND:"The scanner hostname cannot be resolved from this machine.",
 EAI_AGAIN:"Scanner DNS lookup failed. Check network/DNS and retry.",
 SCANNER_AUTH_FAILED:"DOCUMENT_SCAN_TOKEN must match SCANNER_GATEWAY_TOKEN on the scanner service.",
 HTTPS_REQUIRED:"Use an HTTPS /scan URL in production, without credentials, query string or fragment.",
 INVALID_TCP_CONFIG:"CLAMAV_HOST must be a hostname/IP, not a URL. CLAMAV_PORT must be a number from 1 to 65535.",
 SCANNER_BACKEND_UNAVAILABLE:"The gateway responded, but ClamAV is unavailable or busy. Inspect the scanner service logs.",
};
console.log(JSON.stringify({storage:{bucket:!!process.env.DOCUMENT_S3_BUCKET,region:!!(process.env.DOCUMENT_S3_REGION||process.env.AWS_REGION)},scanner:process.env.DOCUMENT_SCAN_URL?"https":"tcp"}));
if(mode === "required" && process.env.VERCEL && !process.env.DOCUMENT_SCAN_URL)console.log("On Vercel, a local Docker/WSL scanner on your PC is not reachable. Configure a hosted HTTPS scanner or a reachable private TCP service.");
if (mode === "disabled") {
 console.log("SKIPPED: malware scanning is explicitly disabled. Files will be labelled Not malware-scanned. Storage connectivity was not tested.");
} else {
try{await scanDocument(Buffer.from("Mone Thakbe harmless scanner diagnostic\n"));console.log("PASS: scanner returned a clean result. Storage connectivity was not tested.");}
catch(e){const code=e instanceof ScannerError?e.diagnostic:"SCAN_FAILED";console.error(JSON.stringify({event:"scanner.diagnostic.failed",code,hint:hints[code]||"Check scanner availability, firewall/TLS and gateway logs. Run this command from the same network as the app."}));process.exitCode=1;}

}
