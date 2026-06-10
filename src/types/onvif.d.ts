// Declaracion ambiente minima para "onvif" (sin tipos publicados).
// Cubre solo la API usada por OnvifCameraClient.
declare module "onvif" {
  export interface CamOptions {
    hostname: string
    username?: string
    password?: string
    port?: number
    timeout?: number
  }

  export interface SnapshotUriResult {
    uri: string
  }

  export class Cam {
    constructor(options: CamOptions, callback: (this: Cam, error: Error | null) => void)
    getSnapshotUri(callback: (error: Error | null, result: SnapshotUriResult) => void): void
  }
}
