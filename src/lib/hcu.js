import { db, nuevoId } from './db.js'
import { aISO, hoyISO } from './fechas.js'

// Historia Clínica Única (HCU): una sola historia por persona para toda la red
// (CAPS, hospitales, teleconsultas), con codificación común CIE-10.

/** Catálogo CIE-10 reducido para el primer nivel y las especialidades del piloto. */
export const CIE10 = [
  ['E11', 'Diabetes mellitus tipo 2'],
  ['E10', 'Diabetes mellitus tipo 1'],
  ['H36.0', 'Retinopatía diabética'],
  ['I10', 'Hipertensión esencial (primaria)'],
  ['I11', 'Enfermedad cardíaca hipertensiva'],
  ['I20', 'Angina de pecho'],
  ['I25', 'Enfermedad isquémica crónica del corazón'],
  ['I48', 'Fibrilación y aleteo auricular'],
  ['I50', 'Insuficiencia cardíaca'],
  ['R00.2', 'Palpitaciones'],
  ['R01.1', 'Soplo cardíaco, no especificado'],
  ['R07.4', 'Dolor en el pecho, no especificado'],
  ['E78', 'Dislipemia (trastornos del metabolismo de lipoproteínas)'],
  ['E66', 'Obesidad'],
  ['E03', 'Hipotiroidismo'],
  ['N18', 'Enfermedad renal crónica'],
  ['J44', 'Enfermedad pulmonar obstructiva crónica (EPOC)'],
  ['J45', 'Asma'],
  ['F32', 'Episodio depresivo'],
  ['M54.5', 'Lumbalgia'],
  ['Z00.0', 'Examen médico general'],
  ['Z76.0', 'Consulta para repetición de receta'],
].map(([codigo, texto]) => ({ codigo, texto }))

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function buscarCIE(texto, max = 6) {
  const palabras = norm(texto).split(/\s+/).filter(Boolean)
  if (!palabras.length) return []
  return CIE10.filter((c) => {
    const t = norm(`${c.codigo} ${c.texto}`)
    return palabras.every((w) => t.includes(w))
  }).slice(0, max)
}

export const CRONICO_A_CIE = { DBT: 'E11', HTA: 'I10' }
export const cie = (codigo) => CIE10.find((c) => c.codigo === codigo) ?? { codigo, texto: codigo }

export const TIPOS_ENCUENTRO = {
  consulta: 'Consulta',
  control: 'Control de crónico',
  teleconsulta: 'Teleconsulta',
  especialista: 'Consulta con especialista',
  guardia: 'Guardia',
}

export const FUENTES = {
  red: 'Red CAPS',
  his: 'HIS hospitalario',
  papel: 'Papel digitalizado',
}

/** Paciente principal: si el registro fue unificado, se sigue al principal. */
export async function pacientePrincipal(id) {
  let p = await db.pacientes.get(id)
  for (let i = 0; p?.fusionadoCon && i < 5; i++) p = await db.pacientes.get(p.fusionadoCon)
  return p
}

/** Toda la historia de una persona, ordenada de lo más reciente a lo más antiguo. */
export async function obtenerHistoria(pacienteId) {
  const [paciente, encuentros, problemas, medicacion, derivaciones, controles] = await Promise.all([
    db.pacientes.get(pacienteId),
    db.encuentros.where('pacienteId').equals(pacienteId).toArray(),
    db.problemas.where('pacienteId').equals(pacienteId).toArray(),
    db.medicacion.where('pacienteId').equals(pacienteId).toArray(),
    db.derivaciones.where('pacienteId').equals(pacienteId).toArray(),
    db.controles.where('pacienteId').equals(pacienteId).toArray(),
  ])
  const idsEfectores = [...new Set([...encuentros.map((e) => e.efectorId), ...derivaciones.flatMap((d) => [d.capsId, d.hospitalId]), paciente?.capsId])].filter(Boolean)
  const efectores = Object.fromEntries((await db.efectores.bulkGet(idsEfectores)).filter(Boolean).map((e) => [e.id, e]))

  const linea = []
  for (const e of encuentros) {
    linea.push({ id: e.id, clase: 'encuentro', tipo: e.tipo, fecha: e.fecha, orden: e.creadoEn ?? 0, titulo: TIPOS_ENCUENTRO[e.tipo] ?? e.tipo, efector: efectores[e.efectorId], dato: e })
  }
  for (const d of derivaciones) {
    linea.push({ id: `der-${d.id}`, clase: 'derivacion', tipo: 'derivacion', fecha: aISO(new Date(d.creadaEn)), orden: d.creadaEn, titulo: `Derivación a ${d.especialidad}`, efector: efectores[d.capsId], destino: efectores[d.hospitalId], dato: d })
  }
  for (const c of controles) {
    if (c.estado === 'agendado' && c.fecha >= hoyISO()) {
      linea.push({ id: `ctl-${c.id}`, clase: 'control', tipo: 'control_agendado', fecha: c.fecha, orden: 0, titulo: 'Control agendado', efector: efectores[c.capsId], dato: c, futuro: true })
    }
  }
  linea.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.orden - a.orden)

  const conSignos = encuentros.filter((e) => e.signos && Object.values(e.signos).some((v) => v != null && v !== '')).sort((a, b) => b.fecha.localeCompare(a.fecha))
  return {
    paciente,
    caps: efectores[paciente?.capsId],
    linea,
    problemas: problemas.sort((a, b) => (a.estado === b.estado ? b.desde.localeCompare(a.desde) : a.estado === 'activo' ? -1 : 1)),
    medicacion: medicacion.sort((a, b) => (a.activa === b.activa ? b.desde.localeCompare(a.desde) : a.activa ? -1 : 1)),
    signos: conSignos.slice(0, 6).map((e) => ({ fecha: e.fecha, ...e.signos })),
    efectores,
  }
}

