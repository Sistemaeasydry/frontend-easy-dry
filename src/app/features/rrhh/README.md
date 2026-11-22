# Módulo RRHH

Tareas del personal y timbradas, con backend, web y app móvil. Qué roles se validan por ubicación y cuáles solo con foto: [RRHH-TIMBRADAS-ROLES.md](../../../../../RRHH-TIMBRADAS-ROLES.md).

## Quién lo ve

Por permisos del rol (Roles y Permisos), no por nombre de rol:

| Permiso | Qué da | Roles oficiales |
|---|---|---|
| `rrhh.timbrar` | Timbrar y ver el historial propio | Todos menos ADMIN y SUPER_ADMIN |
| `rrhh.tareas.propias` | Ver y completar las tareas que le asignaron | Todos menos ADMIN y SUPER_ADMIN |
| `rrhh.tareas.asignar` | Asignar tareas y revisar, devolver, cancelar o reasignar las que asignó | SUPER_ADMIN, ADMIN, SUPERVISOR, coordinadores, LIDER, BACKUP y AUXILIAR |
| `rrhh.timbradas.ver` | Ver las timbradas del equipo (foto, distancia, horas) | Los mismos que asignan tareas |
| `rrhh.ubicaciones.gestionar` | Fijar la ubicación y el radio de cada agencia y bodega | SUPER_ADMIN y ADMIN |

Cada quien ve y asigna solo dentro de su alcance (agencia, región o país). Los módulos del menú son `rrhh/tareas` y `rrhh/timbradas` (grupo «RRHH»).

| Pantalla | Ruta | Archivo |
|---|---|---|
| Tareas del personal («Mis tareas» y «Tareas asignadas») | `/rrhh/tareas` y `/rrhh/tareas/:id` | [rrhh-tareas.component.ts](rrhh-tareas.component.ts) |
| Timbradas («Timbrar» y «Timbradas del equipo») | `/rrhh/timbradas` | [rrhh-timbradas.component.ts](rrhh-timbradas.component.ts) |

## Archivos

| Archivo | Qué hace |
|---|---|
| `core/services/rrhh.service.ts` | Cliente HTTP del backend (`/rrhh/...`) y sus tipos. |
| `rrhh.modelos.ts` | Reglas puras de las pantallas: agrupar timbradas por día, tipos y límites de adjuntos. |
| `rrhh-adjuntos.component.ts` | Selector de archivos que los **sube al almacenamiento** al elegirlos; en solo lectura muestra los guardados con URL firmada. |
| `rrhh-ubicacion-sitio.component.ts` | Recuadro de ubicación y radio de una agencia o bodega (mapa MapLibre, guardado real y bitácora). |
| `rrhh-mapa-ubicacion.component.ts` | El mapa (MapLibre + OpenFreeMap) y el buscador de lugares (Nominatim). |
| `rrhh.modelos.spec.ts` | Pruebas de las reglas. |

## 1. Tareas

- Toda tarea tiene **un responsable obligatorio** (salvo las que nacen de un informe), título, descripción, fecha límite opcional y hasta 5 archivos de 10 MB (foto, video o PDF).
- Estados: **Pendiente → Completada → Revisada**, más **Cancelada**. **Vencida** no se guarda: es una Pendiente con la fecha límite pasada.
- El responsable la completa con una **respuesta** y **al menos una evidencia**. Quien la asignó (o un administrador) la **aprueba** o la **devuelve** a Pendiente con un motivo.
- Solo una Pendiente se cancela o se reasigna. Si el responsable se desactiva, la tarea sigue con él y aparece en «Sin responsable activo» para que alguien la reasigne.
- Se asigna **solo a personas del propio alcance**, nunca a uno mismo ni a un administrador.
- Cada tarea guarda con fecha y hora cada paso (asignada, completada, revisada, devuelta, cancelada, reasignada).
- **Avisos**: por la campana real, el tiempo real y el push del celular (asignada, completada, revisada, devuelta, cancelada, reasignada) y un aviso diario a las 06:30 de las tareas vencidas, una sola vez por tarea.
- **Desde un informe**: cada novedad tiene un «Responsable de la tarea» opcional que se guarda con el borrador. Al **guardar el informe de forma definitiva** el servidor crea una tarea Pendiente por cada novedad con responsable, en la misma transacción. Si un responsable no es válido (inactivo o fuera de tu alcance) el informe no se guarda y se avisa.

## 2. Timbradas

