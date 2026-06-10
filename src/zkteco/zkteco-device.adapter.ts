import { Injectable, Logger } from "@nestjs/common"
import { PlatformApiClient } from "../common/platform-api/platform-api.client"
import { ZktecoAdmsPayload } from "./dto/zkteco-adms.dto"

// AttState de entrada: 0=IN, 4=OT-IN. Solo estos disparan
// ProcessBiometricAttendanceUseCase (evaluacion de tardanza/penalizacion).
const CHECK_IN_STATES = new Set([0, 4])

// Adaptador de dispositivo ZKTeco: sanitiza el payload ADMS (DNI, timestamp)
// y lo despacha al backend unificado. Responde siempre {GetStamp} para que
// el reloj del dispositivo se sincronice (protocolo ADMS).
@Injectable()
export class ZktecoDeviceAdapter {
  private readonly logger = new Logger(ZktecoDeviceAdapter.name)

  constructor(private readonly platformApi: PlatformApiClient) {}

  async handleAttendanceEvent(payload: ZktecoAdmsPayload): Promise<{ GetStamp: string }> {
    const dni = payload.UserID.trim()
    const timestamp = ZktecoDeviceAdapter.parseStamp(payload.Stamp)

    if (CHECK_IN_STATES.has(payload.AttState)) {
      try {
        await this.platformApi.postBiometricAttendance({
          dni,
          timestamp: timestamp.toISOString(),
          deviceSN: payload.SN,
          verifyMethod: payload.VerifyMethod,
        })
        this.logger.log(`Asistencia despachada: dni=${dni} device=${payload.SN} attState=${payload.AttState}`)
      } catch (error) {
        this.logger.error(`Error despachando asistencia (dni=${dni}): ${(error as Error).message}`)
      }
    } else {
      this.logger.log(`Evento OUT recibido (sin dispatch): dni=${dni} device=${payload.SN} attState=${payload.AttState}`)
    }

    return { GetStamp: ZktecoDeviceAdapter.formatStamp(new Date()) }
  }

  // Sanitiza "YYYY-MM-DD HH:mm:ss" (formato ADMS) a Date
  private static parseStamp(stamp: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(stamp.trim())
    if (!match) return new Date()

    const [, year, month, day, hour, minute, second] = match
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
  }

  private static formatStamp(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  }
}
