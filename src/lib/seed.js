import { diasHabiles, habil, hoyISO, sumarDias, desdeISO } from './fechas.js'
import { masCercanos } from './geo.js'

// Pacientes y derivaciones FICTICIOS para demostrar el circuito. Los establecimientos
// son reales (padrón provincial); el piloto se arma con un hospital y sus 4 CAPS más cercanos.
async function elegirPiloto(db) {
  const hospitales = await db.efectores.where('tipo').equals('hospital').toArray()
  const hospital =
    hospitales.find((h) => h.partido === 'La Plata' && /general san mart[ií]n/i.test(h.nombre)) ??
    hospitales.find((h) => /interzonal general de agudos/i.test(h.nombre)) ??
    hospitales[0]
  const caps = masCercanos(await db.efectores.where('tipo').equals('caps').toArray(), hospital, 4)
  return { hospital, caps }
}

// cronico: DBT = diabetes, HTA = hipertensión. ultimoControl en días hacia atrás (null = nunca).
const PACIENTES = [
  ['Rosa', 'Medina', '11234567', '1957-03-14', 'C1', ['DBT', 'HTA'], 'papel', '', 400],
  ['Juan Carlos', 'Peralta', '13456789', '1960-08-02', 'C1', ['HTA'], 'llamada', '2364551234', 120],
  ['Elsa', 'Gómez', '16789012', '1963-11-21', 'C1', ['DBT'], 'whatsapp', '2364559876', null],
  ['Ramón', 'Quiroga', '12890345', '1955-01-30', 'C1', ['DBT', 'HTA'], 'sms', '2364553322', 700],
  ['Norma', 'Ledesma', '20111222', '1968-06-09', 'C2', ['DBT'], 'whatsapp', '2364112233', 200],
  ['Héctor', 'Villalba', '14222333', '1959-04-17', 'C2', ['HTA'], 'sms', '2364114455', 30],
  ['Graciela', 'Sosa', '17333444', '1965-12-01', 'C2', ['DBT', 'HTA'], 'llamada', '2364116677', 500],
  ['Miguel', 'Benítez', '22444555', '1971-09-12', 'C3', ['DBT'], 'whatsapp', '2364228899', 90],
  ['Silvia', 'Acuña', '18555666', '1966-02-25', 'C3', ['HTA'], 'sms', '2364221100', 250],
  ['Oscar', 'Fernández', '10666777', '1952-07-07', 'C3', ['DBT'], 'papel', '', null],
  ['Teresa', 'Ojeda', '15777888', '1962-10-15', 'C4', ['DBT', 'HTA'], 'llamada', '2364335544', 380],
  ['Alberto', 'Ríos', '13888999', '1958-05-28', 'C4', ['HTA'], 'papel', '', 60],
  ['Lucía', 'Paz', '30999000', '1984-03-03', 'C3', [], 'whatsapp', '2364220011', null],
  ['Daniel', 'Castro', '28123123', '1980-11-11', 'C2', [], 'sms', '2364117788', null],
]

// Cupos protegidos para derivaciones de CAPS: decisión de gestión, costo tecnológico cero.
const CUPOS_POR_DIA = { 'Cardiología': ['08:00', '08:30', '09:00', '09:30'], 'Endocrinología': ['10:00', '10:30'], 'Nefrología': ['11:00'], 'Oftalmología': ['12:00'] }

// Días hábiles en los que hay agenda de cada especialidad (lun=1 ... vie=5).
const DIAS_ESPECIALIDAD = { 'Cardiología': [1, 2, 3, 4, 5], 'Endocrinología': [2, 4], 'Nefrología': [3], 'Oftalmología': [1, 5] }

export function generarCupos(hospitalId, desde, hasta) {
  const cupos = []
  for (const fecha of diasHabiles(desde, hasta)) {
    const dow = desdeISO(fecha).getDay()
    for (const [esp, horas] of Object.entries(CUPOS_POR_DIA)) {
      if (!DIAS_ESPECIALIDAD[esp].includes(dow)) continue
      for (const hora of horas) {
        cupos.push({ id: `${hospitalId}-${esp}-${fecha}-${hora}`, hospitalId, especialidad: esp, fecha, hora, derivacionId: null })
      }
    }
  }
  return cupos
}

