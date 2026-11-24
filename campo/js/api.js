// Comunicación con NODIA (acciones campo*) y con el backend propio de Campo.
// Siempre por POST con texto plano: ni el token ni la contraseña viajan en la dirección (URL),
// y se evita la petición previa de CORS, igual que hace NODIA con las solicitudes largas.

// Sesión: lo ÚNICO que guarda el token. Vive en el teléfono (localStorage) y en ningún otro sitio.
const Sesion = {
  datos: null,
  cargar() {
    try { this.datos = JSON.parse(localStorage.getItem('campo_sesion') || 'null'); } catch (e) { this.datos = null; }
    if (this.datos && this.datos.expiraEn && Date.parse(this.datos.expiraEn) <= Date.now()) this.cerrar();
    return this.datos;
  },
  abrir(d) {
    this.datos = { token: d.token, usuario: d.usuario, nombre: d.nombre, rol: d.rol, expiraEn: d.expiraEn, debeCambiarClave: !!d.debeCambiarClave };
    localStorage.setItem('campo_sesion', JSON.stringify(this.datos));
  },
  cerrar() { this.datos = null; localStorage.removeItem('campo_sesion'); },
  token() { return this.datos ? this.datos.token : ''; }
};

/** Falla de conexión o del servicio: NO se sabe si llegó. Se puede reintentar (todo es idempotente por UUID). */
class ErrorRed extends Error { constructor(m) { super(m || 'Sin conexión.'); this.esRed = true; } }
/** El servidor respondió que no: sesión (401), permiso (403) o dato inválido. No se reintenta solo. */
class ErrorApi extends Error { constructor(m, codigo) { super(m || 'El servidor rechazó la operación.'); this.codigo = codigo || 400; } }

const API = {
  TIEMPO_MAX_MS: 25000,
  alVencerSesion: null,   // lo define app.js
  alCambiarConexion: null,

  async _llamar(url, key, action, params, sinToken) {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), this.TIEMPO_MAX_MS);
    let json;
    try {
      const r = await fetch(url, {
        method: 'POST', redirect: 'follow', signal: control.signal, cache: 'no-store',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, params: params || {}, key, token: sinToken ? '' : Sesion.token() })
      });
      json = await r.json(); // si Google devuelve HTML (falla de entrega), cae al catch: se trata como «sin conexión»
    } catch (e) {
      if (this.alCambiarConexion) this.alCambiarConexion(false);
      throw new ErrorRed('Sin conexión con el servidor.');
    } finally { clearTimeout(reloj); }

    if (this.alCambiarConexion) this.alCambiarConexion(true);
    if (json && json.ok) return json.data;
    const codigo = json && json.codigo;
    const mensaje = (json && json.error) || 'El servidor no pudo completar la operación.';
    if (codigo === 503) throw new ErrorRed(mensaje);
    if (codigo === 500) { const e = new ErrorRed(mensaje); e.interno = true; throw e; } // se reintenta unas veces y luego se muestra
    if (codigo === 401 && !sinToken && this.alVencerSesion) this.alVencerSesion();
    throw new ErrorApi(mensaje, codigo);
  },

  nodia(action, params, opciones) { return this._llamar(CONFIG.nodiaUrl, CONFIG.nodiaKey, action, params, opciones && opciones.sinToken); },
  campo(action, params) { return this._llamar(CONFIG.campoUrl, CONFIG.campoKey, action, params, false); }
};

function nuevoUuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const x = Array.from(b, (n) => n.toString(16).padStart(2, '0')).join('');
  return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20);
}
