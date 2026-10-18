import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { createConnection } from "node:net";
import type { Readable } from "node:stream";
import { once } from "node:events";
import { AppError } from "../lib/errors";
import { MAX_DOCUMENT_BYTES } from "../lib/documents";
export interface DocumentIO {
  scan(bytes: Buffer): Promise<void>;
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
export function documentsConfigured() {
  return Boolean(
    process.env.DOCUMENT_S3_BUCKET &&
      process.env.DOCUMENT_S3_REGION &&
      process.env.CLAMAV_HOST,
  );
}
// ClamAV INSTREAM must run on a trusted private network: the protocol has no authentication.
export async function scanClamAV(bytes: Buffer, host: string, port = 3310) {
  const socket = createConnection({ host, port });
  const deadline = setTimeout(
    () => socket.destroy(new Error("Scanner deadline")),
    15000,
  );
  try {
    await new Promise<void>((resolve, reject) => {
      let response = Buffer.alloc(0);
      socket.on("error", () => reject(new AppError("SCAN_UNAVAILABLE", 503)));
      socket.on("close", () => reject(new AppError("SCAN_UNAVAILABLE", 503)));
      socket.on("data", (chunk) => {
        response = Buffer.concat([response, Buffer.from(chunk)]);
        if (response.length > 4096)
          return reject(new AppError("SCAN_UNAVAILABLE", 503));
        if (!response.includes(0)) return;
        const verdict = response
          .subarray(0, response.indexOf(0))
          .toString("utf8");
        if (verdict === "stream: OK") resolve();
        else if (verdict.startsWith("stream: ") && verdict.endsWith(" FOUND"))
          reject(new AppError("UNSAFE_FILE", 422));
        else reject(new AppError("SCAN_UNAVAILABLE", 503));
      });
      socket.once("connect", () => {
        void (async () => {
          const write = async (chunk: Buffer) => {
            if (!socket.write(chunk)) await once(socket, "drain");
          };
          await write(Buffer.from("zINSTREAM\0"));
          for (let i = 0; i < bytes.length; i += 65536) {
            const chunk = bytes.subarray(i, i + 65536),
              size = Buffer.alloc(4);
            size.writeUInt32BE(chunk.length);
            await write(size);
            await write(chunk);
          }
          await write(Buffer.alloc(4));
        })().catch(() => reject(new AppError("SCAN_UNAVAILABLE", 503)));
      });
    });
  } finally {
    clearTimeout(deadline);
    socket.destroy();
  }
}
let sharedClient: S3Client | undefined;
export function documentIO(): DocumentIO {
  if (!documentsConfigured())
    throw new AppError("DOCUMENTS_NOT_CONFIGURED", 503);
  const bucket = process.env.DOCUMENT_S3_BUCKET!;
  const client = (sharedClient ??= new S3Client({
    region: process.env.DOCUMENT_S3_REGION!,
    endpoint: process.env.DOCUMENT_S3_ENDPOINT || undefined,
    forcePathStyle: process.env.DOCUMENT_S3_PATH_STYLE === "true",
    maxAttempts: 1,
    // Standard AWS credential chain: environment, workload identity, or instance role.
  }));
  return {
    scan: (bytes) =>
      scanClamAV(
        bytes,
        process.env.CLAMAV_HOST!,
        Number(process.env.CLAMAV_PORT || 3310),
      ),
    async put(key, bytes) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: "application/octet-stream",
        }),
        { abortSignal: AbortSignal.timeout(20000) },
      );
    },
    async get(key) {
      const response = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(20000) },
      );
      if (
        !response.Body ||
        !response.ContentLength ||
        response.ContentLength > MAX_DOCUMENT_BYTES
      )
        throw new AppError("DOCUMENT_UNAVAILABLE", 503);
      const stream = response.Body as Readable;
      const deadline = setTimeout(
        () => stream.destroy(new Error("Storage read deadline")),
        20000,
      );
      try {
        const chunks: Buffer[] = [];
        let length = 0;
        for await (const chunk of stream) {
          length += chunk.length;
          if (length > MAX_DOCUMENT_BYTES)
            throw new AppError("DOCUMENT_UNAVAILABLE", 503);
          chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
      } finally {
        clearTimeout(deadline);
        stream.destroy();
      }
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(20000),
      });
    },
  };
}
