import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { timingSafeEqual } from "crypto"

// Autoriza llamadas entrantes desde arellan-platform (orquestacion ONVIF) via
// header x-device-key. Mismo secreto compartido (IOT_BRIDGE_SHARED_SECRET) usado
// por DeviceAuthGuard del lado de arellan-platform, en sentido inverso.
@Injectable()
export class IotSharedSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const provided: string | undefined = request.headers["x-device-key"]
    const expected = this.config.get<string>("IOT_BRIDGE_SHARED_SECRET")

    if (!expected) {
      throw new ForbiddenException("IOT_BRIDGE_SHARED_SECRET no configurado en el servidor")
    }
    if (!provided || !IotSharedSecretGuard.safeCompare(provided, expected)) {
      throw new UnauthorizedException("Credencial de bridge invalida")
    }
    return true
  }

  private static safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a)
    const bufB = Buffer.from(b)
    if (bufA.length !== bufB.length) return false
    return timingSafeEqual(bufA, bufB)
  }
}
