# Red CAPS · Derivación de circuito cerrado

PWA (React + Vite) que implementa la propuesta de mejora del Grupo 3 (Maestría en Transformación Digital, caso Ministerio Provincial de Salud): **derivación digital de circuito cerrado CAPS → hospital → CAPS con cupo protegido**, para toda la red pública de la Provincia de Buenos Aires (270 hospitales públicos y 1.081 CAPS en 133 partidos).

Usa la paleta institucional de la Provincia (cian `#009AAE` / `#007A8A`, fucsia `#E72276`, gris `#414042`) y la tipografía Encode Sans, tomadas del sitio de Salud Provincia en gba.gob.ar.

## Qué hace

| Perfil | Funciones |
|---|---|
| **Público** (sin ingreso) | **CAPS y hospital más cercano por geolocalización**, con distancia; búsqueda por nombre, partido o calle |
| **Paciente** (camino del ciudadano) | **Mi historia clínica** y registro de quién la consultó · Ingreso con DNI + fecha de nacimiento · mis turnos con estado en lenguaje claro · **confirmar, pedir otro día o cancelar** desde la app (el turno liberado vuelve al cupo y el CAPS ve la respuesta) · recordatorios (notificación al abrir la app y archivo de calendario con alarma 1 día y 2 h antes) · cómo llegar · indicaciones del especialista · controles agendados · **pedir un control** al CAPS · elegir cómo recibir avisos (app, papel, SMS, WhatsApp, llamada) |
| **CAPS** (administrativa / médico) | **Historia clínica única** · Pedidos de control hechos por pacientes desde la app, para agendar · Elección del CAPS por nombre/partido o “Cerca mío” · hospital de destino sugerido por cercanía (cualquiera de la red) · Nueva derivación con validación de DNI y aviso de posibles duplicados · sugerencia de especialidad a partir del texto (la confirma una persona) · detección de datos faltantes · turno asignado en el momento contra el cupo protegido · aviso multicanal (comprobante en papel, SMS, WhatsApp, llamada) y registro de la respuesta (confirma / otro día / no va) · contrarreferencia recibida · crónicos sin control en 12 meses y controles agendados por el hospital |
| **Hospital** (especialista / admisión) | **Historia clínica única** · contrarreferencia codificada con CIE-10 · Elección del hospital por cercanía · Agenda de derivados por especialidad con motivo, antecedentes y estudios · contrarreferencia de 3 campos (diagnóstico, indicación, próximo control) que agenda el control en el CAPS · ausentes · ocupación del cupo protegido y alta de cupos |
| **Gestión** | Filtro por partido · indicadores de las 3 metas del Plan contra la línea de base del Anexo 2026: demora pedido→turno (6,5 días), espera (34 / 68 días), inasistencia (29%), contrarreferencia (0%), diabéticos con control (45% → 60%) |

**Funciona sin conexión** (38 de los 120 CAPS no tienen conexión estable): la app queda instalada por el service worker y las derivaciones se guardan en el equipo (IndexedDB). Al volver la señal se sincronizan y se les asigna turno. El interruptor *Simular sin señal* permite probarlo con internet.

**Cómo llegar** se resuelve dentro de la app: mapa (Leaflet + OpenStreetMap) con recorrido a pie o en auto (OSRM de FOSSGIS), indicaciones en castellano, guía en vivo con la ubicación, recálculo si la persona se desvía y aviso de llegada. Sin conexión muestra distancia y rumbo en línea recta; los mapas ya vistos quedan en caché.

**Historia clínica única (HCU):** una sola historia por persona para toda la red pública (CAPS, hospitales y teleconsultas).
- Resumen: alergias destacadas, problemas de salud con codificación común **CIE-10**, medicación activa (agregar/suspender), signos y laboratorio con valores fuera de rango, alertas (sin control en 12 meses, HbA1c sobre objetivo).
- Línea de tiempo con consultas, controles, **teleconsultas** (hoy 0% registradas), derivaciones, consultas del especialista (la contrarreferencia se escribe sola en la historia) y controles agendados. Cada registro indica su fuente: Red CAPS, HIS hospitalario o papel digitalizado.
- Nueva evolución desde el CAPS o el hospital: tipo de atención, diagnóstico CIE-10, evolución, signos e indicaciones.
- **Identificador único:** detecta registros duplicados (mismo apellido y fecha de nacimiento, o DNI que difiere en un dígito) y los **unifica** en una sola historia, conservando el DNI anterior. El ejemplo de Rosa Medina tiene un duplicado con DNI mal transcripto en papel.
- El paciente ve su propia historia y **quién la consultó** (Ley 26.529 de derechos del paciente; Ley 25.326 de datos personales).
- Gestión: evoluciones registradas, teleconsultas registradas, % codificado con CIE-10 y duplicados unificados.

