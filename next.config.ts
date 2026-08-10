import type { NextConfig } from "next";

// Secure-by-default HTTP headers, applied globally. Downloads additionally
// set per-response Content-Disposition / X-Content-Type-Options in the
// route handler itself (see src/app/api/share/[shareId]/files/[fileId]/route.ts).
//
// A note on Content-Security-Policy: an ideal CSP would use a per-request
// nonce and drop 'unsafe-inline' from script-src entirely. That requires
// every page that might render to be dynamically rendered (Next.js can
// only stamp a nonce onto its own bootstrap scripts at request time), which
// would force the static homepage into SSR-on-every-request for no real
// benefit here — FileDrop's own code never uses dangerouslySetInnerHTML or
// renders unsanitized user content as markup (uploaded files are always
// served as opaque, attachment-disposition downloads, never executed or
// inlined), so the realistic XSS surface 'unsafe-inline' would open is
// already covered by React's default escaping. `script-src 'self'
// 'unsafe-inline'` still blocks the higher-value threats — injected
// third-party/remote scripts and data exfiltration to attacker origins —
// so it's the simpler, still-meaningfully-defensive choice here.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
