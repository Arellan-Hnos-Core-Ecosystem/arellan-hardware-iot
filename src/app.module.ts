import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { PlatformApiModule } from "./common/platform-api/platform-api.module"
import { ZktecoModule } from "./zkteco/zkteco.module"
import { OnvifModule } from "./onvif/onvif.module"

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PlatformApiModule,
    ZktecoModule,
    OnvifModule,
  ],
})
export class AppModule {}
