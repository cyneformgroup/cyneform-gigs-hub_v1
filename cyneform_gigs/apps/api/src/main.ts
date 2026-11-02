import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import type { Env } from "./config/env";

const bootstrap = async () => {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix("api/v1");
  app.enableCors({ origin: config.get("CORS_ORIGIN"), credentials: true });
  app.enableShutdownHooks();

  await app.listen(config.get("PORT"));
};

await bootstrap();
