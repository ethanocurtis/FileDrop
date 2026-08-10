import { describe, expect, it } from "vitest";
import {
  assertDeclaredSizeIsAllowed,
  assertFileCountIsAllowed,
  FileValidationError,
  isBlockedExtension,
  extensionOf,
} from "@/lib/validation/file";
import { env } from "@/lib/env";

describe("assertDeclaredSizeIsAllowed", () => {
  it("accepts sizes within the configured maximum", () => {
    expect(() => assertDeclaredSizeIsAllowed(1)).not.toThrow();
    expect(() => assertDeclaredSizeIsAllowed(env.MAX_UPLOAD_SIZE_BYTES)).not.toThrow();
  });

  it("rejects zero-byte files", () => {
    expect(() => assertDeclaredSizeIsAllowed(0)).toThrow(FileValidationError);
    try {
      assertDeclaredSizeIsAllowed(0);
    } catch (err) {
      expect((err as FileValidationError).code).toBe("EMPTY_FILE");
    }
  });

  it("rejects sizes over the configured maximum", () => {
    expect(() => assertDeclaredSizeIsAllowed(env.MAX_UPLOAD_SIZE_BYTES + 1)).toThrow(
      FileValidationError,
    );
    try {
      assertDeclaredSizeIsAllowed(env.MAX_UPLOAD_SIZE_BYTES + 1);
    } catch (err) {
      expect((err as FileValidationError).code).toBe("FILE_TOO_LARGE");
    }
  });
});

describe("assertFileCountIsAllowed", () => {
  it("accepts 1..MAX_FILES_PER_DROP files", () => {
    expect(() => assertFileCountIsAllowed(1)).not.toThrow();
    expect(() => assertFileCountIsAllowed(env.MAX_FILES_PER_DROP)).not.toThrow();
  });

  it("rejects zero files and more than the configured maximum", () => {
    expect(() => assertFileCountIsAllowed(0)).toThrow(FileValidationError);
    expect(() => assertFileCountIsAllowed(env.MAX_FILES_PER_DROP + 1)).toThrow(
      FileValidationError,
    );
  });
});

describe("extensionOf / isBlockedExtension", () => {
  it("extracts a lowercase extension", () => {
    expect(extensionOf("Report.PDF")).toBe("pdf");
    expect(extensionOf("archive.tar.gz")).toBe("gz");
    expect(extensionOf("no-extension")).toBe("");
    expect(extensionOf(".hidden")).toBe("");
  });

  it("flags known-dangerous executable extensions", () => {
    expect(isBlockedExtension("virus.exe")).toBe(true);
    expect(isBlockedExtension("installer.MSI")).toBe(true);
    expect(isBlockedExtension("script.ps1")).toBe(true);
  });

  it("allows ordinary document/media/archive extensions", () => {
    expect(isBlockedExtension("report.pdf")).toBe(false);
    expect(isBlockedExtension("photo.png")).toBe(false);
    expect(isBlockedExtension("bundle.zip")).toBe(false);
  });
});
