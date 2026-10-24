import { getSmokeRuns } from "../../../../lib/smoke";

export async function GET() {
  try {
    return Response.json({ runs: await getSmokeRuns() });
  } catch {
    return Response.json({ error: "internal_error", message: "Unable to load smoke-test logs." }, { status: 500 });
  }
}
