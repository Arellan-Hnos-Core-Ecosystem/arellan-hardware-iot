# arellan-hardware-iot — Integración Hardware e IoT

Repositorio macro que agrupa todos los módulos de integración con hardware físico del taller: control biométrico ZKTeco, rastreo GPS de vehículos y sensores IoT del ambiente de trabajo.

## Submódulos

| Submódulo | Descripción | Fase |
|-----------|-------------|------|
| `arellan-iot-hardware-bridge` | Bridge NestJS para ZKTeco ADMS (asistencia biométrica) | Fase 1 MVP |
| `arellan-vehicle-tracking` | GPS geofencing + control de uso de vehículos del taller | Fase 1 MVP |
| `arellan-workshop-iot` | Sensores ambiente: compresoras, consumo eléctrico, presencia, almacén | Fase 2+ |

## Arquitectura General

```
Hardware Físico
    │
    ├── ZKTeco BioTime 8.0 (TCP/IP ADMS)
    │       └── arellan-iot-hardware-bridge ──→ BullMQ ──→ arellan-platform
    │
    ├── GPS Tracker (vehículos taller)
    │       └── arellan-vehicle-tracking ──→ WebSocket ──→ arellan-mobile-app
    │
    └── Sensores IoT (workshop)
            └── arellan-workshop-iot ──→ MQTT Broker ──→ arellan-platform
```

## Acceso

Acceso restringido: únicamente propietarios (Edgar, Juan) y equipo técnico autorizado. Ningún empleado operativo tiene acceso a este repositorio.

## Stack Común

- **Runtime:** Node.js 20 LTS + TypeScript 5.x
- **Framework:** NestJS 10 (bridge/tracking) / MicroPython (sensores)
- **Comunicación:** ADMS over TCP/IP, MQTT v3.1.1, WebSocket
- **Infraestructura:** Railway (MVP) → AWS IoT Core (producción)
