// Genera public/data/establecimientos.json con los hospitales públicos y los CAPS
// (centros de salud, unidades sanitarias, salas de primeros auxilios) de la
// Provincia de Buenos Aires, con coordenadas y partido.
//
// Fuentes:
//  - OpenStreetMap vía Overpass API (ubicación y nombre).
//  - API Georef del Estado nacional (partido de cada punto).
//
// Uso:  node scripts/establecimientos.mjs [--cache <dir>]
//   --cache guarda/reusa las respuestas crudas de Overpass en <dir>.
//
// Cuando el catálogo de datos abiertos del Ministerio de Salud PBA esté disponible
// (catalogo.datos.gba.gob.ar/dataset/establecimientos-salud), conviene reemplazar
// la fuente OSM por el padrón oficial, manteniendo el mismo formato de salida.

import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const cacheDir = args.includes('--cache') ? args[args.indexOf('--cache') + 1] : null
const SALIDA = path.resolve('public/data/establecimientos.json')
const UA = { 'User-Agent': 'red-caps-prototipo/0.1 (datos abiertos)' }

const CONSULTAS = {
  hosp: 'nwr["amenity"="hospital"](area.pba);nwr["healthcare"="hospital"](area.pba);',
  clinic: 'nwr["amenity"="clinic"](area.pba);nwr["healthcare"~"^(centre|clinic)$"](area.pba);',
  doctors: 'nwr["amenity"="doctors"](area.pba);',
}
const OVERPASS = ['https://overpass-api.de', 'https://maps.mail.ru/osm/tools/overpass', 'https://overpass.osm.jp']

async function overpass(nombre, cuerpo) {
  const archivo = cacheDir && path.join(cacheDir, `osm-${nombre}.json`)
  if (archivo && fs.existsSync(archivo)) return JSON.parse(fs.readFileSync(archivo, 'utf8'))
  const q = `[out:json][timeout:180];area["ISO3166-2"="AR-B"]->.pba;(${cuerpo});out center tags;`
  for (let intento = 0; intento < 3; intento++) {
    for (const host of OVERPASS) {
      try {
        const r = await fetch(`${host}/api/interpreter`, {
          method: 'POST',
          headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(q),
          signal: AbortSignal.timeout(200_000),
        })
        if (!r.ok) continue
        const txt = await r.text()
        if (archivo) fs.writeFileSync(archivo, txt)
        return JSON.parse(txt)
      } catch {
        /* probar el siguiente servidor */
      }
    }
  }
  throw new Error(`Overpass no respondió para ${nombre}`)
}

const PRIVADO = /\b(cl[ií]nica|sanatorio|privad[oa]|instituto|consultorio|policonsultorio|centro m[eé]dico|m[eé]dica|odontol|dental|kinesio|est[eé]tica|veterinari|laboratorio|diagn[oó]stico|im[aá]genes|swiss|osde|pami|iosfa|ioma|uom|obra social|mutual|sindicato|geri[aá]trico|residencia|hogar|psicolog|fonoaudio|nutrici|oftalmo|[oó]ptica|farmacia|vacunatorio privado|cruz roja|espa[nñ]ol|italiano|alem[aá]n|brit[aá]nico|franc[eé]s|sirio|austral|de d[ií]a|evang[eé]lico|churruca|militar|naval|aeron[aá]utico|ferroviario)\b/i
const ES_HOSPITAL = /\b(hospital|hospitalito|h\.?i\.?g\.?a\.?|h\.?z\.?g\.?a\.?|policl[ií]nico)\b/i
const ES_CAPS = /\b(caps|c\.a\.p\.s\.?|centro de salud|centro de atenci[oó]n primaria|centro sanitario|unidad sanitaria|unidad de salud|unidad de atenci[oó]n primaria|sala de primeros auxilios|sala de salud|sala m[eé]dica|salita|posta sanitaria|puesto sanitario|usaf|centro de salud comunitario|centro integrador comunitario|cic)\b/i
const NO_ATENCION = /\b(guardia|maternidad|morgue|farmacia|estacionamiento|pabell[oó]n|helipuerto|consultorios externos|administraci[oó]n)\b/i

function clasificar(e) {
  const t = e.tags ?? {}
  const nombre = (t.name ?? '').trim()
  if (!nombre) return null
  const op = `${t['operator:type'] ?? ''}`.toLowerCase()
  if (/priv|business/.test(op)) return null
  const publico = /public|government|p[uú]blico|municipal|provincial/.test(op) || /\b(municipal|provincial|nacional|interzonal|zonal|subzonal|regional)\b/i.test(`${nombre} ${t.operator ?? ''}`)
  if (ES_HOSPITAL.test(nombre) && !PRIVADO.test(nombre) && !NO_ATENCION.test(nombre)) return 'hospital'
  if (ES_CAPS.test(nombre) && !PRIVADO.test(nombre)) return 'caps'
  // Centros públicos con otra denominación (p. ej. "Centro de Atención Barrial") si el operador es público.
  if (publico && (t.amenity === 'clinic' || t.healthcare === 'centre') && !PRIVADO.test(nombre)) return 'caps'
  return null
}

