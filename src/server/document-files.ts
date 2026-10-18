import { fileTypeFromBuffer } from "file-type";
import { createHash } from "node:crypto";
import { MAX_DOCUMENT_BYTES } from "../lib/documents";
import { AppError } from "../lib/errors";
export async function validateDocument(
  bytes: Buffer,
  filename: string,
  suppliedMime: string,
) {
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES)
    throw new AppError("TOO_LARGE", 413);
  if (!filename || filename.length > 180 || /[\x00-\x1f\x7f/\\]/.test(filename))
    throw new AppError("INVALID_FILE", 422);
  const extension = filename.split(".").pop()?.toLowerCase();
  let mime: string;
  if (extension === "txt" || extension === "csv") {
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new AppError("INVALID_FILE", 422);
    }
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(content))
      throw new AppError("INVALID_FILE", 422);
    mime = extension === "csv" ? "text/csv" : "text/plain";
  } else {
    let detected;
    try {
      detected = await fileTypeFromBuffer(bytes);
    } catch {
      throw new AppError("INVALID_FILE", 422);
    }
    const expected: Record<string, string> = {
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
    };
    if (
      !extension ||
      !expected[extension] ||
      detected?.mime !== expected[extension]
    )
      throw new AppError("INVALID_FILE", 422);
    mime = expected[extension];
    if (
      extension === "pdf" &&
      !bytes.subarray(-1024).includes(Buffer.from("%%EOF"))
    )
      throw new AppError("INVALID_FILE", 422);
  }
  if (
    suppliedMime &&
    suppliedMime !== "application/octet-stream" &&
    suppliedMime !== mime &&
    !(
      extension === "csv" &&
      ["application/vnd.ms-excel", "text/plain"].includes(suppliedMime)
    )
  )
    throw new AppError("INVALID_FILE", 422);
  return {
    filename,
    mime,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
export async function documentForm(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("multipart/form-data;"))
    throw new AppError("INVALID_REQUEST", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("INVALID_REQUEST");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.length;
    if (size > MAX_DOCUMENT_BYTES + 32768) {
      await reader.cancel();
      throw new AppError("TOO_LARGE", 413);
    }
    chunks.push(next.value);
  }
  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks), {
      headers: { "content-type": type },
    }).formData();
  } catch {
    throw new AppError("INVALID_REQUEST");
  }
  const file = form.get("file"),
    metadata = form.get("metadata");
  if (
    !(file instanceof File) ||
    typeof metadata !== "string" ||
    form.getAll("file").length !== 1 ||
    metadata.length > 8000
  )
    throw new AppError("INVALID_REQUEST");
  let input: unknown;
  try {
    input = JSON.parse(metadata);
  } catch {
    throw new AppError("INVALID_REQUEST");
  }
  return {
    bytes: Buffer.from(await file.arrayBuffer()),
    filename: file.name,
    mime: file.type,
    input,
  };
}
