import "dotenv/config";
import {createScannerGateway} from "../src/server/scanner-gateway";
const server=createScannerGateway(process.env.SCANNER_GATEWAY_TOKEN||"");
server.listen(Number(process.env.PORT||8080),"0.0.0.0",()=>console.log(JSON.stringify({event:"scanner.gateway.ready"})));
for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>server.close(()=>process.exit(0)));
