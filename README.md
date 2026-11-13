# Red CAPS · Derivación de circuito cerrado

PWA (React + Vite) que implementa la propuesta de mejora del Grupo 3 (Maestría en Transformación Digital, caso Ministerio Provincial de Salud): **derivación digital de circuito cerrado CAPS → hospital → CAPS con cupo protegido**, piloto en cardiología.

## Qué hace

| Perfil | Funciones |
|---|---|
| **CAPS** (administrativa / médico) | Nueva derivación con validación de DNI y aviso de posibles duplicados · sugerencia de especialidad a partir del texto (la confirma una persona) · detección de datos faltantes · turno asignado en el momento contra el cupo protegido · aviso multicanal (comprobante en papel, SMS, WhatsApp, llamada) y registro de la respuesta (confirma / otro día / no va) · contrarreferencia recibida · crónicos sin control en 12 meses y controles agendados por el hospital |
| **Hospital** (especialista / admisión) | Agenda de derivados por especialidad con motivo, antecedentes y estudios · contrarreferencia de 3 campos (diagnóstico, indicación, próximo control) que agenda el control en el CAPS · ausentes · ocupación del cupo protegido y alta de cupos |
| **Gestión** | Indicadores de las 3 metas del Plan contra la línea de base del Anexo 2026: demora pedido→turno (6,5 días), espera (34 / 68 días), inasistencia (29%), contrarreferencia (0%), diabéticos con control (45% → 60%) |

**Funciona sin conexión** (38 de los 120 CAPS no tienen conexión estable): la app queda instalada por el service worker y las derivaciones se guardan en el equipo (IndexedDB). Al volver la señal se sincronizan y se les asigna turno. El interruptor *Simular sin señal* permite probarlo con internet.

## Alcance del prototipo

- No hay servidor: todo se guarda en el navegador de cada equipo, con datos ficticios de demostración (un hospital y cuatro CAPS). "Sincronizar" asigna turno en la base local. Para el piloto real hace falta un backend con el padrón de pacientes, integración con el HIS / Red Nacional de Interoperabilidad, autenticación y el marco de la Ley 25.326.
- La sugerencia de especialidad usa reglas de palabras clave explicables; no toma decisiones clínicas.
- Desde la pantalla de inicio se puede *Reiniciar datos de demostración*.

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