/** Registra una evolución (consulta, control, teleconsulta…) y actualiza la lista de problemas. */
export async function registrarEncuentro(pacienteId, datos) {
  const id = nuevoId()
  await db.transaction('rw', db.encuentros, db.problemas, db.pacientes, async () => {
    await db.encuentros.add({ id, pacienteId, fuente: 'red', creadoEn: Date.now(), fecha: hoyISO(), ...datos })
    for (const dx of datos.diagnosticos ?? []) await agregarProblema(pacienteId, dx, datos.fecha ?? hoyISO(), true)
    if (['control', 'consulta', 'teleconsulta'].includes(datos.tipo)) {
      const p = await db.pacientes.get(pacienteId)
      const f = datos.fecha ?? hoyISO()
      if (!p.ultimoControl || p.ultimoControl < f) await db.pacientes.update(pacienteId, { ultimoControl: f })
    }
  })
  return id
}

/** Agrega un problema a la lista si no está activo con el mismo código. */
export async function agregarProblema(pacienteId, { codigo, texto }, desde = hoyISO(), silencioso = false) {
  const existentes = await db.problemas.where('pacienteId').equals(pacienteId).toArray()
  const igual = existentes.find((p) => p.estado === 'activo' && ((codigo && p.codigo === codigo) || (!codigo && norm(p.texto) === norm(texto))))
  if (igual) return igual.id
  // Diagnósticos sintomáticos (R…) o de consulta (Z…) no se agregan solos a la lista de problemas.
  if (silencioso && codigo && /^[RZ]/.test(codigo)) return null
  const id = nuevoId()
  await db.problemas.add({ id, pacienteId, codigo: codigo ?? null, texto, desde, estado: 'activo' })
  return id
}

export async function resolverProblema(id) {
  await db.problemas.update(id, { estado: 'resuelto', hasta: hoyISO() })
}

export async function agregarMedicacion(pacienteId, { droga, dosis, prescriptor }) {
  await db.medicacion.add({ id: nuevoId(), pacienteId, droga: droga.trim(), dosis: dosis.trim(), prescriptor, desde: hoyISO(), activa: true })
}

export async function suspenderMedicacion(id) {
  await db.medicacion.update(id, { activa: false, hasta: hoyISO() })
}

export async function guardarAlergias(pacienteId, alergias) {
  await db.pacientes.update(pacienteId, { alergias })
}

/**
 * Unifica dos registros de la misma persona (identificador único).
 * Todo lo del duplicado pasa al principal; el duplicado queda marcado y redirige.
 */
export async function unificarPacientes(principalId, duplicadoId, quien) {
  const tablas = [db.derivaciones, db.controles, db.encuentros, db.problemas, db.medicacion, db.accesos]
  await db.transaction('rw', [db.pacientes, ...tablas], async () => {
    const [a, b] = await Promise.all([db.pacientes.get(principalId), db.pacientes.get(duplicadoId)])
    for (const t of tablas) await t.where('pacienteId').equals(duplicadoId).modify({ pacienteId: principalId })
    await db.pacientes.update(principalId, {
      alergias: [...new Set([...(a.alergias ?? []), ...(b.alergias ?? [])])],
      cronico: [...new Set([...(a.cronico ?? []), ...(b.cronico ?? [])])],
      ultimoControl: [a.ultimoControl, b.ultimoControl].filter(Boolean).sort().pop() ?? null,
      telefono: a.telefono || b.telefono || '',
      dnisAnteriores: [...new Set([...(a.dnisAnteriores ?? []), b.dni])],
    })
    await db.pacientes.update(duplicadoId, { fusionadoCon: principalId, fusionadoEn: Date.now(), fusionadoPor: quien })
  })
}

/** Registro de accesos (Ley 26.529 / 25.326): quién consultó la historia y cuándo. */
export async function registrarAcceso(pacienteId, perfil, efectorNombre) {
  if (!perfil || perfil.rol === 'paciente') return
  // Un registro por perfil y paciente cada 30 minutos, para no llenar el historial.
  const ultimo = await db.accesos.where('pacienteId').equals(pacienteId).reverse().sortBy('fecha')
  const reciente = ultimo.find((a) => a.efectorId === perfil.efectorId && a.rol === perfil.rol)
  if (reciente && Date.now() - reciente.fecha < 30 * 60_000) return
  await db.accesos.add({ id: nuevoId(), pacienteId, rol: perfil.rol, efectorId: perfil.efectorId ?? null, efector: efectorNombre ?? null, fecha: Date.now() })
}

export const nombreProfesional = () => {
  try {
    return localStorage.getItem('profesional') ?? ''
  } catch {
    return ''
  }
}
export const recordarProfesional = (n) => {
  try {
    localStorage.setItem('profesional', n)
  } catch {
    /* no disponible */
  }
}
