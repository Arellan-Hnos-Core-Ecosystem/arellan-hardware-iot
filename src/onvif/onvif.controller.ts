import { Controller, Post, Param, Body, UseGuards } from "@nestjs/common"
import { IotSharedSecretGuard } from "../common/guards/iot-shared-secret.guard"
import { OnvifCameraClient } from "./onvif-camera.client"
import { PlatformApiClient } from "../common/platform-api/platform-api.client"
import { CaptureSnapshotDto } from "./dto/capture-snapshot.dto"

// Disparado por arellan-platform al validar una placa en arellan-mechanic-ui
// (Regla Anti-Fraude #8): captura snapshot ONVIF y lo reenvia a
// POST /public/iot/orders/:id/photos/camera-capture (hash SHA-256 + vinculo
// a posicion de check-in se calculan en arellan-platform).
@Controller("iot/cameras")
export class OnvifController {
  constructor(
    private readonly cameraClient: OnvifCameraClient,
    private readonly platformApi: PlatformApiClient,
  ) {}

  @Post(":cameraId/capture")
  @UseGuards(IotSharedSecretGuard)
  async capture(@Param("cameraId") cameraId: string, @Body() dto: CaptureSnapshotDto) {
    const buffer = await this.cameraClient.getSnapshot(cameraId)

    return this.platformApi.postCameraCapture(dto.orderId, {
      position: dto.position,
      cameraId,
      imageBase64: buffer.toString("base64"),
      mimeType: "image/jpeg",
    })
  }
}
