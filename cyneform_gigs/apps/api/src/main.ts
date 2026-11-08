import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { env } from "./config/env";

const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.set("trust proxy", env.TRUST_PROXY);
app.use(helmet());
app.use(cookieParser());
app.setGlobalPrefix("api/v1");
app.enableCors({ origin: env.CORS_ORIGIN, credentials: true });
app.enableShutdownHooks();
await app.listen(env.PORT);
