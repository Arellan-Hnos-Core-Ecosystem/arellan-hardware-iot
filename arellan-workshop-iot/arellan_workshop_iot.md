# arellan-workshop-iot — Sensores IoT del Taller

Módulo de monitoreo ambiental e instrumental del taller mediante sensores IoT. Cubre compresoras de aire, consumo eléctrico, presencia en zonas restringidas y control de apertura del almacén de repuestos.

**Fase de activación:** Fase 2 (post-MVP). No bloquea el lanzamiento de Fase 1.

## Sensores y Casos de Uso

| Sensor | Zona | Caso de Uso |
|--------|------|-------------|
| Temperatura + humedad (DHT22) | Almacén de repuestos | Detectar condiciones que dañen inventario sensible |
| Corriente eléctrica (ACS712) | Tablero eléctrico principal | Alertar consumo anómalo (equipo encendido fuera de horario) |
| Presión de aire (BMP280) | Línea de compresor | Monitorear estado del compresor, alertar caída de presión |
| PIR presencia (HC-SR501) | Almacén + oficina contabilidad | Detectar presencia fuera de horario laboral |
| Apertura magnético (MC-38) | Puerta almacén repuestos | Registrar cada apertura con timestamp en audit_log |
| Vibración (SW-420) | Vehículos en piso | Detectar movimiento de vehículo de cliente fuera de OT activa |

## Arquitectura

```
Sensores físicos (ESP32 / Raspberry Pi)
    │
    │  MQTT v3.1.1
    ▼
MQTT Broker (Mosquitto en Railway / AWS IoT Core en prod)
    │
    │  Subscribe topics: arellan/workshop/#
    ▼
IoT Bridge Service (NestJS)
    │
    ├── Persistir lecturas en time-series DB (TimescaleDB o InfluxDB)
    ├── Evaluar reglas de alerta
    └── Emitir eventos a BullMQ → NotificationWorker
```

## Topics MQTT

```
arellan/workshop/power/consumption        # Consumo eléctrico (watts)
arellan/workshop/compressor/pressure      # Presión compresor (PSI)
arellan/workshop/storage/door/state       # open|closed
arellan/workshop/storage/presence         # detected|clear
arellan/workshop/office/presence          # detected|clear (oficina contabilidad)
arellan/workshop/vehicle/{plate}/vibration # detected|clear
arellan/workshop/environment/temp         # Temperatura almacén (°C)
arellan/workshop/environment/humidity     # Humedad almacén (%)
```

## Payload MQTT (JSON estándar)

```json
{
  "deviceId": "ESP32-ALMACEN-01",
  "topic": "arellan/workshop/storage/door/state",
  "value": "open",
  "timestamp": "2024-01-15T22:45:00.000Z",
  "battery": 87
}
```

## Firmware ESP32 (MicroPython)

```python
import network
import umqtt.simple as mqtt
import ujson
import time
from machine import Pin

# Config
WIFI_SSID = "ARELLAN_WORKSHOP"
WIFI_PASS = "***"
MQTT_BROKER = "mqtt.arellan.pe"
DEVICE_ID = "ESP32-ALMACEN-01"

# Sensor apertura almacén
door_sensor = Pin(4, Pin.IN, Pin.PULL_UP)

def on_door_change(pin):
    state = "open" if not pin.value() else "closed"
    payload = ujson.dumps({
        "deviceId": DEVICE_ID,
        "topic": "arellan/workshop/storage/door/state",
        "value": state,
        "timestamp": time.time(),
    })
    client.publish("arellan/workshop/storage/door/state", payload)

door_sensor.irq(trigger=Pin.IRQ_FALLING | Pin.IRQ_RISING, handler=on_door_change)
```

## Reglas de Alerta

