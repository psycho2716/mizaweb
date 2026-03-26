import { NextResponse } from "next/server";
import { z } from "zod";

const sessionSchema = z.object({
  token: z.string().min(10),
  role: z.enum(["buyer", "seller", "admin"]),
});

export async function POST(request: Request) {
  const payload = await request.json();
  const parsed = sessionSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("miza_token", parsed.data.token, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 2,
  });
  response.cookies.set("miza_role", parsed.data.role, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 2,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("miza_token", "", {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set("miza_role", "", {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
