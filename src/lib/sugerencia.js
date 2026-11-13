// Asistente de derivación (Entregable 2, A4): lee el texto del formulario para
// SUGERIR la especialidad y detectar datos faltantes. No decide nada clínico:
// una persona confirma cada sugerencia. Reglas simples y explicables, sin IA externa.

const REGLAS = {
  'Cardiología': ['precordial', 'palpitacion', 'soplo', 'arritmia', 'taquicardia', 'hipertension', 'presion alta', 'disnea', 'edema', 'sincope', 'ecg', 'electrocardiograma', 'angina', 'infarto', 'insuficiencia cardiaca'],
  'Endocrinología': ['diabetes', 'glucemia', 'hba1c', 'hemoglobina glicosilada', 'insulina', 'metformina', 'tiroides', 'hipotiroidismo', 'hipertiroidismo', 'obesidad', 'hipoglucemia'],
  'Nefrología': ['creatinina', 'rinon', 'renal', 'proteinuria', 'microalbuminuria', 'filtrado', 'dialisis', 'urea'],
  'Oftalmología': ['fondo de ojo', 'vision', 'retina', 'retinopatia', 'ojo', 'agudeza visual', 'catarata', 'glaucoma'],
}

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function sugerirEspecialidad(texto) {
  const t = norm(texto)
  if (t.trim().length < 6) return null
  const puntajes = Object.entries(REGLAS)
    .map(([esp, claves]) => ({ esp, claves: claves.filter((k) => t.includes(k)) }))
    .filter((x) => x.claves.length > 0)
    .sort((a, b) => b.claves.length - a.claves.length)
  if (!puntajes.length) return null
  return { especialidad: puntajes[0].esp, porque: puntajes[0].claves, alternativas: puntajes.slice(1).map((x) => x.esp) }
}

/** Datos que el especialista necesita para recibir bien al paciente (persona: Dr. Acosta). */
export function datosFaltantes({ motivo, antecedentes, estudios, telefono, canal }) {
  const faltan = []
  if (norm(motivo).trim().length < 15) faltan.push('Motivo de derivación más detallado')
  if (!norm(antecedentes).trim()) faltan.push('Antecedentes (diagnósticos, medicación)')
  if (!norm(estudios).trim()) faltan.push('Estudios realizados (o "ninguno")')
  if (canal && canal !== 'papel' && !String(telefono ?? '').trim()) faltan.push('Teléfono para avisar el turno')
  return faltan
}
