import bcrypt from "bcryptjs";
import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

export async function verifyAdminPassword(inputPassword: string) {
  const hash = process.env.ADMIN_PASSWORD_HASH?.trim();
  const plain = process.env.ADMIN_PASSWORD?.trim();

  if (hash) {
    return bcrypt.compare(inputPassword, hash);
  }

  if (plain) {
    return safeEqual(inputPassword, plain);
  }

  throw new Error("未配置管理员密码：请设置 ADMIN_PASSWORD_HASH 或 ADMIN_PASSWORD");
}