const coord = (e) => (e.type === 'node' ? [e.lat, e.lon] : e.center ? [e.center.lat, e.center.lon] : null)

function distanciaM([la1, lo1], [la2, lo2]) {
  const R = 6371e3, r = Math.PI / 180
  const a = Math.sin(((la2 - la1) * r) / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(((lo2 - lo1) * r) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

const limpiar = (s) => {
  const t = s.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim()
  return t.charAt(0).toLocaleUpperCase('es') + t.slice(1)
}

async function partidos(puntos) {
  const out = new Array(puntos.length).fill(null)
  for (let i = 0; i < puntos.length; i += 250) {
    const lote = puntos.slice(i, i + 250)
    const r = await fetch('https://apis.datos.gob.ar/georef/api/ubicacion', {
      method: 'POST',
      headers: { ...UA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ubicaciones: lote.map(([lat, lon]) => ({ lat, lon, aplanar: true, campos: 'departamento.nombre,provincia.id' })) }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!r.ok) throw new Error(`Georef respondió ${r.status}`)
    const j = await r.json()
    j.resultados.forEach((res, k) => {
      const u = res.ubicacion
      out[i + k] = u?.provincia_id === '06' ? u.departamento_nombre : null
    })
    process.stdout.write(`  partidos ${Math.min(i + 250, puntos.length)}/${puntos.length}\r`)
  }
  process.stdout.write('\n')
  return out
}

async function main() {
  if (cacheDir) fs.mkdirSync(cacheDir, { recursive: true })
  const elementos = new Map()
  for (const [k, q] of Object.entries(CONSULTAS)) {
    const d = await overpass(k, q)
    for (const e of d.elements) elementos.set(`${e.type[0]}${e.id}`, e)
    console.log(`Overpass ${k}: ${d.elements.length}`)
  }

  let lista = []
  for (const [id, e] of elementos) {
    const tipo = clasificar(e)
    const c = coord(e)
    if (!tipo || !c) continue
    lista.push({ id: `${tipo === 'hospital' ? 'H' : 'C'}-${id}`, tipo, nombre: limpiar(e.tags.name), lat: +c[0].toFixed(5), lon: +c[1].toFixed(5), ciudad: e.tags['addr:city'] ?? null, calle: e.tags['addr:street'] ? limpiar(`${e.tags['addr:street']} ${e.tags['addr:housenumber'] ?? ''}`) : null })
  }

  // Duplicados: mismo tipo y nombre a menos de 300 m (p. ej. edificio + nodo).
  lista.sort((a, b) => a.id.localeCompare(b.id))
  const unicos = []
  for (const x of lista) {
    if (unicos.some((u) => u.tipo === x.tipo && u.nombre.toLowerCase() === x.nombre.toLowerCase() && distanciaM([u.lat, u.lon], [x.lat, x.lon]) < 300)) continue
    unicos.push(x)
  }
  lista = unicos

  console.log(`Clasificados: ${lista.filter((x) => x.tipo === 'hospital').length} hospitales, ${lista.filter((x) => x.tipo === 'caps').length} CAPS`)
  const ps = await partidos(lista.map((x) => [x.lat, x.lon]))
  lista = lista.map((x, i) => ({ ...x, partido: ps[i] })).filter((x) => x.partido)

  // Nombres genéricos ("Unidad Sanitaria") se distinguen con la localidad.
  for (const x of lista) {
    if (/^(unidad sanitaria|centro de salud|sala de primeros auxilios|caps|hospital municipal|hospital)$/i.test(x.nombre)) {
      x.nombre = `${x.nombre} (${x.ciudad ?? x.partido})`
    }
  }

  lista.sort((a, b) => a.partido.localeCompare(b.partido, 'es') || a.tipo.localeCompare(b.tipo) || a.nombre.localeCompare(b.nombre, 'es'))
  const campos = ['id', 'tipo', 'nombre', 'partido', 'lat', 'lon', 'calle']
  const salida = {
    version: new Date().toISOString().slice(0, 10),
    fuente: 'OpenStreetMap (ODbL) vía Overpass API; partidos: API Georef (datos.gob.ar)',
    campos,
    filas: lista.map((x) => campos.map((c) => x[c] ?? null)),
  }
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true })
  fs.writeFileSync(SALIDA, JSON.stringify(salida))
  console.log(`Escrito ${SALIDA}: ${lista.length} establecimientos en ${new Set(lista.map((x) => x.partido)).size} partidos`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