| Condición | Severidad | Acción |
|-----------|-----------|--------|
| Puerta almacén abierta > 30 min | Media | Push a ADMIN |
| Presencia en almacén fuera de horario (antes 7AM / después 8PM) | Alta | Push silencioso a OWNER + audit_log |
| Presencia en oficina contabilidad fuera de horario | Alta | Push silencioso a OWNER + audit_log |
| Consumo eléctrico > 150% promedio diario | Media | Push a ADMIN |
| Presión compresor < 80 PSI por > 10 min | Media | Push a ADMIN (posible falla) |
| Vibración en vehículo de cliente sin OT activa | Alta | Push a OWNER + MECHANIC_SUPERVISOR |
| Temperatura almacén > 35°C o < 5°C | Media | Push a ADMIN |

## Regla Crítica: Presencia + Audit Log

Cualquier presencia detectada fuera del horario laboral en zonas restringidas (almacén, oficina contabilidad) genera un registro en `audit_logs` con la misma inmutabilidad que las acciones del sistema. Esto proporciona evidencia física correlacionable con acciones digitales.

```typescript
@Injectable()
export class IoTAlertService {
  async handleStoragePresence(detected: boolean, timestamp: Date): Promise<void> {
    if (!detected) return

    const isAfterHours = !this.isWorkingHours(timestamp)
    if (!isAfterHours) return

    // Registrar en audit_log — evidencia inmutable
    await this.auditService.log({
      action: 'IOT_AFTER_HOURS_PRESENCE',
      entityType: 'workshop_zones',
      entityId: 'storage_room',
      metadata: {
        sensor: 'PIR-ALMACEN-01',
        timestamp: timestamp.toISOString(),
        zone: 'storage',
      },
    })

    // Push silencioso a owners
    await this.notificationsService.pushToRole(UserRole.OWNER, {
      title: 'Presencia detectada — Almacén',
      body: `Movimiento detectado en almacén a las ${format(timestamp, 'HH:mm')}`,
      data: { type: 'AFTER_HOURS_PRESENCE', zone: 'storage' },
      silent: true,  // No hacer ruido, solo registrar
    })
  }

  private isWorkingHours(date: Date): boolean {
    const hour = date.getHours()
    const day = date.getDay()
    // Lunes-Sábado 7AM-8PM
    return day >= 1 && day <= 6 && hour >= 7 && hour < 20
  }
}
```

## Dashboard IoT (Grafana)

Panel de monitoreo en tiempo real disponible en `grafana.arellan.pe/d/workshop-iot`:

- **Consumo eléctrico:** gráfica de línea 24h + promedio semanal
- **Presión compresor:** gauge con zonas OK/alerta/crítico
- **Aperturas almacén:** timeline de eventos del día
- **Temperatura/humedad:** gráfica histórica 7 días
- **Mapa de presencia:** heatmap por hora del día (semana actual)

## Variables de Entorno

```env
MQTT_BROKER_URL=mqtt://mqtt.arellan.pe:1883
MQTT_USERNAME=iot-bridge
MQTT_PASSWORD=<secret>
MQTT_TOPICS_PREFIX=arellan/workshop
IOT_AFTER_HOURS_START=20   # 8 PM
IOT_AFTER_HOURS_END=7      # 7 AM
COMPRESSOR_MIN_PSI=80
STORAGE_DOOR_ALERT_MINUTES=30
TIMESCALE_CONNECTION_STRING=<db-url>
```

## Integración con Sistema Principal

Los eventos IoT críticos se propagan al sistema principal vía BullMQ:

```typescript
// Queue: iot-alerts
// Job: iot.alert.created
interface IotAlertJob {
  type: 'AFTER_HOURS_PRESENCE' | 'DOOR_OPEN_EXTENDED' | 'POWER_ANOMALY' | 'COMPRESSOR_FAILURE'
  zone: string
  deviceId: string
  value: unknown
  timestamp: string
}
```

Las alertas de presencia se correlacionan automáticamente con el audit_log para detectar si hubo actividad en el sistema digital al mismo tiempo que se detectó presencia física.
