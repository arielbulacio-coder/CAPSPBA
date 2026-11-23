// Portafolio y roadmap de transformación digital (Entregables 3 y 4, Grupo 4).
// Fuente: Entregable_3_Grupo_4_2026.docx (matriz ponderada, dependencias, trampas)
// y Roadmap_portafolio_TD_2026_Grupo_4.xlsx (cronograma 2027–2029).

export const ANIO_INICIO = 2027
export const PRESUPUESTO_USD = 4_600_000

// Primer año por trimestre; segundo y tercero por semestre.
export const PERIODOS = [
  { id: '27T1', anio: 2027, label: 'T1' },
  { id: '27T2', anio: 2027, label: 'T2' },
  { id: '27T3', anio: 2027, label: 'T3' },
  { id: '27T4', anio: 2027, label: 'T4' },
  { id: '28S1', anio: 2028, label: 'S1' },
  { id: '28S2', anio: 2028, label: 'S2' },
  { id: '29S1', anio: 2029, label: 'S1' },
  { id: '29S2', anio: 2029, label: 'S2' },
]

export const HORIZONTES = {
  H1: { nombre: 'Fundar', desc: 'Lo que habilita al resto' },
  H2: { nombre: 'Integrar y optimizar', desc: 'Conectar lo fundado y mejorar procesos' },
  H3: { nombre: 'Escalar', desc: 'Extender a la red y sumar inteligencia' },
}

export const METAS = [
  { id: 'M1', titulo: 'Espera para especialista', base: '34 días', meta: '20 días' },
  { id: 'M2', titulo: 'Crónicos con control', base: '45%', meta: '60%' },
  { id: 'M3', titulo: 'Internaciones evitables', base: '3.200', meta: '−15%' },
]

