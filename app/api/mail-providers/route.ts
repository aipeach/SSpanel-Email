import { NextResponse } from "next/server";
import {
  getAvailableMailProviders,
  getMailProviderLabels,
  normalizeMailProvider,
  type MailProvider,
} from "@/lib/mail-provider";

export async function GET() {
  const providers = getAvailableMailProviders();
  let defaultProvider: MailProvider | null = null;

  try {
    defaultProvider = normalizeMailProvider();
  } catch {
    defaultProvider = providers[0] || null;
  }

  return NextResponse.json({
    ok: true,
    providers,
    defaultProvider,
    labels: getMailProviderLabels(),
  });
}

