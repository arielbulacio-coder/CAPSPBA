import { db } from './db.js'

/** Valida el formato de un DNI argentino (7 u 8 dígitos, sin puntos). */
export function validarDNI(raw) {
  const dni = String(raw ?? '').replace(/[.\s-]/g, '')
  if (!dni) return { ok: false, dni, error: 'Ingresá el DNI.' }
  if (!/^\d+$/.test(dni)) return { ok: false, dni, error: 'El DNI sólo lleva números.' }
  if (dni.length < 7 || dni.length > 8) return { ok: false, dni, error: 'El DNI tiene 7 u 8 dígitos.' }
  if (/^(\d)\1+$/.test(dni)) return { ok: false, dni, error: 'El DNI no puede ser un mismo dígito repetido.' }
  return { ok: true, dni, error: null }
}

const normalizar = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Busca posibles duplicados (hoy el 12% de los registros lo son):
 * mismo apellido + misma fecha de nacimiento con distinto DNI, o DNI casi igual (un dígito de diferencia).
 */
export async function buscarPosiblesDuplicados({ dni, apellido, fechaNac }) {
  const todos = await db.pacientes.toArray()
  return todos.filter((p) => {
    if (p.dni === dni || p.fusionadoCon) return false
    const mismaPersona = apellido && fechaNac && normalizar(p.apellido) === normalizar(apellido) && p.fechaNac === fechaNac
    const dniParecido = dni && p.dni.length === dni.length && [...p.dni].filter((c, i) => c !== dni[i]).length === 1
    return mismaPersona || dniParecido
  })
}

export const nombreCompleto = (p) => (p ? `${p.apellido}, ${p.nombre}` : '—')
