// Configuración web del proyecto Firebase "capspba-560af".
// Estos valores identifican al proyecto y son públicos por diseño (viajan en el
// JavaScript de cualquier app web de Firebase): la seguridad de los datos la dan
// la autenticación y las reglas de Firestore (firestore.rules), no esta clave.
// Se pueden reemplazar con variables VITE_FIREBASE_* (por ejemplo en un .env.local).
const env = import.meta.env

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? 'AIzaSyC2PYRS6oMsgq9q9mvQKgjjgq26prit2OE',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? 'capspba-560af.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? 'capspba-560af',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? 'capspba-560af.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '321534910533',
  appId: env.VITE_FIREBASE_APP_ID ?? '1:321534910533:web:24a79ed5be11cda809832c',
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID ?? 'G-EG3S1L0X0L',
}

/** `VITE_FIREBASE=off` desactiva la nube y la app vuelve a funcionar sólo con la base local. */
export const nubeHabilitada = env.VITE_FIREBASE !== 'off'
