import { NextRequest, NextResponse } from "next/server";
import type { MixStatus } from "@/lib/mix-types";

const HETZNER_URL = process.env.HETZNER_API_URL || "https://mixmaster.mixtape.run";

export async function GET(request: NextRequest) {
  const planId = request.nextUrl.searchParams.get("planId");

  if (!planId) {
    return NextResponse.json(
      { error: "planId required" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${HETZNER_URL}/api/mix/status/${planId}`);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Hetzner returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();

    const status: MixStatus = {
      planId: data.planId || planId,
      status: data.status || "queued",
      progress: data.progress || 0,
      currentStep: data.currentStep,
      outputUrl: data.outputUrl,
      error: data.error,
    };

    return NextResponse.json(status);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to check status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
