import { IsString, IsNotEmpty } from "class-validator"

// Comando "capturar ahora": disparado por arellan-platform tras un check-in
// de OT con placa valida (Regla Anti-Fraude #8).
export class CaptureSnapshotDto {
  @IsString()
  @IsNotEmpty()
  orderId: string

  @IsString()
  @IsNotEmpty()
  position: string
}
