import { fechaLarga } from './fechas.js'

/** Texto del aviso de turno: corto, claro y con opción de hablar con una persona. */
export function textoAviso({ paciente, derivacion, hospital, caps }) {
  return (
    `Hola ${paciente.nombre}. Tenés turno de ${derivacion.especialidad} el ${fechaLarga(derivacion.turnoFecha)} ` +
    `a las ${derivacion.turnoHora} h en ${hospital.nombre}. Llevá tu DNI y los estudios. ` +
    `Respondé 1 para confirmar o 2 para cambiar el día. Si preferís hablar con alguien, acercate al ${caps.nombre}.`
  )
}

const soloDigitos = (t) => String(t ?? '').replace(/\D/g, '')

/** Enlaces para abrir el canal en el teléfono de la administrativa. */
export function enlaceCanal(canal, telefono, texto) {
  const tel = soloDigitos(telefono)
  if (!tel) return null
  if (canal === 'whatsapp') return `https://wa.me/549${tel}?text=${encodeURIComponent(texto)}`
  if (canal === 'sms') return `sms:+549${tel}?body=${encodeURIComponent(texto)}`
  if (canal === 'llamada') return `tel:+549${tel}`
  return null
}
