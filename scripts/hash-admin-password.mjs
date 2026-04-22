#!/usr/bin/env node
import bcrypt from "bcryptjs";

const password = process.argv[2];

if (!password) {
  console.error("用法: node scripts/hash-admin-password.mjs <password>");
  process.exit(1);
}

const saltRounds = 12;
const hash = await bcrypt.hash(password, saltRounds);
console.log(hash);
