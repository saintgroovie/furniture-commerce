import { NextResponse } from "next/server"

export function redirectTo(request: Request, path: string) {
  const host = request.headers.get("host") ?? ""
  if (!/^[A-Za-z0-9.-]+(?::\d+)?$/.test(host)) {
    return NextResponse.redirect(new URL(path, request.url))
  }
  const proto = request.headers.get("x-forwarded-proto") === "https" ? "https" : "http"
  return NextResponse.redirect(new URL(path, `${proto}://${host}`))
}
