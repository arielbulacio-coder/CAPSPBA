import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generarCupos } from '../cupos.js'
import { hoyAR, sumarDias, diasHabiles } from '../fechas.js'
import { dniDeClaims, payloadJWT, revisarClaims, urlDeVuelta } from '../miargentina.js'
import { generarCupos as generarCuposCliente } from '../../src/lib/seed.js'

test('la grilla del servidor tiene los mismos IDs que la del cliente', () => {
  process.env.TZ = 'America/Argentina/Buenos_Aires'
  const s = generarCupos('H-n1', hoyAR(), 1, 45).map((c) => c.id)
  const c = generarCuposCliente('H-n1', 1, 45).map((x) => x.id)
  assert.deepEqual(s, c)
  assert.ok(s.length > 100)
})

test('fechas en horario de Argentina', () => {
  assert.equal(hoyAR(new Date('2026-11-14T02:30:00Z')), '2026-11-13') // 23:30 en AR
  assert.equal(sumarDias('2026-12-30', 3), '2027-01-02')
  assert.deepEqual(diasHabiles('2026-11-13', 0, 3), ['2026-11-13', '2026-11-16']) // vie → lun
})

test('DNI desde dni_number o desde el CUIL', () => {
  assert.equal(dniDeClaims({ dni_number: '11.234.567' }), '11234567')
  assert.equal(dniDeClaims({ cuil: '27-11234567-4' }), '11234567')
  assert.equal(dniDeClaims({ cuil: '20-05123456-3' }), '5123456')
  assert.equal(dniDeClaims({}), null)
})

test('exige identidad validada', () => {
  assert.equal(revisarClaims({ validation_level: 1, dni_number: '11234567' }, 3), 'identidad_no_validada')
  assert.equal(revisarClaims({ validation_level: 3, dni_number: '11234567', do_dni_match_cuil: false }, 3), 'dni_no_coincide')
  assert.equal(revisarClaims({ validation_level: 3 }, 3), 'sin_dni')
  assert.equal(revisarClaims({ validation_level: '3', dni_number: '11234567' }, 3), null)
})

test('sólo vuelve a orígenes permitidos', () => {
  const ok = ['https://grupo3.github.io', 'http://localhost:5173']
  assert.equal(urlDeVuelta('https://grupo3.github.io/CAPSPBA/?x=1#/algo', ok), 'https://grupo3.github.io/CAPSPBA/')
  assert.equal(urlDeVuelta('https://malicioso.com/CAPSPBA/', ok), null)
  assert.equal(urlDeVuelta('javascript:alert(1)', ok), null)
})

test('lee el payload de un JWT', () => {
  const jwt = `x.${Buffer.from(JSON.stringify({ nonce: 'abc' })).toString('base64url')}.y`
  assert.equal(payloadJWT(jwt).nonce, 'abc')
  assert.equal(payloadJWT('nada'), null)
})