- Antes de las **12:00** la marca es **Entrada**; desde las **12:00**, **Salida**. Una de cada una por día. La **hora y el día los pone el servidor** (zona de Ecuador); la del dispositivo se guarda solo para auditar.
- La **foto es siempre de la cámara** (web y app). Sin cámara en la web, se timbra desde la app. La foto no puede repetirse en otra marca.
- **Ubicación**: quien tiene agencia o bodega asignada debe estar dentro del radio de su sitio y el GPS debe tener **120 m de precisión o mejor**; el servidor recalcula la distancia. Quien no tiene sitio asignado timbra solo con foto (se guarda igual la ubicación del dispositivo). Si el sitio no tiene ubicación guardada, la marca se acepta solo con foto y se avisa a los administradores.
- **Timbrar exige conexión**: no hay cola de sincronización para esto.
- Nadie edita ni borra una timbrada.
- «Timbradas del equipo» muestra el resumen por día, el filtro de días incompletos y, al abrir una hora, la foto con la distancia, la precisión y desde dónde se marcó. Un día con una sola marca queda **Incompleto**; un día sin marcas no aparece como falta, porque no hay turnos ni calendario.
- Los turnos que cruzan la medianoche quedan fuera por ahora.

## 3. Ubicación de agencias y bodegas

Quien tiene `rrhh.ubicaciones.gestionar` ve el recuadro violeta **«Ubicación … (RRHH)»**:

- en el formulario de **editar una agencia** (Sucursales), y
- en el formulario de **editar una bodega** (Inventario → Bodegas).

Se elige el punto con el **buscador de lugares** o en el **mapa** (clic o arrastrar el marcador), se escribe el **radio permitido** (30 a 500 m, 100 por defecto) y se pulsa «Guardar ubicación». Cada cambio queda en la bitácora con el valor anterior. Solo aparece con la agencia o bodega ya creada.

### Mapa y buscador (sin clave)

El mapa usa **MapLibre GL** con el mapa vectorial de **OpenFreeMap** (estilo `liberty`, cambiable en `ESTILO_MAPA`): gratis, sin clave y con uso comercial permitido. La librería se descarga solo al abrir el mapa.

- Mientras se escribe (pausa de 400 ms, mínimo 3 letras) salen sugerencias de **Photon** (`photon.komoot.io`, hecho para eso). Al pulsar Enter o «Buscar» se consulta **Nominatim**, que no permite buscar mientras se escribe y pide una consulta por segundo como máximo.
- El worker de MapLibre (`maplibre-gl-worker.mjs`) se copia a `assets/maplibre` desde `angular.json` y se indica con `setWorkerUrl`: sin eso el mapa falla con «Worker failed to load» al estar empaquetado.
- Necesita WebGL en el navegador; si no, el recuadro avisa y se escriben la latitud y la longitud a mano.
- En producción la Content-Security-Policy (`render.yaml`) permite `tiles.openfreemap.org`, `nominatim.openstreetmap.org`, `photon.komoot.io` y los workers `blob:` que usa MapLibre.

## Archivos y archivado

- Las fotos de timbrada y los adjuntos de tareas quedan en el bucket privado (`rrhh/timbradas/<usuario>/<mes>/` y `rrhh/tareas/<usuario>/`) y se sirven con URL firmada: los ve su dueño, quien tiene `rrhh.timbradas.ver` o asigna tareas dentro de su alcance, y los administradores. Siguen la regla de ciclo de vida de las demás evidencias.
- Las timbradas y las tareas **cerradas** (Revisada o Cancelada) se archivan a Parquet a los 12 meses, igual que el resto de la operación. El archivador sigue apagado por defecto (`ARCHIVADO_ACTIVO`).

## Backend

`backend-easydry/src/modules/rrhh/` (reglas puras en `rrhh.reglas.ts`; servicios de timbradas, tareas y ubicaciones; tarea diaria de vencidas). Tablas: `timbradas`, `tareas_rrhh` (+ adjuntos e historial), `ubicacion_cambios`, y las columnas de ubicación de `Agencia` y `bodegas`.

## Pendiente

- Turnos que cruzan la medianoche y correcciones de marcas (hoy una marca no se corrige).
- Reportes de RRHH (horas trabajadas por mes, días incompletos).
- Leer lo archivado de forma transparente en «Mis timbradas», «Timbradas del equipo» y «Tareas» (hoy solo está configurada su tabla para archivar).
