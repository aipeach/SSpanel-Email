import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminPassword } from "@/lib/password";
import { SESSION_COOKIE_NAME, signAdminSessionToken } from "@/lib/session";

const loginSchema = z.object({
  password: z.string().min(1, "请输入密码"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = loginSchema.parse(body);
    const isValid = await verifyAdminPassword(password);

    if (!isValid) {
      return NextResponse.json({ error: "密码错误" }, { status: 401 });
    }

    const token = await signAdminSessionToken();
    const response = NextResponse.json({ ok: true });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "参数错误" },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: "登录失败" }, { status: 500 });
  }
}
