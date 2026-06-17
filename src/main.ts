import { NestFactory } from "@nestjs/core"
import { ValidationPipe, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import helmet from "helmet"
import type { Request, Response } from "express"
import { AppModule } from "./app.module"

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const config = app.get(ConfigService)
  const logger = new Logger("Bootstrap")

  app.use(helmet())

  // whitelist (sin forbidNonWhitelisted): los payloads ADMS de ZKTeco varian
  // por modelo de dispositivo y traen campos extra que se descartan, no se rechazan.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )

  // Raiz con respuesta limpia para proxies y monitores (evita 404 "Cannot GET /")
  app
    .getHttpAdapter()
    .getInstance()
    .get("/", (_req: Request, res: Response) =>
      res.json({ status: "online", service: "arellan-iot-bridge", timestamp: new Date().toISOString() }),
    )

  const port = config.get<number>("PORT", 3007)
  await app.listen(port)
  logger.log(`Arellan Hardware IoT Bridge running on http://localhost:${port}`)
  logger.log(`ZKTeco ADMS endpoint:   POST http://localhost:${port}/adms/attendance`)
  logger.log(`ONVIF capture endpoint: POST http://localhost:${port}/iot/cameras/:cameraId/capture`)
}

bootstrap()
