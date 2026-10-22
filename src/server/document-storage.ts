import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import {scanDocument,scannerConfigured} from "./malware-scanner";
export {scanClamAV} from "./malware-scanner";
import type { Readable } from "node:stream";

import { AppError } from "../lib/errors";
import { MAX_DOCUMENT_BYTES } from "../lib/documents";
export interface DocumentIO {
  scan(bytes: Buffer): Promise<void>;
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
export function documentScanMode(): "required" | "disabled" {
  const mode = process.env.DOCUMENT_SCAN_MODE ?? "required";
  if (mode !== "required" && mode !== "disabled")
    throw new AppError("DOCUMENTS_NOT_CONFIGURED", 503);
  return mode;
}
export function documentsConfigured() {
  return Boolean(
    process.env.DOCUMENT_S3_BUCKET &&
      (process.env.DOCUMENT_S3_REGION || process.env.AWS_REGION) &&
      (documentScanMode() === "disabled" || scannerConfigured()),
  );
}
let sharedClient: S3Client | undefined;
export function documentIO(): DocumentIO {
  if (!process.env.DOCUMENT_S3_BUCKET || !(process.env.DOCUMENT_S3_REGION || process.env.AWS_REGION))
    throw new AppError("DOCUMENTS_NOT_CONFIGURED", 503);
  const bucket = process.env.DOCUMENT_S3_BUCKET!;
  const client = (sharedClient ??= new S3Client({
    region: process.env.DOCUMENT_S3_REGION || process.env.AWS_REGION,
    endpoint: process.env.DOCUMENT_S3_ENDPOINT || process.env.AWS_ENDPOINT_URL_S3 || undefined,
    forcePathStyle: process.env.DOCUMENT_S3_PATH_STYLE === "true",
    maxAttempts: 1,
    // Standard AWS credential chain: environment, workload identity, or instance role.
  }));
  return {
    scan: scanDocument,
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
