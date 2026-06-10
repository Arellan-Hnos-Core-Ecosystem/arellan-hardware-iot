import { Module } from "@nestjs/common"
import { AdmsController } from "./zkteco.controller"
import { ZktecoDeviceAdapter } from "./zkteco-device.adapter"

@Module({
  controllers: [AdmsController],
  providers: [ZktecoDeviceAdapter],
})
export class ZktecoModule {}
