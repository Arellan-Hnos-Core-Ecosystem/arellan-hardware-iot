import { Module } from "@nestjs/common"
import { OnvifController } from "./onvif.controller"
import { OnvifCameraClient } from "./onvif-camera.client"

@Module({
  controllers: [OnvifController],
  providers: [OnvifCameraClient],
})
export class OnvifModule {}
