import { Global, Module } from "@nestjs/common"
import { HttpModule } from "@nestjs/axios"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { PlatformApiClient } from "./platform-api.client"

@Global()
@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        baseURL: config.get<string>("PLATFORM_API_URL", "http://localhost:3001/api/v1"),
        timeout: 10000,
        headers: { "x-device-key": config.get<string>("IOT_BRIDGE_SHARED_SECRET", "") },
      }),
    }),
  ],
  providers: [PlatformApiClient],
  exports: [PlatformApiClient],
})
export class PlatformApiModule {}
