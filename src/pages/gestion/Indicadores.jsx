import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db.js'
import { aISO, difDias, hoyISO, sumarDias } from '../../lib/fechas.js'
import { Tarjeta, Cargando } from '../../components/Comunes.jsx'

const prom = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const pct = (n, d) => (d ? Math.round((n / d) * 100) : null)
const fmt = (v, dec = 1) => (v == null ? '—' : v.toLocaleString('es-AR', { maximumFractionDigits: dec }))

function Indicador({ titulo, valor, unidad, base, meta, mejorSi = 'menor', n }) {
  let tono = ''
  if (valor != null && base != null) tono = (mejorSi === 'menor' ? valor < base : valor > base) ? 'ind-mejor' : 'ind-peor'
  return (
    <div className={`indicador ${tono}`}>
      <span className="ind-titulo">{titulo}</span>
      <span className="ind-valor">{fmt(valor)}<span className="ind-unidad">{unidad}</span></span>
      <span className="ind-ref">
        {base != null && <>Línea de base: {fmt(base)}{unidad}</>}
        {meta != null && <> · Meta: {fmt(meta)}{unidad}</>}
      </span>
      {n != null && <span className="ind-n">n = {n}</span>}
    </div>
  )
}

export default function Indicadores() {
  const [partido, setPartido] = useState('')
  const datos = useLiveQuery(async () => {
    const [todas, todosPac, efectores, partidos] = await Promise.all([
      db.derivaciones.toArray(), db.pacientes.toArray(), db.efectores.toArray(), db.efectores.orderBy('partido').uniqueKeys(),
    ])
    const encuentros = await db.encuentros.toArray()
    return { todas, todosPac, efectores, partidos, encuentros }
  }, [])
  if (!datos) return <Cargando />
  const { todas, todosPac: conDuplicados, efectores, partidos, encuentros } = datos
  const todosPac = conDuplicados.filter((p) => !p.fusionadoCon)
  const unificados = conDuplicados.length - todosPac.length
  const efPorId = Object.fromEntries(efectores.map((e) => [e.id, e]))
  const enPartido = (capsId) => !partido || efPorId[capsId]?.partido === partido
  const ders = todas.filter((d) => enPartido(d.capsId))
  const pacientes = todosPac.filter((p) => enPartido(p.capsId))
  const hospitalesRed = new Set(todas.map((d) => d.hospitalId)).size
  const capsRed = new Set(todas.map((d) => d.capsId)).size

  const conTurno = ders.filter((d) => d.asignadaEn)
  const demoraAsignacion = prom(conTurno.map((d) => (d.asignadaEn - d.creadaEn) / 86_400_000))
  const espera = (lista) => prom(lista.map((d) => difDias(aISO(new Date(d.creadaEn)), d.turnoFecha)))
  const esperaTotal = espera(conTurno)
  const esperaCardio = espera(conTurno.filter((d) => d.especialidad === 'Cardiología'))

  const atendidos = ders.filter((d) => ['atendido', 'contrarreferido'].includes(d.estado))
  const contra = ders.filter((d) => d.estado === 'contrarreferido')
  const ausentes = ders.filter((d) => d.estado === 'ausente')

  const futuros = ders.filter((d) => ['turno_asignado', 'confirmado'].includes(d.estado))
  const confirmados = futuros.filter((d) => d.estado === 'confirmado')

  const hace12m = sumarDias(hoyISO(), -365)
  const dbt = pacientes.filter((p) => p.cronico?.includes('DBT'))
  const dbtAlDia = dbt.filter((p) => p.ultimoControl && p.ultimoControl >= hace12m)

  const pendSync = ders.filter((d) => d.sincronizada === 0).length
  const sinCupo = ders.filter((d) => d.estado === 'sin_cupo').length

  const caps = efectores.filter((e) => e.tipo === 'caps' && enPartido(e.id) && (ders.some((d) => d.capsId === e.id) || pacientes.some((p) => p.capsId === e.id)))

  return (
    <>
      <div className="encabezado">
        <h1>Indicadores {partido ? `· ${partido}` : 'provinciales'}</h1>
        <select value={partido} onChange={(e) => setPartido(e.target.value)} aria-label="Filtrar por partido">
          <option value="">Toda la provincia</option>
          {partidos.map((p) => <option key={p}>{p}</option>)}
        </select>
      </div>
      <p className="nota">
        Red: {efectores.filter((e) => e.tipo === 'hospital').length} hospitales y {efectores.filter((e) => e.tipo === 'caps').length} CAPS en {partidos.length} partidos.
        Con derivaciones registradas: {capsRed} CAPS → {hospitalesRed} hospital{hospitalesRed === 1 ? '' : 'es'}.
        Línea de base: Anexo 2026. Verde = mejor que la línea de base.
      </p>

      <Tarjeta titulo="Meta 1 · Espera para especialista (34 → 20 días)">
        <div className="indicadores">
          <Indicador titulo="Del pedido al turno asignado" valor={demoraAsignacion} unidad=" días" base={6.5} n={conTurno.length} />
          <Indicador titulo="Espera hasta la consulta" valor={esperaTotal} unidad=" días" base={34} meta={20} />
          <Indicador titulo="Espera en cardiología" valor={esperaCardio} unidad=" días" base={68} meta={20} />
          <Indicador titulo="Inasistencia" valor={pct(ausentes.length, ausentes.length + atendidos.length)} unidad="%" base={29} n={ausentes.length + atendidos.length} />
          <Indicador titulo="Turnos próximos confirmados" valor={pct(confirmados.length, futuros.length)} unidad="%" mejorSi="mayor" n={futuros.length} />
        </div>
      </Tarjeta>

      <Tarjeta titulo="Meta 2 · Crónicos con control (45% → 60%)">
        <div className="indicadores">
          <Indicador titulo="Diabéticos con control en 12 meses" valor={pct(dbtAlDia.length, dbt.length)} unidad="%" base={45} meta={60} mejorSi="mayor" n={dbt.length} />
          <Indicador titulo="Derivaciones con contrarreferencia" valor={pct(contra.length, atendidos.length)} unidad="%" base={0} mejorSi="mayor" n={atendidos.length} />
        </div>
      </Tarjeta>

      <Tarjeta titulo="Meta 3 · −15% internaciones por descompensación">
        <p className="nota">Se mide con egresos hospitalarios (HIS), fuera de esta app. Esta app aporta los controles agendados por contrarreferencia que deberían evitar descompensaciones.</p>
      </Tarjeta>

      <Tarjeta titulo="Historia clínica única">
        <div className="indicadores">
          <Indicador titulo="Evoluciones registradas" valor={encuentros.filter((e) => enPartido(todosPac.find((p) => p.id === e.pacienteId)?.capsId)).length} unidad="" />
          <Indicador titulo="Teleconsultas registradas en la historia" valor={encuentros.filter((e) => e.tipo === 'teleconsulta').length} unidad="" />
          <Indicador titulo="Codificadas con CIE-10" valor={pct(encuentros.filter((e) => e.diagnosticos?.some((d) => d.codigo)).length, encuentros.filter((e) => e.diagnosticos?.length).length)} unidad="%" mejorSi="mayor" />
          <Indicador titulo="Registros duplicados unificados" valor={unificados} unidad="" />
        </div>
        <p className="nota">Línea de base: 0% de las 4.100 teleconsultas anuales registradas; 12% de registros duplicados.</p>
      </Tarjeta>

      <Tarjeta titulo="Operación">
        <div className="indicadores">
          <Indicador titulo="Pendientes de sincronizar" valor={pendSync} unidad="" />
          <Indicador titulo="Esperando cupo" valor={sinCupo} unidad="" />
          <Indicador titulo="Derivaciones totales" valor={ders.length} unidad="" />
        </div>
      </Tarjeta>

      <Tarjeta titulo="Por CAPS">
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr><th>CAPS</th><th>Partido</th><th>Derivaciones</th><th>Con contrarref.</th><th>Ausentes</th><th>DBT con control</th></tr>
            </thead>
            <tbody>
              {caps.map((c) => {
                const dc = ders.filter((d) => d.capsId === c.id)
                const pd = dbt.filter((p) => p.capsId === c.id)
                return (
                  <tr key={c.id}>
                    <td>{c.nombre}</td>
                    <td>{c.partido}</td>
                    <td>{dc.length}</td>
                    <td>{dc.filter((d) => d.estado === 'contrarreferido').length}</td>
                    <td>{dc.filter((d) => d.estado === 'ausente').length}</td>
                    <td>{pd.length ? `${pct(pd.filter((p) => p.ultimoControl && p.ultimoControl >= hace12m).length, pd.length)}%` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {caps.length === 0 && <p className="nota">Sin derivaciones registradas en este partido.</p>}
      </Tarjeta>
    </>
  )
}
