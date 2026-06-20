import { jsonResponse, handleRouteError, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { createSessionSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const body = createSessionSchema.parse(await readJson(request));
    const healthDataConsent = body?.healthDataConsent ?? false;

    // session 是后端生成的匿名身份，同时初始化免费订阅状态。
    const user = await prisma.user.create({
      data: {
        healthDataConsent,
        subscription: {
          create: {
            status: "free",
          },
        },
      },
      select: {
        id: true,
        subscriptionStatus: true,
      },
    });

    return jsonResponse(
      {
        sessionId: user.id,
        subscriptionStatus: user.subscriptionStatus,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