export const PROGRAMAS = [
  {
    id: 'PR1',
    nombre: 'Base digital y gobierno del dato',
    iniciativas: [
      {
        prioridad: 1, id: 'P00', nombre: 'Gobierno y unidad ejecutora', horizonte: 'H1', puntaje: null,
        alcance: 'Unidad ejecutora BID con dedicación, comité de priorización mensual y roles de datos y ciberseguridad. No incluye compras.',
        objetivo: 'Habilitante de las 3 metas del Plan', metas: ['M1', 'M2', 'M3'],
        periodos: ['27T1', '27T2'], depende: [],
        hito: 'Unidad ejecutora conformada y comité sesionando (T1)',
        responsable: 'Subsecretaría de Gestión', indicador: '% de fondos BID comprometidos',
        riesgo: 'M', baseMeta: '0% → 50% en 12 meses', sponsor: 'Ministro de Salud',
      },
      {
        prioridad: 3, id: 'P10', nombre: 'Decisión del HIS', horizonte: 'H1', puntaje: 3.4,
        alcance: 'Documentar el modelo de datos del HIS y decidir renovar, migrar o construir antes del vencimiento del contrato.',
        objetivo: 'Habilitante de las 3 metas del Plan', metas: ['M1', 'M2', 'M3'],
        periodos: ['27T1', '27T2', '27T3', '27T4', '28S1'], depende: ['P00'],
        hito: 'Modelo de datos documentado y decisión tomada (T2); contrato firmado antes del mes 14 (2028 · S1)',
        responsable: 'Dir. Gral. de Administración + Dirección de Sistemas', indicador: 'Decisión tomada con el modelo de datos documentado',
        riesgo: 'A', baseMeta: 'Sin documentar → documentado en el mes 4', sponsor: 'Subsecretario de Gestión',
      },
      {
        prioridad: 4, id: 'P04', nombre: 'Identificador único de paciente', horizonte: 'H1', puntaje: 3.0,
        alcance: 'Índice maestro de pacientes con DNI validado y un responsable del dato; empieza por la red piloto.',
        objetivo: 'Habilitante de las 3 metas del Plan', metas: ['M1', 'M2', 'M3'],
        periodos: ['27T3', '27T4', '28S1'], depende: ['P00', 'P10'],
        hito: 'Índice maestro en uso en la red piloto (T4)',
        responsable: 'Responsable de datos (rol a crear)', indicador: '% de registros de pacientes duplicados',
        riesgo: 'A', baseMeta: '12% → 5% (red piloto)', sponsor: 'Subsecretario de Gestión',
        enApp: 'Historia clínica única: búsqueda por DNI y unificación de registros duplicados.',
      },
      {
        prioridad: 7, id: 'P06', nombre: 'Conectividad y receta electrónica en CAPS', horizonte: 'H2', puntaje: 3.2,
        alcance: 'Conectividad para los 38 CAPS sin conexión estable y receta electrónica en el primer nivel (Ley 27.553).',
        objetivo: 'Cumplimiento de la Ley 27.553; habilitante de la Meta 2', metas: ['M2'],
        periodos: ['27T4', '28S1', '28S2'], depende: ['P00'],
        hito: 'Licitación de conectividad lanzada (T4); 20 CAPS con receta electrónica (2028 · S2)',
        responsable: 'Dirección de Sistemas + Coordinación de APS', indicador: '% de recetas en papel en los CAPS',
        riesgo: 'M', baseMeta: '100% → 80%; CAPS sin conexión: 38 → 20', sponsor: 'Subsecretario de Gestión',
        enApp: 'Modo sin conexión: el CAPS carga sin señal y sincroniza después.',
      },
    ],
  },
  {
    id: 'PR2',
    nombre: 'Derivación de circuito cerrado',
    iniciativas: [
      {
        prioridad: 2, id: 'P01', nombre: 'Cupo protegido para derivaciones', horizonte: 'H1', puntaje: 4.85,
        alcance: 'Reservar turnos de cardiología para derivaciones de CAPS en el hospital piloto. Decisión de gestión, sin tecnología.',
        objetivo: 'Meta 1 · espera de especialidad de 34 a 20 días', metas: ['M1'],
        periodos: ['27T1', '27T2'], depende: [],
        hito: 'Cupo de cardiología reservado y en uso (T1)',
        responsable: 'Jefatura de cardiología del hospital piloto', indicador: 'Días del pedido de derivación al turno',
        riesgo: 'M', baseMeta: '6,5 → 2 días; espera de cardiología 68 → 45 días', sponsor: 'Subsecretario de Gestión',
        enApp: 'Hospital › Cupo protegido: cupos reservados por especialidad.',
      },
      {
        prioridad: 5, id: 'P02', nombre: 'Derivación digital con contrarreferencia', horizonte: 'H1', puntaje: 3.75,
        alcance: 'Circuito CAPS → hospital → CAPS digital y trazable, con firma digital y contrarreferencia de 3 campos. Piloto en una red; la escala provincial espera a P04.',
        objetivo: 'Meta 1 · espera de 34 a 20 días; Meta 2 · crónicos con control del 45% al 60%', metas: ['M1', 'M2'],
        periodos: ['27T3', '27T4', '28S1', '28S2'], depende: ['P00', 'P01'],
        hito: 'Primera derivación digital con contrarreferencia en la red piloto (T3)',
        responsable: 'Unidad ejecutora BID; dueña del proceso: Coordinación de APS', indicador: '% de derivaciones con contrarreferencia',
        riesgo: 'A', baseMeta: '0% → 70% (piloto)', sponsor: 'Subsecretario de Gestión',
        enApp: 'CAPS › Nueva derivación con turno; Hospital › Atención con contrarreferencia.',
      },
      {
        prioridad: 6, id: 'P03', nombre: 'Recordatorios multicanal', horizonte: 'H2', puntaje: 3.5,
        alcance: 'Aviso por SMS, WhatsApp o llamada 48 h antes de los turnos derivados, con opción de reprogramar. Sin datos clínicos en el mensaje.',
        objetivo: 'Meta 1 · espera de especialidad de 34 a 20 días', metas: ['M1'],
        periodos: ['28S1', '28S2'], depende: ['P02'],
        hito: 'Recordatorios activos en todos los turnos derivados del piloto (2028 · S1)',
        responsable: 'Mesa de derivaciones del hospital piloto', indicador: '% de inasistencia en turnos derivados',
        riesgo: 'M', baseMeta: '29% → 20%', sponsor: 'Subsecretario de Gestión',
        enApp: 'Paciente › Mis turnos: confirmar, reprogramar y recordatorios.',
      },
      {
        prioridad: 8, id: 'P05', nombre: 'Agenda única de turnos', horizonte: 'H2', puntaje: 2.65,
        alcance: 'Una sola agenda para portal, ventanilla y teléfono en los hospitales con HIS, para conocer la demanda total.',
        objetivo: 'Meta 1 · espera de especialidad de 34 a 20 días', metas: ['M1'],
        periodos: ['28S2', '29S1'], depende: ['P04'],
        hito: 'Agenda única en uso en el hospital piloto (2028 · S2)',
        responsable: 'Dirección de Hospitales', indicador: '% de turnos registrados en la agenda única',
        riesgo: 'M', baseMeta: '38% (sólo portal) → 100%', sponsor: 'Subsecretario de Gestión',
      },
      {
        prioridad: 12, id: 'P13', nombre: 'Asistente IA de clasificación de derivaciones', horizonte: 'H3', puntaje: null,
        alcance: 'Sugiere la especialidad y marca datos faltantes en el formulario de derivación; una persona confirma. Nunca asigna turnos ni sugiere conducta clínica.',
        objetivo: 'Meta 1 · espera de especialidad de 34 a 20 días', metas: ['M1'],
        periodos: ['29S2'], depende: ['P02', 'P00'],
        hito: 'Prueba en sombra de 8 semanas completada en la red piloto (2029 · S2)',
        responsable: 'Jefatura de la mesa de derivaciones', indicador: 'Derivaciones devueltas por datos faltantes',
        riesgo: 'A', baseMeta: 'Línea de base a medir en la prueba en sombra', sponsor: 'Subsecretario de Gestión',
        enApp: 'CAPS › Nueva derivación: sugerencia de especialidad por reglas y aviso de datos faltantes (sin IA externa).',
      },
    ],
  },
  {
    id: 'PR3',
    nombre: 'Continuidad del cuidado y datos para decidir',
    iniciativas: [
      {
        prioridad: 9, id: 'P07', nombre: 'Seguimiento de crónicos en el primer nivel', horizonte: 'H3', puntaje: 3.3,
        alcance: 'Lista de pacientes con diabetes o hipertensión sin control, para que el CAPS los cite. Regla simple, sin IA.',
        objetivo: 'Meta 2 · crónicos con control del 45% al 60%; Meta 3 · −15% internaciones evitables', metas: ['M2', 'M3'],
        periodos: ['29S1', '29S2'], depende: ['P04', 'P02'],
        hito: 'Lista de crónicos sin control en uso en los CAPS de la red piloto (2029 · S1)',
        responsable: 'Coordinación de APS', indicador: '% de diabéticos con control registrado en 12 meses',
        riesgo: 'M', baseMeta: '45% → 60% (meta del Plan)', sponsor: 'Subsecretario de Gestión',
        enApp: 'CAPS › Crónicos y controles: lista de pacientes sin control.',
      },
      {
        prioridad: 10, id: 'P08', nombre: 'Teleconsultas registradas en HCE', horizonte: 'H2', puntaje: 3.05,
        alcance: 'Que cada teleconsulta quede registrada en la historia clínica del paciente en los 2 hospitales que las hacen.',
        objetivo: 'Meta 2 · crónicos con control del 45% al 60%', metas: ['M2'],
        periodos: ['28S2'], depende: ['P04'],
        hito: 'Teleconsultas registradas en HCE en los 2 hospitales (2028 · S2)',
        responsable: 'Dirección de los 2 hospitales con teleconsulta', indicador: '% de teleconsultas registradas en HCE',
        riesgo: 'M', baseMeta: '0% de 4.100 por año → 80%', sponsor: 'Subsecretario de Gestión',
        enApp: 'Historia clínica: evolución de tipo teleconsulta.',
      },
      {
        prioridad: 11, id: 'P09', nombre: 'Parte de camas digital', horizonte: 'H2', puntaje: 3.35,
        alcance: 'Reemplazar el parte de camas por WhatsApp por una carga en el HIS de los 4 hospitales que lo tienen.',
        objetivo: 'Meta 3 · −15% internaciones evitables', metas: ['M3'],
        periodos: ['29S1'], depende: ['P10'],
        hito: 'Parte de camas cargado en el HIS en los 4 hospitales (2029 · S1)',
        responsable: 'Dirección de Hospitales', indicador: '% de partes de camas incompletos',
        riesgo: 'B', baseMeta: '14% → menos de 5%', sponsor: 'Subsecretario de Gestión',
      },
    ],
  },
]

