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
