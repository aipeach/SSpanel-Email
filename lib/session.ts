import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE_NAME = "sspanel_email_session";
const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 12;

type SessionPayload = {
  role: "admin";
};

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET 未配置或长度不足 32 位");
  }
  return new TextEncoder().encode(secret);
}

export async function signAdminSessionToken() {
  const secret = getSessionSecret();

  return new SignJWT({ role: "admin" satisfies SessionPayload["role"] })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_EXPIRES_IN_SECONDS}s`)
    .sign(secret);
}

export async function verifyAdminSessionToken(token: string | undefined) {
  if (!token) {
    return null;
  }

  try {
    const secret = getSessionSecret();
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });

    if (payload.role !== "admin") {
      return null;
    }

    return payload as SessionPayload;
  } catch {
    return null;
  }
}