export const INICIATIVAS = PROGRAMAS.flatMap((p) => p.iniciativas.map((i) => ({ ...i, programa: p.nombre })))

// ── Matriz ponderada (Entregable 3) ──────────────────────────────────────────
export const CRITERIOS = [
  { id: 'alin', nombre: 'Alineación con las metas del Plan', corto: 'Alin', peso: 15, porque: 'Las 3 metas son públicas y auditables: lo que no las mueve no se justifica ante el Ministro.' },
  { id: 'val', nombre: 'Valor / impacto en el paciente', corto: 'Val', peso: 15, porque: '9.400 derivaciones, 41.000 diabéticos, 3.200 internaciones: el impacto es el fin.' },
  { id: 'urg', nombre: 'Urgencia', corto: 'Urg', peso: 15, porque: 'Dos fechas duras: el HIS vence en 14 meses y el préstamo BID se pierde a los 24.' },
  { id: 'fact', nombre: 'Factibilidad (capacidad de ejecución)', corto: 'Fact', peso: 15, porque: '22 personas para 134 efectores y USD 4 millones: lo que no se puede ejecutar vale cero.' },
  { id: 'cost', nombre: 'Esfuerzo / costo inicial', corto: 'Cost', peso: 5, porque: 'Pesa poco: el dinero alcanza (USD 600.000 propios + BID). Lo escaso son las personas y el plazo.' },
  { id: 'dato', nombre: 'Madurez del dato', corto: 'Dato', peso: 15, porque: 'Sin identificador único, una iniciativa que necesita datos integrados depende de otra.' },
  { id: 'rec', nombre: 'Costo recurrente', corto: 'Rec', peso: 10, porque: 'El BID financia inversión, no gasto mensual: conectividad, licencias y nube salen del presupuesto corriente.' },
  { id: 'reg', nombre: 'Riesgo regulatorio y de datos', corto: 'Reg', peso: 10, porque: 'Datos sensibles (Ley 25.326), firma digital, receta electrónica obligatoria y régimen de compras.' },
]

