export type CloudFrontMediaConfig = {
  baseUrl: string;
  keyPairId: string;
  privateKey: string;
  ttlSeconds: number;
};

function normalizePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, "\n").trim();
}

function normalizeBaseUrl(domainOrUrl: string): string {
  const trimmed = domainOrUrl.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed.replace(/\/$/, "");
  }
  return `https://${trimmed.replace(/\/$/, "")}`;
}

/**
 * Returns config when all required env vars are present and valid; otherwise null.
 * Missing config is expected for local dev before AWS resources exist.
 */
export function readCloudFrontMediaConfig(): CloudFrontMediaConfig | null {
  const domain = process.env.CLOUDFRONT_MEDIA_DOMAIN;
  const keyPairId = process.env.CLOUDFRONT_KEY_PAIR_ID;
  const privateKeyRaw = process.env.CLOUDFRONT_PRIVATE_KEY;

  if (!domain?.trim() || !keyPairId?.trim() || !privateKeyRaw?.trim()) {
    return null;
  }

  const privateKey = normalizePrivateKey(privateKeyRaw);
  if (!privateKey.includes("BEGIN") || !privateKey.includes("PRIVATE KEY")) {
    return null;
  }

  const ttlRaw = process.env.CLOUDFRONT_URL_TTL_SECONDS;
  const ttlSeconds =
    ttlRaw === undefined || ttlRaw === ""
      ? 3600
      : Number.parseInt(ttlRaw, 10);

  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    return null;
  }

  return {
    baseUrl: normalizeBaseUrl(domain),
    keyPairId: keyPairId.trim(),
    privateKey,
    ttlSeconds,
  };
}
