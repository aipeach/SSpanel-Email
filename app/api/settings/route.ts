import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  CONFIG_FIELDS,
  isEditableConfigKey,
  listEditableConfigFields,
  saveEditableConfigValues,
} from "@/lib/runtime-config";

const payloadSchema = z.object({
  values: z.record(z.string(), z.string().max(8192)).default({}),
});

function validateValueByField(key: string, value: string) {
  const field = CONFIG_FIELDS.find((item) => item.key === key);

  if (!field) {
    return;
  }

  if (value === "") {
    return;
  }

  if (field.type === "number") {
    const numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {
      throw new Error(`${field.label} 必须是数字`);
    }

    if (key === "SMTP_PORT" && (!Number.isInteger(numberValue) || numberValue <= 0)) {
      throw new Error(`${field.label} 必须是大于 0 的整数`);
    }

    if (key === "DEFAULT_SEND_RATE_PER_MINUTE" && (!Number.isInteger(numberValue) || numberValue <= 0)) {
      throw new Error(`${field.label} 必须是大于 0 的整数`);
    }
  }

  if (field.type === "select" && field.options && !field.options.some((item) => item.value === value)) {
    throw new Error(`${field.label} 取值无效`);
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    settings: listEditableConfigFields(),
    note: "当前页面仅支持发件策略、SendGrid、Resend、SMTP 配置；读取优先级：.env > SQLite。",
  });
}

export async function PATCH(request: NextRequest) {
  try {
    const payload = payloadSchema.parse(await request.json());
    const values = payload.values || {};
    const allowedEntries = Object.entries(values).filter(([key]) => isEditableConfigKey(key));

    for (const [key, value] of allowedEntries) {
      validateValueByField(key, value);
    }

    saveEditableConfigValues(Object.fromEntries(allowedEntries));

    return NextResponse.json({
      ok: true,
      settings: listEditableConfigFields(),
      note: "配置已保存。当前仅发件相关配置支持 SQLite 回退；若同名 .env 已配置，运行时会优先使用 .env。",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "参数错误" },
        { status: 400 },
      );
    }

    const message = error instanceof Error ? error.message : "保存配置失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
