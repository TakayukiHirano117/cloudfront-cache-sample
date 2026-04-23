import { getSignedUrl } from "@aws-sdk/cloudfront-signer";

import { readCloudFrontMediaConfig } from "./cloudFrontMediaConfig";

function objectKeyToUrlPath(objectKey: string): string {
  return objectKey
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/**
 * Builds a time-limited signed CloudFront URL for the given S3 object key.
 * Returns null when media signing env is not configured or signing fails.
 */
export function signFacePhotoUrl(objectKey: string): string | null {
  const config = readCloudFrontMediaConfig();
  if (!config) {
    return null;
  }

  const path = objectKeyToUrlPath(objectKey);
  const url = `${config.baseUrl}/${path}`;
  const expiresAt = new Date(Date.now() + config.ttlSeconds * 1000);

  try {
    return getSignedUrl({
      url,
      keyPairId: config.keyPairId,
      privateKey: config.privateKey,
      dateLessThan: expiresAt,
    });
  } catch {
    return null;
  }
}