// Puntajes 1–5 (5 = mejor; en costo, recurrente y riesgo, 5 = bajo).
export const MATRIZ = [
  { id: 'P01', nombre: 'Cupo protegido para derivaciones', p: [5, 4, 5, 5, 5, 5, 5, 5], cuadrante: 'Quick win', decision: 'entra' },
  { id: 'P02', nombre: 'Derivación digital con contrarreferencia', p: [5, 5, 4, 3, 3, 3, 3, 3], cuadrante: 'Gran apuesta', decision: 'entra' },
  { id: 'P03', nombre: 'Recordatorios multicanal', p: [4, 3, 3, 4, 5, 3, 3, 4], cuadrante: 'Quick win', decision: 'entra' },
  { id: 'P10', nombre: 'Decisión del HIS (modelo de datos)', p: [3, 3, 5, 3, 3, 3, 3, 4], cuadrante: 'Gran apuesta', decision: 'entra', nota: 'fecha dura' },
  { id: 'P09', nombre: 'Parte de camas digital', p: [2, 2, 2, 4, 5, 4, 5, 5], cuadrante: 'Relleno', decision: 'espera', nota: 'no mueve metas' },
  { id: 'P07', nombre: 'Seguimiento de crónicos (lista, sin IA)', p: [5, 4, 2, 3, 4, 2, 4, 3], cuadrante: 'Gran apuesta', decision: 'espera', nota: 'necesita P04 y P02' },
  { id: 'P06', nombre: 'Receta electrónica y conectividad CAPS', p: [3, 3, 4, 3, 3, 4, 1, 4], cuadrante: 'Gran apuesta', decision: 'entra', nota: 'ley + plazo BID' },
  { id: 'P08', nombre: 'Teleconsultas registradas en HCE', p: [3, 2, 2, 4, 5, 3, 4, 3], cuadrante: 'Relleno', decision: 'espera', nota: 'necesita P04' },
  { id: 'P04', nombre: 'Identificador único de paciente', p: [4, 3, 5, 2, 2, 2, 3, 2], cuadrante: 'Gran apuesta', decision: 'entra', nota: 'dependencia' },
  { id: 'P05', nombre: 'Agenda única de turnos', p: [4, 3, 2, 2, 2, 2, 3, 3], cuadrante: 'Gran apuesta', decision: 'espera', nota: 'necesita P04' },
  { id: 'P12', nombre: 'HCE única provincial', p: [5, 5, 2, 1, 1, 1, 1, 2], cuadrante: 'Trampa', decision: 'descarta', nota: '«big bang» sin identificador ni modelo de datos' },
  { id: 'P11', nombre: 'IA de riesgo de reingreso', p: [4, 4, 1, 1, 2, 1, 2, 1], cuadrante: 'Trampa', decision: 'descarta', nota: 'sin datos de CAPS para validarla: sesgo estructural' },
]

