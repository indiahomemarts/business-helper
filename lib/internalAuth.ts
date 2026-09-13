import "server-only";
import { NextRequest } from "next/server";

/**
 * Internal routes (called only by the GitHub Actions scraper, never the
 * browser) require this header:
 *   Authorization: Bearer <INTERNAL_API_SECRET>
 * Returns true if the request is authorized.
 */
export function isAuthorizedInternalRequest(req: NextRequest): boolean {
  const expected = process.env.INTERNAL_API_SECRET;
  if (!expected) {
    console.error("INTERNAL_API_SECRET is not set — refusing all internal requests.");
    return false;
  }
  const header = req.headers.get("authorization") || "";
  return header === `Bearer ${expected}`;
}
