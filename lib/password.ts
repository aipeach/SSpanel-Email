import { createHash, timingSafeEqual } from "node:crypto";
import { getConfigValue } from "@/lib/runtime-config";

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

export async function verifyAdminPassword(inputPassword: string) {
  const hash = getConfigValue("ADMIN_PASSWORD_HASH")?.trim();
  const plain = getConfigValue("ADMIN_PASSWORD")?.trim();

  if (hash) {
    const inputHash = createHash("sha256").update(inputPassword, "utf8").digest("hex");
    const normalizedHash = hash.toLowerCase();
    return safeEqual(inputHash, normalizedHash);
  }

  if (plain) {
    return safeEqual(inputPassword, plain);
  }

  throw new Error("未配置管理员密码：请设置 ADMIN_PASSWORD_HASH 或 ADMIN_PASSWORD");
}
