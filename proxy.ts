import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/session";

function isPublicPath(pathname: string) {
  return pathname === "/login" || pathname === "/api/auth/login";
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    if (pathname === "/login") {
      const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
      const session = await verifyAdminSessionToken(token);

      if (session) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }

    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifyAdminSessionToken(token);

  if (session) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
