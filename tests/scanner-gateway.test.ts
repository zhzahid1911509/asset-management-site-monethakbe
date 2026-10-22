import {it,expect,vi,afterEach} from "vitest";
import {createHash} from "node:crypto";
import {createScannerGateway} from "../src/server/scanner-gateway";
import {scanDocument,scanClamAV} from "../src/server/malware-scanner";
import {AppError} from "../src/lib/errors";
import {documentIO,documentsConfigured} from "../src/server/document-storage";
const token="synthetic-test-token-not-a-secret-1234567890";
const bytes=Buffer.from("Harmless synthetic test document");
const sha256=createHash("sha256").update(bytes).digest("hex");
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
function env(){vi.stubEnv("DOCUMENT_SCAN_URL","https://scanner.example.test/scan");vi.stubEnv("DOCUMENT_SCAN_TOKEN",token);}
it("passes file bytes only to the authenticated scanner and requires their digest",async()=>{
 env();const request=vi.fn(async(url,options)=>{expect(String(url)).toBe("https://scanner.example.test/scan");expect(options.redirect).toBe("error");expect(options.headers.Authorization).toBe(`Bearer ${token}`);expect(Buffer.from(options.body)).toEqual(bytes);return Response.json({verdict:"clean",sha256});});vi.stubGlobal("fetch",request);await scanDocument(bytes);expect(request).toHaveBeenCalledTimes(1);
});
it.each([
 [{verdict:"infected",sha256},"UNSAFE_FILE"],
 [{verdict:"clean",sha256:"wrong"},"SCAN_UNAVAILABLE"],
 [{verdict:"unknown",sha256},"SCAN_UNAVAILABLE"],
 [{clean:true},"SCAN_UNAVAILABLE"],
])("fails closed for unsafe or invalid verdict %j",async(result,code)=>{env();vi.stubGlobal("fetch",vi.fn(async()=>Response.json(result)));await expect(scanDocument(bytes)).rejects.toMatchObject({code});});
it("reports scanner authentication failures safely",async()=>{env();vi.stubGlobal("fetch",vi.fn(async()=>new Response("private upstream error",{status:401})));await expect(scanDocument(bytes)).rejects.toMatchObject({code:"SCAN_UNAVAILABLE",diagnostic:"SCANNER_AUTH_FAILED"});});
it("rejects oversized replies and unavailable endpoints",async()=>{env();vi.stubGlobal("fetch",vi.fn(async()=>new Response("x".repeat(4097))));await expect(scanDocument(bytes)).rejects.toMatchObject({diagnostic:"SCANNER_RESPONSE_TOO_LARGE"});vi.stubGlobal("fetch",vi.fn(async()=>{throw Error("private network data");}));await expect(scanDocument(bytes)).rejects.toMatchObject({diagnostic:"HTTPS_CONNECTION_OR_RESPONSE_FAILED"});});
it("rejects insecure production URLs and malformed TCP settings before connecting",async()=>{env();vi.stubEnv("NODE_ENV","production");vi.stubEnv("DOCUMENT_SCAN_URL","http://scanner.example.test/scan");await expect(scanDocument(bytes)).rejects.toMatchObject({diagnostic:"HTTPS_REQUIRED"});await expect(scanClamAV(bytes,"https://scanner.example.test",3310)).rejects.toMatchObject({diagnostic:"INVALID_TCP_CONFIG"});await expect(scanClamAV(bytes,"localhost",NaN)).rejects.toMatchObject({diagnostic:"INVALID_TCP_CONFIG"});});
it("keeps storage access independent from scanner configuration and supports AWS region aliases",()=>{vi.stubEnv("DOCUMENT_SCAN_URL","");vi.stubEnv("CLAMAV_HOST","");vi.stubEnv("DOCUMENT_S3_BUCKET","synthetic");vi.stubEnv("DOCUMENT_S3_REGION","");vi.stubEnv("AWS_REGION","us-east-1");expect(documentsConfigured()).toBe(false);expect(()=>documentIO()).not.toThrow();});
it("gateway authenticates, bounds requests and returns digest-bound clean/infected verdicts",async()=>{
 let calls=0;let infected=false;const server=createScannerGateway(token,async b=>{calls++;expect(b).toEqual(bytes);if(infected)throw new AppError("UNSAFE_FILE",422);});
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const addr=server.address();if(!addr||typeof addr==="string")throw Error("address");const url=`http://127.0.0.1:${addr.port}/scan`;
 try{
 const denied=await fetch(url,{method:"POST",body:bytes});expect(denied.status).toBe(401);expect(calls).toBe(0);
 const request=()=>fetch(url,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/octet-stream"},body:bytes});
 expect(await (await request()).json()).toEqual({verdict:"clean",sha256});infected=true;expect(await (await request()).json()).toEqual({verdict:"infected",sha256});
 const badType=await fetch(url,{method:"POST",headers:{authorization:`Bearer ${token}`},body:"text"});expect(badType.status).toBe(415);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
it("gateway never treats a failed scanner as clean",async()=>{
 const server=createScannerGateway(token,async()=>{throw Error("unavailable");});await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const addr=server.address();if(!addr||typeof addr==="string")throw Error("address");
 try{const result=await fetch(`http://127.0.0.1:${addr.port}/scan`,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/octet-stream"},body:bytes});expect(result.status).toBe(503);expect(await result.json()).toEqual({error:"SCAN_UNAVAILABLE"});}finally{await new Promise<void>(r=>server.close(()=>r()));}
});
