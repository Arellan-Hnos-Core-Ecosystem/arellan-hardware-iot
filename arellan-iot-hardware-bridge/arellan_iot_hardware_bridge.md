# arellan-iot-hardware-bridge — Bridge ZKTeco ADMS

Servicio NestJS que recibe eventos del reloj biométrico ZKTeco BioTime 8.0 vía protocolo ADMS (HTTP push) y los transforma en registros de asistencia trazables dentro del ecosistema digital Arellan.

## Contexto de Negocio

El reloj ZKTeco registra entradas y salidas del personal del taller. Esta integración permite:
- **Control de asistencia en tiempo real** — saber quién está en el taller en cada momento
- **Evidencia de presencia** — timestamps exactos para respaldo laboral (Ley 728)
- **Cruce con audit_log** — detectar acciones en el sistema cuando el empleado no estaba físicamente en el taller
- **Alertas de ausencias** — notificación a ADMIN/OWNER si mecánico no fichó y hay OTs asignadas

## Protocolo ADMS

ZKTeco BioTime 8.0 envía POST HTTP automático al registrar cada fichaje:

```
POST /adms/attendance
Content-Type: application/x-www-form-urlencoded

SN=ZKTECO123456&
table=ATTLOG&
Stamp=2024-01-15+08:05:32&
UserID=E004&
AttState=0&
VerifyMethod=1&
WorkCode=0
```

| Campo | Descripción | Valores |
|-------|-------------|---------|
| `SN` | Número de serie del dispositivo | Identificador único del ZKTeco |
| `UserID` | ID del empleado registrado en el reloj | Debe mapear a `Account.employeeCode` |
| `Stamp` | Timestamp del fichaje | Formato `YYYY-MM-DD HH:MM:SS` |
| `AttState` | Tipo de evento | 0=Check-In, 1=Check-Out, 4=Overtime-In, 5=Overtime-Out |
| `VerifyMethod` | Método de verificación | 1=Huella, 4=PIN, 15=Cara |

## Arquitectura del Bridge

```
ZKTeco Device
    │
    │  HTTP POST /adms/attendance
    ▼
NestJS AdmsController
    │
    ├── Validar device SN (whitelist)
    ├── Mapear UserID → employeeId interno
    ├── Crear AttendanceRecord en DB
    └── Enqueue BullMQ job: 'attendance.registered'
            │
            ▼
    NotificationWorker (si ausencia detectada)
    AuditLog (registro inmutable de cada fichaje)
```

## Implementación

### Controller ADMS

```typescript
@Controller('adms')
export class AdmsController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly auditService: AuditService,
  ) {}

  @Post('attendance')
  @UseGuards(AdmsDeviceGuard)  // Valida SN del dispositivo
  async receiveAttendance(
    @Body() payload: ZktecoAdmsPayload,
  ): Promise<{ GetStamp: string }> {
    const record = await this.attendanceService.processCheckEvent(payload)

    await this.auditService.log({
      action: 'BIOMETRIC_ATTENDANCE',
      entityType: 'attendance_records',
      entityId: record.id,
      metadata: {
        employeeId: record.employeeId,
        attState: payload.AttState,
        verifyMethod: payload.VerifyMethod,
        deviceSN: payload.SN,
      },
    })

    // CRÍTICO: ZKTeco espera este response exacto para sincronizar timestamp
    return { GetStamp: format(new Date(), 'yyyy-MM-dd HH:mm:ss') }
  }
}
```

### DTO de Validación

```typescript
export class ZktecoAdmsPayload {
  @IsString()
  @IsNotEmpty()
  SN: string  // Serial del dispositivo — validado contra whitelist

  @IsString()
  table: string

  @IsString()
  Stamp: string  // Parsear con parseISO o parse de date-fns

  @IsString()
  UserID: string  // Mapear a employeeId interno

  @IsEnum([0, 1, 4, 5])
  @Transform(({ value }) => parseInt(value))
  AttState: 0 | 1 | 4 | 5  // 0=IN, 1=OUT, 4=OT-IN, 5=OT-OUT

  @IsEnum([1, 4, 15])
  @Transform(({ value }) => parseInt(value))
  VerifyMethod: 1 | 4 | 15  // 1=huella, 4=PIN, 15=cara
}
```

### Regla Crítica: Checkout Forzado

Si un empleado hace check-in pero no registra check-out al final del día, el sistema debe cerrar el turno automáticamente para evitar horas infladas:

```typescript
// Worker: ejecuta cada día a las 11:59 PM
@Cron('59 23 * * *')
async forceCheckoutMissingRecords(): Promise<void> {
  const openSessions = await this.prisma.attendanceRecord.findMany({
    where: {
      checkOutAt: null,
      checkInAt: { lt: startOfDay(new Date()) },
    },
  })

  for (const session of openSessions) {
    await this.prisma.attendanceRecord.update({
      where: { id: session.id },
      data: {
        checkOutAt: endOfDay(session.checkInAt),
        forcedCheckout: true,
        notes: 'AUTO_CLOSED: no se registró salida biométrica',
      },
    })

    await this.auditService.log({
      action: 'FORCED_CHECKOUT',
      entityType: 'attendance_records',
      entityId: session.id,
      metadata: { reason: 'missing_biometric_checkout' },
    })
  }
}
```

## Tabla de Base de Datos

```sql
CREATE TABLE attendance_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES accounts(id),
  check_in_at   TIMESTAMPTZ NOT NULL,
  check_out_at  TIMESTAMPTZ,
  att_state     SMALLINT NOT NULL,  -- 0=IN, 1=OUT, 4=OT-IN, 5=OT-OUT
  verify_method SMALLINT NOT NULL,  -- 1=huella, 4=PIN, 15=cara
  device_sn     VARCHAR(50) NOT NULL,
  forced_checkout BOOLEAN DEFAULT false,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_attendance_employee_date
  ON attendance_records (employee_id, check_in_at DESC);

CREATE INDEX idx_attendance_date
  ON attendance_records (check_in_at DESC);
```

## Configuración del Dispositivo ZKTeco

En el panel admin del ZKTeco BioTime 8.0, configurar:

```
Device → Communication → ADMS:
  Server Address: api.arellan.pe
  Port: 443
  Enable HTTPS: YES
  Push Command: /adms/attendance
  Push Interval: realtime
```

## Variables de Entorno

```env
ZKTECO_DEVICE_SN_WHITELIST=ZKTECO123456,ZKTECO789012  # Seriales autorizados
ZKTECO_SHARED_KEY=<secret>                             # Verificación HMAC opcional
FORCED_CHECKOUT_HOUR=23                                # Hora de checkout forzado
ATTENDANCE_ANOMALY_ALERT_ENABLED=true
```

## Alertas de Anomalía

| Condición | Alerta | Destinatario |
|-----------|--------|--------------|
| Check-in fuera de horario laboral (antes 6AM / después 10PM) | Push silencioso | OWNER |
| VerifyMethod=PIN (no biométrico) 3+ veces seguidas | Push alerta | OWNER + ADMIN |
| Empleado activo en sistema sin check-in biométrico | Push | ADMIN |
| Empleado con check-out pero realizando acciones en sistema | Alerta fraude | OWNER |

La última condición es particularmente importante: si un empleado registra check-out en el ZKTeco pero continúa realizando transacciones en el sistema, se genera alerta de actividad sospechosa.
