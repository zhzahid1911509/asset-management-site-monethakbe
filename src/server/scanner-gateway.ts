import {createServer, type ServerResponse} from "node:http";
import {createHash,timingSafeEqual} from "node:crypto";
import {scanClamAV} from "./malware-scanner";
import {AppError} from "../lib/errors";
const MAX_BYTES=10*1024*1024;
export function createScannerGateway(token:string, scan:(bytes:Buffer)=>Promise<void> = bytes=>scanClamAV(bytes,process.env.CLAMAV_HOST || "clamav",Number(process.env.CLAMAV_PORT||3310))) {
  if(token.length<32)throw new Error("SCANNER_GATEWAY_TOKEN must contain at least 32 characters.");
  const expected=createHash("sha256").update(`Bearer ${token}`).digest();let active=0;
  const send=(res:ServerResponse,status:number,data:unknown)=>{if(!res.destroyed&&!res.writableEnded){res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store","Connection":"close"});res.end(JSON.stringify(data));}};
  const server=createServer(async(req,res)=>{
    const supplied=createHash("sha256").update(req.headers.authorization||"").digest();
    if(!timingSafeEqual(expected,supplied))return send(res,401,{error:"UNAUTHORIZED"});
    const health=req.method==="GET"&&req.url==="/health";
    if(!health && !(req.method==="POST"&&req.url==="/scan"))return send(res,404,{error:"NOT_FOUND"});
    if(active>=2)return send(res,503,{error:"BUSY"});
    if(!health && req.headers["content-type"]!=="application/octet-stream")return send(res,415,{error:"CONTENT_TYPE"});
    if(Number(req.headers["content-length"]||0)>MAX_BYTES)return send(res,413,{error:"TOO_LARGE"});
    active++;
    const deadline=setTimeout(()=>req.destroy(),40000);
    try {
      const chunks:Buffer[]=[];let length=0;
      if(!health)for await(const chunk of req){length+=chunk.length;if(length>MAX_BYTES){send(res,413,{error:"TOO_LARGE"});return;}chunks.push(Buffer.from(chunk));}
      const bytes=health?Buffer.from("Mone Thakbe scanner health check"):Buffer.concat(chunks);
      if(!bytes.length)return send(res,400,{error:"EMPTY_FILE"});
      let verdict="clean";
      try{await scan(bytes);}catch(e){if(e instanceof AppError&&e.code==="UNSAFE_FILE")verdict="infected";else throw e;}
      if(health && verdict!=="clean")return send(res,503,{error:"NOT_READY"});
      send(res,200,{verdict,sha256:createHash("sha256").update(bytes).digest("hex")});
    }catch{send(res,503,{error:"SCAN_UNAVAILABLE"});}
    finally{clearTimeout(deadline);active--;}
  });
  server.requestTimeout=40000;server.headersTimeout=10000;server.maxRequestsPerSocket=1;
  return server;
}
