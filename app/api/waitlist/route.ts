import { NextResponse } from "next/server";
import { z } from "zod";

import {
  WaitlistDatabaseConfigError,
  addWaitlistSubscriber,
} from "@/lib/waitlist";

export const runtime = "nodejs";

const waitlistRequestSchema = z.object({
  email: z.string().trim().email().max(254),
});

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Send a valid JSON request." },
      { status: 400 },
    );
  }

  const parsed = waitlistRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Enter a valid email address." },
      { status: 400 },
    );
  }

  try {
    const result = await addWaitlistSubscriber({
      email: parsed.data.email,
      userAgent: request.headers.get("user-agent"),
      referrer: request.headers.get("referer"),
    });

    return NextResponse.json({
      ok: true,
      status: result.status,
      message:
        result.status === "created"
          ? "You're on the waitlist."
          : "You're already on the waitlist.",
    });
  } catch (error) {
    if (error instanceof WaitlistDatabaseConfigError) {
      return NextResponse.json(
        {
          ok: false,
          message: "Waitlist storage is not configured yet.",
        },
        { status: 503 },
      );
    }

    console.error("Waitlist signup failed", error);

    return NextResponse.json(
      {
        ok: false,
        message: "We could not join the waitlist yet.",
      },
      { status: 500 },
    );
  }
}
