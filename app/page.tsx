import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/session";

export default async function HomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifyAdminSessionToken(token);

  if (session) {
    redirect("/dashboard");
  }

  redirect("/login");
}
