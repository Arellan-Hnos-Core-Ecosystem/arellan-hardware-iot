import { Injectable } from "@nestjs/common"
import { HttpService } from "@nestjs/axios"
import { firstValueFrom } from "rxjs"

export interface BiometricAttendancePayload {
  dni: string
  timestamp: string
  deviceSN: string
  verifyMethod: number
}

export interface CameraCapturePayload {
  position: string
  cameraId: string
  imageBase64: string
  mimeType?: string
}

// Cliente HTTP hacia arellan-platform. baseURL y header x-device-key
// (IOT_BRIDGE_SHARED_SECRET) configurados en PlatformApiModule.
@Injectable()
export class PlatformApiClient {
  constructor(private readonly http: HttpService) {}

  async postBiometricAttendance(payload: BiometricAttendancePayload) {
    const response = await firstValueFrom(
      this.http.post("/public/iot/attendance/biometric", payload),
    )
    return response.data
  }

  async postCameraCapture(orderId: string, payload: CameraCapturePayload) {
    const response = await firstValueFrom(
      this.http.post(`/public/iot/orders/${orderId}/photos/camera-capture`, payload),
    )
    return response.data
  }
}
