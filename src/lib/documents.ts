import { z } from "zod";
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const FAMILY_DOCUMENT_QUOTA = 1024 * 1024 * 1024;
export const documentMetadata = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).default(""),
  category: z.string().trim().max(80).default(""),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
});
export const documentUpload = documentMetadata.extend({
  version: z.number().int().positive(),
  documentId: z.uuid().optional(),
});
export const documentEdit = documentMetadata.extend({
  version: z.number().int().positive(),
  archived: z.boolean(),
});
