import { Injectable, Logger, NotFoundException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Cam } from "onvif"
import axios from "axios"

export interface OnvifCameraConfig {
  cameraId: string
  host: string
  port?: number
  user?: string
  pass?: string
  position?: string
}

// Cliente ONVIF: resuelve el snapshot URI de la camara (comando nativo
// GetSnapshotUri) y descarga el buffer JPEG via HTTP/RTSP-snapshot.
@Injectable()
export class OnvifCameraClient {
  private readonly logger = new Logger(OnvifCameraClient.name)
  private readonly cameras: OnvifCameraConfig[]

  constructor(private readonly config: ConfigService) {
    this.cameras = OnvifCameraClient.parseCameras(this.config.get<string>("ONVIF_CAMERAS", "[]"))
  }

  async getSnapshot(cameraId: string): Promise<Buffer> {
    const camera = this.findCamera(cameraId)
    const cam = await this.connect(camera)
    const uri = await this.getSnapshotUri(cam)

    const response = await axios.get<ArrayBuffer>(uri, {
      responseType: "arraybuffer",
      timeout: 10000,
      auth: camera.user ? { username: camera.user, password: camera.pass ?? "" } : undefined,
    })

    return Buffer.from(response.data)
  }

  private findCamera(cameraId: string): OnvifCameraConfig {
    const camera = this.cameras.find((c) => c.cameraId === cameraId)
    if (!camera) {
      throw new NotFoundException(`Camara ONVIF no configurada: ${cameraId}`)
    }
    return camera
  }

  private connect(camera: OnvifCameraConfig): Promise<Cam> {
    return new Promise((resolve, reject) => {
      const cam = new Cam(
        { hostname: camera.host, port: camera.port ?? 80, username: camera.user, password: camera.pass },
        function (this: Cam, error) {
          if (error) return reject(error)
          resolve(cam)
        },
      )
    })
  }

  private getSnapshotUri(cam: Cam): Promise<string> {
    return new Promise((resolve, reject) => {
      cam.getSnapshotUri((error, result) => {
        if (error) return reject(error)
        resolve(result.uri)
      })
    })
  }

  private static parseCameras(raw: string): OnvifCameraConfig[] {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as OnvifCameraConfig[]) : []
    } catch {
      return []
    }
  }
}
