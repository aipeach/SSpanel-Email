#!/usr/bin/env node
import { createHash } from "node:crypto";

const password = process.argv[2];

if (!password) {
  console.error("用法: node scripts/hash-admin-password.mjs <password>");
  process.exit(1);
}

const hash = createHash("sha256").update(password, "utf8").digest("hex");
console.log(hash);
