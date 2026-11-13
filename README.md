# Red CAPS · Derivación de circuito cerrado

PWA (React + Vite) que implementa la propuesta de mejora del Grupo 3 (Maestría en Transformación Digital, caso Ministerio Provincial de Salud): **derivación digital de circuito cerrado CAPS → hospital → CAPS con cupo protegido**, para toda la red pública de la Provincia de Buenos Aires (270 hospitales públicos y 1.081 CAPS en 133 partidos).

Usa la paleta institucional de la Provincia (cian `#009AAE` / `#007A8A`, fucsia `#E72276`, gris `#414042`) y la tipografía Encode Sans, tomadas del sitio de Salud Provincia en gba.gob.ar.

## Qué hace

| Perfil | Funciones |
|---|---|
| **Público** (sin ingreso) | **CAPS y hospital más cercano por geolocalización**, con distancia; búsqueda por nombre, partido o calle |
| **Paciente** (camino del ciudadano) | Ingreso con DNI + fecha de nacimiento · mis turnos con estado en lenguaje claro · **confirmar, pedir otro día o cancelar** desde la app (el turno liberado vuelve al cupo y el CAPS ve la respuesta) · recordatorios (notificación al abrir la app y archivo de calendario con alarma 1 día y 2 h antes) · cómo llegar · indicaciones del especialista · controles agendados · **pedir un control** al CAPS · elegir cómo recibir avisos (app, papel, SMS, WhatsApp, llamada) |
| **CAPS** (administrativa / médico) | Pedidos de control hechos por pacientes desde la app, para agendar · Elección del CAPS por nombre/partido o “Cerca mío” · hospital de destino sugerido por cercanía (cualquiera de la red) · Nueva derivación con validación de DNI y aviso de posibles duplicados · sugerencia de especialidad a partir del texto (la confirma una persona) · detección de datos faltantes · turno asignado en el momento contra el cupo protegido · aviso multicanal (comprobante en papel, SMS, WhatsApp, llamada) y registro de la respuesta (confirma / otro día / no va) · contrarreferencia recibida · crónicos sin control en 12 meses y controles agendados por el hospital |
| **Hospital** (especialista / admisión) | Elección del hospital por cercanía · Agenda de derivados por especialidad con motivo, antecedentes y estudios · contrarreferencia de 3 campos (diagnóstico, indicación, próximo control) que agenda el control en el CAPS · ausentes · ocupación del cupo protegido y alta de cupos |
| **Gestión** | Filtro por partido · indicadores de las 3 metas del Plan contra la línea de base del Anexo 2026: demora pedido→turno (6,5 días), espera (34 / 68 días), inasistencia (29%), contrarreferencia (0%), diabéticos con control (45% → 60%) |

**Funciona sin conexión** (38 de los 120 CAPS no tienen conexión estable): la app queda instalada por el service worker y las derivaciones se guardan en el equipo (IndexedDB). Al volver la señal se sincronizan y se les asigna turno. El interruptor *Simular sin señal* permite probarlo con internet.

**Cómo llegar** se resuelve dentro de la app: mapa (Leaflet + OpenStreetMap) con recorrido a pie o en auto (OSRM de FOSSGIS), indicaciones en castellano, guía en vivo con la ubicación, recálculo si la persona se desvía y aviso de llegada. Sin conexión muestra distancia y rumbo en línea recta; los mapas ya vistos quedan en caché.

**Camino del ciudadano, sin repetir la app de 2021:** cada acción del paciente entra al mismo circuito de derivación (confirmaciones, reprogramaciones y pedidos de control le llegan al CAPS), en lugar de ser una pantalla aparte.

## Alcance del prototipo

- Los **establecimientos son reales** (ver *Padrón de establecimientos*). Pacientes y derivaciones son **ficticios** (piloto de demostración: HIGA General San Martín de La Plata y sus 4 CAPS más cercanos).
- No hay servidor: todo se guarda en el navegador de cada equipo, así que el paciente y el CAPS "se ven" sólo si usan el mismo dispositivo. En producción esto va contra un backend común.
- El ingreso del paciente con DNI + fecha de nacimiento es sólo para la demo (paciente ficticia: DNI 11234567, 14/03/1957). En producción debe validarse con Mi Argentina / RENAPER.
- Los recordatorios con la app cerrada requieren un servidor de notificaciones push; hoy se cubren con el archivo de calendario. Cada hospital recibe una grilla estándar de cupo protegido la primera vez que se le deriva. "Sincronizar" asigna turno en la base local. Para el piloto real hace falta un backend con el padrón de pacientes, integración con el HIS / Red Nacional de Interoperabilidad, autenticación y el marco de la Ley 25.326.
- La sugerencia de especialidad usa reglas de palabras clave explicables; no toma decisiones clínicas.
- Desde la pantalla de inicio se puede *Reiniciar datos de demostración*.

## Padrón de establecimientos

`public/data/establecimientos.json` se genera con:

```bash
npm run establecimientos
```

Toma hospitales públicos y centros de atención primaria (CAPS, unidades sanitarias, salas de primeros auxilios, centros de salud) de **OpenStreetMap** vía Overpass API, descarta los privados y asigna el partido con la **API Georef** (datos.gob.ar). OSM puede tener faltantes o nombres desactualizados: para producción conviene reemplazarlo por el padrón oficial del Ministerio (catálogo de datos abiertos de la Provincia, dataset *establecimientos-salud*, o REFES), manteniendo el mismo formato. El padrón se cachea en el dispositivo y funciona sin conexión.

## Desarrollo

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # genera dist/ con el service worker
npm run preview   # sirve el build (para probar la PWA y el modo sin conexión)
npm run icons     # regenera los íconos desde public/favicon.svg
```

## Publicación

El workflow `.github/workflows/deploy.yml` publica en GitHub Pages en cada push a `main`. Hay que activarlo una vez en **Settings → Pages → Source: GitHub Actions**. La app queda en `https://<usuario>.github.io/CAPSPBA/`.

## Estructura

```
src/
  lib/          db (Dexie/IndexedDB), datos demo, circuito (turnos, sync, contrarreferencia),
                pacientes (DNI, duplicados), sugerencia, mensajes, fechas
  components/   Layout (barra, estado de conexión), aviso de actualización PWA
  pages/        caps/, hospital/, gestion/
```
