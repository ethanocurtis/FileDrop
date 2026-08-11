import { z } from "zod";
import { EXPIRATION_OPTIONS, type ExpirationValue } from "@/lib/utils/time";
import { MAX_DOWNLOAD_OPTIONS } from "@/types/drop";

const expirationValues = EXPIRATION_OPTIONS.map((o) => o.value) as [
  ExpirationValue,
  ...ExpirationValue[],
];

export const createDropSchema = z.object({
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(500),
        size: z.number().int().positive(),
        mimeType: z.string().max(255).optional().default("application/octet-stream"),
      }),
    )
    .min(1)
    .max(100),
  expiration: z.enum(expirationValues),
  password: z.string().min(1).max(200).optional(),
  maxDownloads: z
    .number()
    .int()
    .refine((n) => (MAX_DOWNLOAD_OPTIONS as readonly number[]).includes(n), {
      message: `maxDownloads must be one of: ${MAX_DOWNLOAD_OPTIONS.join(", ")}`,
    })
    .nullish(),
  burnAfterRead: z.boolean().optional().default(false),
});

export const unlockDropSchema = z.object({
  password: z.string().min(1).max(200),
});

export const deleteDropSchema = z.object({
  deleteToken: z.string().min(1).max(200),
});

// Generous sanity cap, not a real storage limit — the server never stores
// or streams these bytes, so there's no MAX_UPLOAD_SIZE_BYTES-style
// resource concern. This just keeps garbage/negative values out of the
// database row.
const MAX_P2P_FILE_SIZE_BYTES = 20 * 1024 * 1024 * 1024; // 20 GB

export const createP2pTransferSchema = z.object({
  fileName: z.string().min(1).max(500),
  fileSize: z.number().int().positive().max(MAX_P2P_FILE_SIZE_BYTES),
  mimeType: z.string().max(255).optional().default("application/octet-stream"),
  expiration: z.enum(expirationValues),
  password: z.string().min(1).max(200).optional(),
});

export const unlockP2pTransferSchema = z.object({
  password: z.string().min(1).max(200),
});
