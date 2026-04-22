import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { authGuard } from "./middlewares/auth-guard";
import { logger } from "./lib/logger";

function getPublicOriginsFromEnv(): string[] {
  const rawPublicUrl = process.env.PUBLIC_URL?.trim();
  if (!rawPublicUrl) return [];

  try {
    const parsed = new URL(rawPublicUrl);
    return [parsed.origin];
  } catch {
    const hostname = rawPublicUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!hostname) return [];
    return [`http://${hostname}`, `https://${hostname}`];
  }
}

const ALLOWED_ORIGINS = [
  "https://www.techsin.com.br",
  "https://techsin.com.br",
  ...getPublicOriginsFromEnv(),
  ...(process.env.NODE_ENV !== "production"
    ? [/^https?:\/\/.*\.replit\.dev$/, /^https?:\/\/.*\.repl\.co$/, "http://localhost"]
    : []),
];

const app: Express = express();

/* ── Remove fingerprinting ─────────────────────────────────────────── */
app.disable("x-powered-by");

/* ── Request logger ────────────────────────────────────────────────── */
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

/* ── Security headers ──────────────────────────────────────────────── */
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload",
  );
  next();
});

/* ── CORS ──────────────────────────────────────────────────────────── */
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const allowed = ALLOWED_ORIGINS.some((o) =>
        typeof o === "string" ? o === origin : o.test(origin),
      );
      cb(allowed ? null : new Error("Not allowed by CORS"), allowed);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

/* 10 MB — comporta base64 de imagens comprimidas enviadas pelo upload */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* ── Cookies (sessao JWT) ─────────────────────────────────────────── */
app.use(cookieParser());

/* ── Auth guard ─────────────────────────────────────────────────────
 * Bloqueia todas as rotas /api/* exceto as publicas (login, healthz,
 * rotas do app do motorista acessadas via magic token). */
app.use("/api", authGuard, router);

export default app;
