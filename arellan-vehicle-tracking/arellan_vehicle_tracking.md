# arellan-vehicle-tracking — Rastreo GPS y Control de Vehículos del Taller

Módulo de control GPS y geofencing para los vehículos propios del taller (camioneta de recojo, unidades de prueba). Previene el uso no autorizado, genera evidencia inmutable en cada movimiento y activa alertas en tiempo real ante violaciones de perímetro.

## Contexto de Negocio

Uno de los riesgos identificados (R-BIZ-03, nivel 9 — Medio) es el uso no autorizado de vehículos del taller fuera del horario laboral. Este módulo cierra ese riesgo:

- **Geofencing activo 24/7** — radio de 200m alrededor del taller (Surquillo, Lima)
- **Push inmediato a owners** si vehículo sale del perímetro sin autorización digital previa
- **Estado en tiempo real** visible en `arellan-mobile-app` (mapa GPS)
- **Evidencia inmutable** — cada movimiento queda en `audit_logs` con coordenadas y timestamp

## Estados del Vehículo del Taller

```
DISPONIBLE → EN_USO_AUTORIZADO → DISPONIBLE
     │               │
     │               └→ FUERA_PERIMETRO (alerta P1)
     │
     └→ ALERTA_JOYRIDE (uso sin autorización)
```

| Estado | Descripción |
|--------|-------------|
| `DISPONIBLE` | En taller, dentro del geofence |
| `EN_USO_AUTORIZADO` | Salida aprobada digitalmente por owner |
| `FUERA_PERIMETRO` | Salió del geofence sin autorización — alerta P1 activa |
| `ALERTA_JOYRIDE` | Uso no autorizado confirmado — playbook P1 activado |
| `EN_MANTENIMIENTO` | Fuera de servicio, no se rastrean alertas |

## Arquitectura

```
GPS Tracker (hardware en vehículo)
    │
    │  HTTP/MQTT cada 30 segundos
    ▼
VehicleTrackingService (NestJS)
    │
    ├── Verificar dentro/fuera geofence (haversine distance)
    ├── Si fuera del geofence:
    │       ├── ¿Hay autorización activa? → OK, log normal
    │       └── ¿Sin autorización? → ALERTA_JOYRIDE
    │                 ├── Push a OWNER (todos)
    │                 ├── Bloquear app del mecánico asignado
    │                 └── Guardar en audit_log (inmutable)
    └── WebSocket broadcast → arellan-mobile-app (mapa en tiempo real)
```

## Modelo de Datos

```typescript
// Tabla: workshop_vehicles
model WorkshopVehicle {
  id            String   @id @default(uuid())
  plate         String   @unique  // Placa del vehículo del taller
  model         String
  year          Int
  status        VehicleWorkshopStatus @default(DISPONIBLE)
  assignedTo    String?  // employeeId si está en uso
  currentLat    Float?
  currentLng    Float?
  lastSeenAt    DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  authorizations VehicleAuthorization[]
  trackingLogs   VehicleTrackingLog[]
}

// Tabla: vehicle_authorizations
model VehicleAuthorization {
  id          String   @id @default(uuid())
  vehicleId   String
  requestedBy String   // employeeId
  approvedBy  String?  // ownerId
  destination String
  estimatedReturn DateTime
  status      AuthorizationStatus @default(PENDING)
  approvedAt  DateTime?
  createdAt   DateTime @default(now())

  vehicle     WorkshopVehicle @relation(fields: [vehicleId], references: [id])
}

// Tabla: vehicle_tracking_logs
model VehicleTrackingLog {
  id        String   @id @default(uuid())
  vehicleId String
  lat       Float
  lng       Float
  speed     Float?   // km/h
  insideFence Boolean
  createdAt DateTime @default(now())

  vehicle   WorkshopVehicle @relation(fields: [vehicleId], references: [id])
}
```

## Geofencing — Cálculo de Distancia

```typescript
@Injectable()
export class GeofenceService {
  // Coordenadas del taller Arellan Hnos — Surquillo, Lima
  private readonly TALLER_LAT = -12.1095
  private readonly TALLER_LNG = -77.0282
  private readonly RADIO_METROS = 200

  isInsideFence(lat: number, lng: number): boolean {
    const distancia = this.haversine(
      this.TALLER_LAT, this.TALLER_LNG,
      lat, lng
    )
    return distancia <= this.RADIO_METROS
  }

  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000  // Radio de la Tierra en metros
    const φ1 = (lat1 * Math.PI) / 180
    const φ2 = (lat2 * Math.PI) / 180
    const Δφ = ((lat2 - lat1) * Math.PI) / 180
    const Δλ = ((lon2 - lon1) * Math.PI) / 180

    const a = Math.sin(Δφ/2)**2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2)**2
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }
}
```

