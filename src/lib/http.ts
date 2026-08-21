import { NextResponse } from "next/server";
import type { ApiErrorBody, DropErrorCode } from "@/types/drop";

const STATUS_BY_CODE: Record<DropErrorCode, number> = {
  NOT_FOUND: 404,
  EXPIRED: 410,
  PASSWORD_REQUIRED: 401,
  INVALID_PASSWORD: 401,
  DOWNLOAD_LIMIT_REACHED: 410,
  RATE_LIMITED: 429,
  VALIDATION_ERROR: 400,
  STORAGE_ERROR: 502,
  INTERNAL_ERROR: 500,
  ADMIN_REQUIRED: 401,
};

/**
 * Every error response is a generic { code, message } pair. Messages are
 * written to be safe to show a user directly — never include stack
 * traces, storage keys, internal IDs, or provider error text.
 */
export function apiError(code: DropErrorCode, message: string): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { code, message } }, { status: STATUS_BY_CODE[code] });
}

export function rateLimitHeaders(resetAt: number): HeadersInit {
  return { "Retry-After": Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)).toString() };
}