export async function cargarDatosDemo(db) {
  const { hospital: HOSPITAL, caps } = await elegirPiloto(db)
  if (!HOSPITAL || caps.length < 4) return
  const capsDe = { C1: caps[0].id, C2: caps[1].id, C3: caps[2].id, C4: caps[3].id }
  const hoy = hoyISO()
  const ts = (diasAtras, hora = 10) => {
    const d = desdeISO(sumarDias(hoy, -diasAtras))
    d.setHours(hora, 15)
    return d.getTime()
  }

  const pacientes = PACIENTES.map(([nombre, apellido, dni, fechaNac, capsId, cronico, canal, telefono, ultimo], i) => ({
    id: `P${i + 1}`, nombre, apellido, dni, fechaNac, capsId: capsDe[capsId], cronico, canal, telefono,
    ultimoControl: ultimo == null ? null : sumarDias(hoy, -ultimo),
  }))

  const cupos = generarCupos(HOSPITAL.id, -40, 45)
  const libre = (esp, desdeDia) => cupos.find((c) => c.especialidad === esp && !c.derivacionId && c.fecha >= sumarDias(hoy, desdeDia))

  // Historia reciente del piloto, para que el tablero de gestión tenga datos.
  const historicas = [
    { p: 'P2', esp: 'Cardiología', hace: 35, turnoDia: -30, estado: 'contrarreferido', cr: ['Cardiopatía hipertensiva leve', 'Enalapril 10 mg cada 12 h. Dieta hiposódica.', 90] },
    { p: 'P6', esp: 'Cardiología', hace: 33, turnoDia: -28, estado: 'contrarreferido', cr: ['HTA estadio 1, ECG normal', 'Continuar tratamiento. Control de TA semanal en CAPS.', 60] },
    { p: 'P8', esp: 'Endocrinología', hace: 30, turnoDia: -25, estado: 'contrarreferido', cr: ['DBT2 con mal control metabólico', 'Ajuste de metformina 850 mg c/12 h. HbA1c en 3 meses.', 30] },
    { p: 'P9', esp: 'Cardiología', hace: 26, turnoDia: -21, estado: 'ausente' },
    { p: 'P12', esp: 'Cardiología', hace: 20, turnoDia: -14, estado: 'contrarreferido', cr: ['Soplo funcional, sin cardiopatía estructural', 'Sin tratamiento. Alta de cardiología.', 180] },
    { p: 'P5', esp: 'Oftalmología', hace: 18, turnoDia: -10, estado: 'contrarreferido', cr: ['Retinopatía diabética no proliferativa leve', 'Control glucémico estricto. Fondo de ojo anual.', 365] },
    { p: 'P14', esp: 'Cardiología', hace: 12, turnoDia: -5, estado: 'atendido' },
    { p: 'P7', esp: 'Nefrología', hace: 8, turnoDia: 2, estado: 'confirmado' },
    { p: 'P11', esp: 'Cardiología', hace: 3, turnoDia: 1, estado: 'turno_asignado' },
    { p: 'P3', esp: 'Endocrinología', hace: 2, turnoDia: 3, estado: 'confirmado' },
    { p: 'P1', esp: 'Endocrinología', hace: 45, turnoDia: -38, estado: 'contrarreferido', cr: ['DBT2 con control regular', 'Metformina 850 mg con almuerzo y cena. Caminar 30 minutos por día.', 60] },
    { p: 'P1', esp: 'Cardiología', hace: 1, turnoDia: 4, estado: 'turno_asignado' },
  ]

  const derivaciones = []
  const controles = []
  for (const [i, h] of historicas.entries()) {
    const pac = pacientes.find((x) => x.id === h.p)
    const cupo = libre(h.esp, h.turnoDia)
    const id = `D-demo-${i + 1}`
    cupo.derivacionId = id
    const creadaEn = ts(h.hace, 9)
    const d = {
      id, pacienteId: pac.id, capsId: pac.capsId, hospitalId: HOSPITAL.id, especialidad: h.esp,
      motivo: MOTIVOS[h.esp], antecedentes: pac.cronico.length ? `Paciente con ${pac.cronico.join(' + ')} en seguimiento en CAPS.` : '',
      estudios: 'Laboratorio de rutina', prioridad: 'programada', estado: h.estado, sincronizada: 1,
      creadaEn, asignadaEn: creadaEn + 3 * 60_000, turnoId: cupo.id, turnoFecha: cupo.fecha, turnoHora: cupo.hora,
      aviso: { canal: pac.canal, enviado: true, respuesta: ['confirmado', 'contrarreferido', 'atendido'].includes(h.estado) ? 'confirmado' : null },
      contrarreferencia: null,
    }
    if (h.cr) {
      const [diagnostico, indicacion, dias] = h.cr
      const proximoControl = habil(sumarDias(cupo.fecha, dias))
      d.contrarreferencia = { diagnostico, indicacion, proximoControl, profesional: 'Dr. Martín Acosta', fecha: ts(-h.turnoDia, 12) }
      controles.push({ id: `K-demo-${i + 1}`, pacienteId: pac.id, capsId: pac.capsId, fecha: proximoControl, motivo: `Control post ${h.esp.toLowerCase()}: ${indicacion}`, derivacionId: id, estado: 'agendado' })
    }
    derivaciones.push(d)
  }

  await db.transaction('rw', db.pacientes, db.cupos, db.derivaciones, db.controles, async () => {
    await db.pacientes.bulkAdd(pacientes)
    await db.cupos.bulkAdd(cupos)
    await db.derivaciones.bulkAdd(derivaciones)
    await db.controles.bulkAdd(controles)
  })
}

const MOTIVOS = {
  'Cardiología': 'Hipertensión de difícil control, refiere palpitaciones.',
  'Endocrinología': 'Diabetes tipo 2 con glucemias elevadas pese al tratamiento.',
  'Nefrología': 'Creatinina elevada en paciente diabético hipertenso.',
  'Oftalmología': 'Fondo de ojo anual por diabetes.',
}
