import { NextResponse } from "next/server";
import { handleWebhook } from "@/server/services/payments";

export const dynamic = "force-dynamic";
// Node, not Edge: signature verification needs node:crypto, and the handler writes to the database.
export const runtime = "nodejs";

/**
 * Where a payment provider tells us what actually happened.
 *
 * This is the only endpoint in the application that may mark money as taken, which is why it is a POST
 * with no session: the caller is a gateway, not a person, and it proves itself with a signature over the
 * request body rather than a cookie.
 *
 * The body is read as raw text and passed through untouched. Parsing it first and re-serialising would
 * change the bytes — key order, whitespace, number formatting — and every signature scheme signs the
 * bytes. `handleWebhook` stores those bytes, verifies the signature, refuses a replay on the provider's
 * own event id, and only then settles anything.
 *
 * Status codes are chosen for the provider, not for us: 200 means "stop retrying", 500 means "retry",
 * 400 means "this will never be valid". A duplicate is a 200, because it has already been handled.
 */
export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return new NextResponse("unreadable", { status: 400 });
  }
  if (raw.length > 1_000_000) return new NextResponse("too large", { status: 413 });

  // The URL goes through as well as the body: not every gateway signs in a header, and Paymob passes
  // its HMAC as a query parameter.
  const result = await handleWebhook(provider, { rawBody: raw, headers: request.headers, url: new URL(request.url) });
  return new NextResponse(result.body, { status: result.status });
}

/** Some providers probe the URL before they will save it. Answering keeps that check happy. */
export async function GET(_request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  return NextResponse.json({ ok: true, provider, note: "POST signed events here." });
}
