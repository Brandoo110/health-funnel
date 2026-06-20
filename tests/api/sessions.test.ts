import { afterEach, describe, expect, it } from "vitest";

import { PATCH as updateSessionLead, POST as createSession } from "@/app/api/sessions/route";
import { prisma } from "@/lib/prisma";

const createdSessionIds = new Set<string>();

afterEach(async () => {
  for (const sessionId of createdSessionIds) {
    await prisma.user.deleteMany({ where: { id: sessionId } });
  }
  createdSessionIds.clear();
});

describe("sessions API", () => {
  it("persists_lead_contact_after_report_generation", async () => {
    const sessionId = await createSessionId();

    const response = await updateSessionLead(
      jsonRequest("PATCH", "/api/sessions", {
        sessionId,
        name: "  Junjie Li  ",
        email: "  JUNJIE@example.com  ",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      sessionId,
      name: "Junjie Li",
      email: "junjie@example.com",
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: sessionId } });
    expect(user.name).toBe("Junjie Li");
    expect(user.email).toBe("junjie@example.com");
  });

  it("rejects_invalid_lead_email", async () => {
    const sessionId = await createSessionId();

    const response = await updateSessionLead(
      jsonRequest("PATCH", "/api/sessions", {
        sessionId,
        name: "Junjie Li",
        email: "not-an-email",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("bad_request");
    expect(body.details.map((detail: { path: string }) => detail.path)).toContain("email");
  });
});

async function createSessionId() {
  const response = await createSession(jsonRequest("POST", "/api/sessions", {}));
  const body = await response.json();
  createdSessionIds.add(body.sessionId);
  return body.sessionId as string;
}

function jsonRequest(method: string, path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