export const puntajePonderado = (p) => p.reduce((s, v, i) => s + v * CRITERIOS[i].peso, 0) / 100

export const DECISIONES = {
  entra: { label: 'Entra', tono: 'ok' },
  espera: { label: 'Espera', tono: 'alerta' },
  descarta: { label: 'Se descarta', tono: 'error' },
}

export const TRAMPAS = [
  {
    titulo: 'El préstamo se pierde si el trámite de compra se come el plazo',
    texto: 'Con licitaciones de 5 a 9 meses, todo lo que supere USD 90.000 y se financie con el BID tiene que estar especificado y licitado antes del mes 12. Por eso entran ya la unidad ejecutora, la decisión del HIS (P10), el identificador único (P04) y la conectividad de los CAPS (P06); se descarta la HCE única provincial (P12). No se fraccionan compras para evitar la licitación; los pilotos de menos de USD 90.000 van con fondos propios.',
  },
  {
    titulo: 'El cupo protegido no cuesta un peso de tecnología',
    texto: 'La matriz lo pone primero (4,85) porque no le cobra por no ser tecnológico: entra en el mes 1 como decisión de gestión, fuera del régimen de compras. La trampa sería dejarlo afuera por «no ser TD». Se acompaña con un indicador de control (que no suba la espera de los no derivados) y con P02 para medirlo.',
  },
]

export const BRECHAS = [
  { dimension: 'Estrategia de negocio', estado: 'Plan Provincial de Salud con 3 metas auditables.', alineacion: 'Clara, sin proyecto ni responsable', tono: 'info' },
  { dimension: 'Estrategia TI / digital', estado: 'No existe. Sistemas depende de Administración; el comité no se reúne desde 2023.', alineacion: 'Nula', tono: 'error' },
  { dimension: 'Procesos y organización', estado: 'Estandarizados en 4 de 134 efectores. 22 personas, ningún perfil de datos.', alineacion: 'Baja', tono: 'alerta' },
  { dimension: 'Arquitectura, datos e integración', estado: 'Sin identificador único (6% sin DNI válido, 12% duplicados), HCE en 4 de 14 hospitales, 120 CAPS en papel.', alineacion: 'Baja · brecha que bloquea', tono: 'error' },
]

export const CADENA = [
  'Responsable de datos + decisión del HIS (P10)',
  'Identificador único (P04)',
  'Integración: P02 a escala, P05, P08',
  'Seguimiento de crónicos (P07)',
  'Recién entonces IA (P11)',
]

/** Valida el roadmap: ninguna iniciativa arranca antes que algo de lo que depende. */
export function conflictosDependencias() {
  const idx = Object.fromEntries(PERIODOS.map((p, i) => [p.id, i]))
  const porId = Object.fromEntries(INICIATIVAS.map((i) => [i.id, i]))
  const inicio = (i) => Math.min(...i.periodos.map((p) => idx[p]))
  const out = []
  for (const i of INICIATIVAS) {
    for (const d of i.depende) {
      const dep = porId[d]
      if (dep && inicio(dep) > inicio(i)) out.push({ iniciativa: i.id, depende: d })
    }
  }
  return out
}

export const enParalelo = () => PERIODOS.map((p) => INICIATIVAS.filter((i) => i.periodos.includes(p.id)).length)