## Flujo de Autorización de Salida

```
Mecánico solicita salida (en arellan-mechanic-ui)
    │
    ▼
VehicleAuthorizationRequest → push a OWNER
    │
    ▼
Owner aprueba/rechaza en arellan-mobile-app (< 5 min)
    │
    ├── APROBADO: status=EN_USO_AUTORIZADO, ventana de tiempo activa
    └── RECHAZADO: notificación al mecánico
```

```typescript
@Injectable()
export class VehicleTrackingService {
  async processGpsUpdate(vehicleId: string, lat: number, lng: number): Promise<void> {
    const vehicle = await this.prisma.workshopVehicle.findUniqueOrThrow({
      where: { id: vehicleId },
      include: { authorizations: { where: { status: 'APPROVED' } } },
    })

    const insideFence = this.geofenceService.isInsideFence(lat, lng)
    const hasActiveAuth = vehicle.authorizations.some(
      auth => auth.estimatedReturn > new Date()
    )

    // Log de tracking (no audit — alta frecuencia)
    await this.prisma.vehicleTrackingLog.create({
      data: { vehicleId, lat, lng, insideFence }
    })

    if (!insideFence && !hasActiveAuth) {
      await this.activateJoyrideAlert(vehicle, lat, lng)
    }

    // Broadcast WebSocket para mapa en tiempo real
    this.eventsGateway.broadcastVehicleLocation(vehicleId, { lat, lng, insideFence })
  }

  private async activateJoyrideAlert(vehicle: WorkshopVehicle, lat: number, lng: number) {
    await this.prisma.workshopVehicle.update({
      where: { id: vehicle.id },
      data: { status: 'ALERTA_JOYRIDE' },
    })

    // Audit log inmutable
    await this.auditService.log({
      action: 'VEHICLE_JOYRIDE_ALERT',
      entityType: 'workshop_vehicles',
      entityId: vehicle.id,
      metadata: { lat, lng, plate: vehicle.plate },
    })

    // Push silencioso a todos los owners
    await this.notificationsService.pushToRole(UserRole.OWNER, {
      title: `⚠️ Vehículo fuera del taller`,
      body: `${vehicle.plate} salió del perímetro sin autorización`,
      data: { type: 'JOYRIDE_ALERT', vehicleId: vehicle.id },
      silent: false,
      priority: 'high',
    })

    // Bloquear app del mecánico asignado si hay uno
    if (vehicle.assignedTo) {
      await this.sessionsService.revokeUserSessions(vehicle.assignedTo)
    }
  }
}
```

## Playbook P1 — Vehículo Fuera de Perímetro

```
PASO 1: Sistema activa automáticamente
  → status = ALERTA_JOYRIDE
  → Push push a owners (inmediato)
  → Bloqueo app mecánico asignado

PASO 2: Owner verifica ubicación en tiempo real
  → arellan-mobile-app: mapa GPS con posición actual

PASO 3: Contactar al responsable asignado
  → Sistema muestra teléfono del empleado asignado

PASO 4: Si no responde en 10 minutos
  → Llamar directamente
  → Si no hay respuesta: denuncia policial (uso no autorizado de bien ajeno)

PASO 5: Al regreso
  → Fotografiar estado: km, combustible, daños
  → Registrar incidencia en módulo de personal
  → Evidencia queda en audit_log automáticamente
```

## Variables de Entorno

```env
GEOFENCE_LAT=-12.1095
GEOFENCE_LNG=-77.0282
GEOFENCE_RADIUS_METERS=200
GPS_UPDATE_INTERVAL_SECONDS=30
JOYRIDE_ALERT_GRACE_MINUTES=5   # Tiempo antes de activar alerta
VEHICLE_TRACKING_RETENTION_DAYS=365
```

## Hardware GPS Recomendado

| Dispositivo | Protocolo | Precio aprox. | Notas |
|-------------|-----------|---------------|-------|
| Teltonika FMB920 | HTTP REST + GPRS | ~$80 USD | Recomendado para MVP |
| Queclink GL300 | MQTT | ~$60 USD | Alternativa económica |
| Coban GPS303 | SMS + HTTP | ~$25 USD | Budget, menor precisión |

Para MVP se recomienda Teltonika FMB920 por su API REST estándar compatible directamente con este servicio.
