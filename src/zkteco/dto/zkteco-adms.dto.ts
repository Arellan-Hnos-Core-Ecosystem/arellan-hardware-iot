import { IsString, IsNotEmpty, IsIn, IsOptional } from "class-validator"
import { Transform } from "class-transformer"

// Payload del protocolo ADMS (push) de ZKTeco. AttState: 0=IN, 1=OUT, 4=OT-IN, 5=OT-OUT.
// VerifyMethod: 1=huella, 4=PIN, 15=facial.
export class ZktecoAdmsPayload {
  @IsString()
  @IsNotEmpty()
  SN: string

  @IsOptional()
  @IsString()
  table?: string

  @IsString()
  @IsNotEmpty()
  Stamp: string

  @IsString()
  @IsNotEmpty()
  UserID: string

  @Transform(({ value }) => parseInt(value, 10))
  @IsIn([0, 1, 4, 5])
  AttState: number

  @Transform(({ value }) => parseInt(value, 10))
  @IsIn([1, 4, 15])
  VerifyMethod: number
}
