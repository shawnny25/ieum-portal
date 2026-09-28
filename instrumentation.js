import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./lib/sentry";

export function register() { Sentry.init(sentryOptions); }

// API 라우트·서버 렌더링에서 난 오류
export const onRequestError = Sentry.captureRequestError;