**Camino del ciudadano, sin repetir la app de 2021:** cada acción del paciente entra al mismo circuito de derivación (confirmaciones, reprogramaciones y pedidos de control le llegan al CAPS), en lugar de ser una pantalla aparte.

## Alcance del prototipo

- Los **establecimientos son reales** (ver *Padrón de establecimientos*). Pacientes y derivaciones son **ficticios** (piloto de demostración: HIGA General San Martín de La Plata y sus 4 CAPS más cercanos).
- El backend común es **Firebase** (ver *Backend en Firebase*): el paciente, el CAPS, el hospital y gestión ven los mismos datos desde distintos equipos.
- El ingreso del paciente con DNI + fecha de nacimiento es sólo para la demo (paciente ficticia: DNI 11234567, 14/03/1957). En producción debe validarse con Mi Argentina / RENAPER.
- La HCU de este prototipo no reemplaza a una historia clínica electrónica con validez legal: falta firma digital del profesional, control de acceso por rol y matrícula, y la integración con el HIS y la Red Nacional de Interoperabilidad (estándar HL7 FHIR).
- Los recordatorios con la app cerrada requieren un servidor de notificaciones push; hoy se cubren con el archivo de calendario. Cada hospital recibe una grilla estándar de cupo protegido la primera vez que se le deriva. "Sincronizar" asigna turno en la base local. Para el piloto real hace falta un backend con el padrón de pacientes, integración con el HIS / Red Nacional de Interoperabilidad, autenticación y el marco de la Ley 25.326.
- La sugerencia de especialidad usa reglas de palabras clave explicables; no toma decisiones clínicas.
- Desde la pantalla de inicio se puede *Reiniciar datos de demostración*.

## Backend en Firebase

Proyecto `capspba-560af` (Firestore + Authentication + Analytics). La base local (IndexedDB) sigue siendo la que usa la interfaz, así la app funciona sin conexión; `src/lib/nube.js` la sincroniza con Firestore:

- **Colecciones:** `pacientes`, `cupos`, `derivaciones`, `controles`, `encuentros`, `problemas`, `medicacion`, `accesos` (una por tabla, mismo ID) y `sistema/red-caps`. El padrón de establecimientos no se sube: sale de `establecimientos.json`.
- **Subida:** cada cambio local queda marcado `_sync = 0` y se sube en lotes al haber conexión (también al desactivar *Simular sin señal*).
- **Bajada en tiempo real:** un listener por colección trae lo que cambió desde la última vez (campo `_srv`, hora del servidor).
- **Conflictos:** gana el último cambio (`_mod`). Dos equipos sin conexión pueden asignar el mismo cupo; en producción la asignación de turnos debería hacerse en el servidor (transacción o Cloud Function).
- **Primer equipo:** si la nube está vacía, sube los datos de demostración de ese equipo. *Reiniciar datos de demostración* permite reiniciar sólo el equipo (vuelve a bajar la nube) o la nube para todos.

Configuración en la consola de Firebase (una vez):

1. **Authentication → Sign-in method → Anónimo:** habilitar.
2. **Firestore Database → Crear base de datos** (ubicación sugerida `southamerica-east1`).
3. Publicar las reglas de `firestore.rules`: pegarlas en *Firestore → Reglas* o con `npx firebase-tools deploy --only firestore`.
4. Si la app se publica en GitHub Pages, agregar `<usuario>.github.io` en *Authentication → Settings → Dominios autorizados*.

La configuración web está en `src/lib/firebaseConfig.js` (es pública por diseño; la protección la dan las reglas). `VITE_FIREBASE=off` desactiva la nube.

> Las reglas actuales sólo exigen sesión anónima: alcanzan para datos ficticios, **no para datos reales de pacientes**. Para eso hace falta autenticación por rol y matrícula y reglas por efector.

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
