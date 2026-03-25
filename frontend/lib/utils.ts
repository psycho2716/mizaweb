import { env } from "./env";

export function getAppName(): string {
  return env.NEXT_PUBLIC_APP_NAME;
}

