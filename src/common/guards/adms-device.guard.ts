import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"

// Autoriza POST /adms/attendance por whitelist de seriales (SN) del payload ADMS.
// El protocolo ZKTeco no permite headers custom, por eso la validacion es por SN.
@Injectable()
export class AdmsDeviceGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const sn: string | undefined = request.body?.SN ?? request.query?.SN

    const whitelist = this.config
      .get<string>("ZKTECO_DEVICE_SN_WHITELIST", "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)

    if (whitelist.length === 0) {
      throw new ForbiddenException("ZKTECO_DEVICE_SN_WHITELIST no configurado en el servidor")
    }
    if (!sn || !whitelist.includes(sn)) {
      throw new UnauthorizedException(`Dispositivo ZKTeco no autorizado: SN=${sn ?? "desconocido"}`)
    }
    return true
  }
}
