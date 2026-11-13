import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../AppContext.jsx'
import { db, ESPECIALIDADES } from '../../lib/db.js'
import { fechaCorta, hoyISO, sumarDias } from '../../lib/fechas.js'
import { Campo, Tarjeta, Cargando } from '../../components/Comunes.jsx'

// Cupo protegido para derivaciones de CAPS: primer paso, decisión de gestión con costo tecnológico cero.
export default function Cupos() {
  const { perfil, notificar, sincronizarAhora, enLinea } = useApp()
  const [nuevo, setNuevo] = useState({ especialidad: 'Cardiología', fecha: sumarDias(hoyISO(), 1), hora: '13:00' })

  const resumen = useLiveQuery(async () => {
    const hoy = hoyISO()
    const hasta = sumarDias(hoy, 28)
    const cupos = await db.cupos.where('fecha').between(hoy, hasta, false, true).filter((c) => c.hospitalId === perfil.efectorId).toArray()
    const espera = await db.derivaciones.where('estado').equals('sin_cupo').toArray()
    return ESPECIALIDADES.map((esp) => {
      const de = cupos.filter((c) => c.especialidad === esp)
      const usados = de.filter((c) => c.derivacionId).length
      const proximoLibre = de.filter((c) => !c.derivacionId && c.fecha > hoy).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))[0]
      return { esp, total: de.length, usados, proximoLibre, enEspera: espera.filter((d) => d.especialidad === esp).length }
    })
  }, [perfil.efectorId])

  if (!resumen) return <Cargando />

  const agregar = async (e) => {
    e.preventDefault()
    const id = `${perfil.efectorId}-${nuevo.especialidad}-${nuevo.fecha}-${nuevo.hora}`
    if (await db.cupos.get(id)) return notificar('Ese cupo ya existe.')
    await db.cupos.add({ id, hospitalId: perfil.efectorId, ...nuevo, derivacionId: null })
    notificar('Cupo protegido agregado.')
    if (enLinea) await sincronizarAhora()
  }

  return (
    <>
      <div className="encabezado"><h1>Cupo protegido para CAPS</h1></div>
      <p className="nota">Turnos reservados sólo para derivaciones del primer nivel. Se asignan en el momento de derivar. Próximas 4 semanas:</p>

      <div className="grilla-cupos">
        {resumen.map((r) => {
          const pct = r.total ? Math.round((r.usados / r.total) * 100) : 0
          return (
            <Tarjeta key={r.esp} titulo={r.esp}>
              <p className="cifra">{r.usados}<span className="cifra-de"> / {r.total} usados</span></p>
              <div className="barra" role="img" aria-label={`${pct}% de ocupación`}>
                <div className={`barra-relleno ${pct >= 85 ? 'barra-alerta' : ''}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="nota">Próximo libre: {r.proximoLibre ? `${fechaCorta(r.proximoLibre.fecha)} ${r.proximoLibre.hora}` : 'ninguno'}</p>
              {r.enEspera > 0 && <p className="campo-error">{r.enEspera} derivación(es) esperando cupo</p>}
            </Tarjeta>
          )
        })}
      </div>

      <form onSubmit={agregar}>
        <Tarjeta titulo="Agregar un cupo">
          <div className="grilla-3">
            <Campo label="Especialidad">
              <select value={nuevo.especialidad} onChange={(e) => setNuevo((n) => ({ ...n, especialidad: e.target.value }))}>
                {ESPECIALIDADES.map((e) => <option key={e}>{e}</option>)}
              </select>
            </Campo>
            <Campo label="Fecha">
              <input type="date" min={sumarDias(hoyISO(), 1)} value={nuevo.fecha} onChange={(e) => setNuevo((n) => ({ ...n, fecha: e.target.value }))} />
            </Campo>
            <Campo label="Hora">
              <input type="time" step="900" value={nuevo.hora} onChange={(e) => setNuevo((n) => ({ ...n, hora: e.target.value }))} />
            </Campo>
          </div>
          <button className="btn btn-primario">Agregar cupo</button>
        </Tarjeta>
      </form>
    </>
  )
}
