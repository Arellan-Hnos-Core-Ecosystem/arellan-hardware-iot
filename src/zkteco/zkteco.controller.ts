import { Controller, Post, Body, UseGuards, HttpCode } from "@nestjs/common"
import { AdmsDeviceGuard } from "../common/guards/adms-device.guard"
import { ZktecoDeviceAdapter } from "./zkteco-device.adapter"
import { ZktecoAdmsPayload } from "./dto/zkteco-adms.dto"

// Receptor ADMS (push) de dispositivos ZKTeco del taller.
@Controller("adms")
export class AdmsController {
  constructor(private readonly adapter: ZktecoDeviceAdapter) {}

  @Post("attendance")
  @UseGuards(AdmsDeviceGuard)
  @HttpCode(200)
  async receiveAttendance(@Body() payload: ZktecoAdmsPayload): Promise<{ GetStamp: string }> {
    return this.adapter.handleAttendanceEvent(payload)
  }
}
