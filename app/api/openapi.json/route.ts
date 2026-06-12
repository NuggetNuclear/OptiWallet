// app/api/openapi.json/route.ts — sirve el spec OpenAPI (US-003).
// El spec vive en lib/openapi.ts; Swagger UI lo consume desde /api-docs.

import { NextResponse } from "next/server";
import { openApiSpec } from "@/lib/openapi";

// El spec es estático: no toca la base, se puede prerenderizar.
export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(openApiSpec, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
