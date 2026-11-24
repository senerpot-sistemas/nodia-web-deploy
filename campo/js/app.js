// NODIA Campo — pantallas. Sin IA: formularios y botones. Móvil primero.
'use strict';

// ─────────────────────────── utilidades ───────────────────────────
const $ = (sel, raiz) => (raiz || document).querySelector(sel);
const h = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const miles = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const moneda = (n) => '$ ' + miles(n);
const hoyISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const sumarDias = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const horaLegible = (d) => new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
function diaLegible(iso) {
  const hoy = hoyISO();
  if (iso === hoy) return 'Hoy';
  if (iso === sumarDias(hoy, -1)) return 'Ayer';
  const t = new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso + 'T12:00:00Z'));
  return t.charAt(0).toUpperCase() + t.slice(1);
}
const fechaCorta = (iso) => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';

const NOMBRE_ESTADO = { POR_INICIAR: 'Por iniciar', EN_PROGRESO: 'En progreso', PAUSADO: 'Pausado', TERMINADO: 'Terminado' };
const EVENTOS = {
  INICIO: { boton: '▶ Iniciar proyecto', pregunta: '¿Iniciar el proyecto ahora?', si: 'Sí, iniciar', a: 'EN_PROGRESO', hecho: 'Inicio' },
  PAUSA: { boton: '⏸ Pausar', pregunta: '¿Pausar el proyecto ahora?', si: 'Sí, pausar', a: 'PAUSADO', hecho: 'Pausa' },
  REANUDA: { boton: '▶ Reanudar', pregunta: '¿Reanudar el proyecto ahora?', si: 'Sí, reanudar', a: 'EN_PROGRESO', hecho: 'Reanudación' },
  FIN: { boton: '🏁 Terminar', pregunta: '¿Terminar el proyecto? Ya no aparecerá en su lista.', si: 'Sí, terminar', a: 'TERMINADO', hecho: 'Terminación' }
};
const BOTONES_POR_ESTADO = { POR_INICIAR: ['INICIO'], EN_PROGRESO: ['PAUSA', 'FIN'], PAUSADO: ['REANUDA', 'FIN'], TERMINADO: [] };

// ─────────────────────────── estado en memoria ───────────────────────────
const E = {
  proyectos: [], gastos: [], totales: [], categorias: [], personas: [], adminProyectos: [],
  parametros: { horasEdicion: 24, avisoPresupuestoPct: 80, valorMaximo: 50000000, diasAtrasMax: 60 },
  presupuestos: {}, totalesPorEntregar: 0, ultimaSync: null, enLinea: navigator.onLine, cargando: false,
  adminPestana: 'aprobar', adminFiltro: 'PENDIENTE', renderPendiente: false
};
let F = null; // formulario de gasto en curso
let claveReciente = ''; // la clave temporal recién escrita: solo en memoria, para no pedirla dos veces

/** ¿Los gastos pasan por aprobación? Por decisión de Gerson, normalmente NO: lo registrado ya cuenta. */
const conAprobacion = () => !!E.parametros.requiereAprobacion;

const esAdmin = () => !!Sesion.datos && Sesion.datos.rol === 'ADMINISTRADOR';
const categoria = (codigo) => E.categorias.find((c) => c.codigo === codigo) || { codigo, nombre: codigo, icono: '📦', pidePersona: false, activo: true };
const proyecto = (id) => E.proyectos.find((p) => p.idProyecto === id) || E.adminProyectos.find((p) => p.idProyecto === id);
const claveCopia = () => 'copia_' + Sesion.datos.usuario;

async function guardarCopia() {
  if (!Sesion.datos) return;
  const c = {};
  ['proyectos', 'gastos', 'totales', 'categorias', 'personas', 'adminProyectos', 'parametros', 'presupuestos', 'totalesPorEntregar', 'ultimaSync'].forEach((k) => { c[k] = E[k]; });
  try { await Almacen.guardar(claveCopia(), c); } catch (e) { console.warn('No se pudo guardar la copia local', e); }
}
async function cargarCopia() {
  try {
    const c = await Almacen.leer(claveCopia());
    if (c) Object.keys(c).forEach((k) => { if (c[k] !== undefined && c[k] !== null) E[k] = c[k]; });
  } catch (e) { console.warn('No se pudo leer la copia local', e); }
}

// ─────────────────────────── avisos y ventanas ───────────────────────────
function aviso(texto, tipo) {
  const d = document.createElement('div');
  d.className = 'aviso ' + (tipo || 'ok');
  d.textContent = texto;
  $('#avisos').appendChild(d);
  setTimeout(() => d.classList.add('fuera'), 3400);
  setTimeout(() => d.remove(), 3900);
}

const Ventana = {
  _resolver: null,
  abrir(html) {
    const m = $('#modal');
    m.innerHTML = '<div class="velo" data-accion="ventana-cerrar"></div><div class="hoja" role="dialog" aria-modal="true">' + html + '</div>';
    m.hidden = false;
  },
  cerrar(valor) {
    const m = $('#modal');
    m.hidden = true; m.innerHTML = '';
    if (this._resolver) { const r = this._resolver; this._resolver = null; r(valor === undefined ? false : valor); }
    if (E.renderPendiente) render();
  },
  abierta() { return !$('#modal').hidden; },
  /** Pregunta con dos botones grandes. Devuelve true/false. */
  confirmar(o) {
    this.abrir('<h3>' + h(o.titulo) + '</h3>' + (o.texto ? '<p class="hoja-texto">' + o.texto + '</p>' : '') +
      '<div class="hoja-botones"><button class="btn ' + (o.peligro ? 'peligro' : 'primario') + ' grande" data-accion="ventana-si">' + h(o.si || 'Sí') + '</button>' +
      '<button class="btn plano grande" data-accion="ventana-no">' + h(o.no || 'Cancelar') + '</button></div>');
    return new Promise((r) => { this._resolver = r; });
  },
  /** Pide un texto (por ejemplo, el motivo de una anulación). Devuelve el texto o false. */
  pedirTexto(o) {
    this.abrir('<h3>' + h(o.titulo) + '</h3>' + (o.texto ? '<p class="hoja-texto">' + o.texto + '</p>' : '') +
      '<textarea id="ventana-texto" rows="3" maxlength="300" placeholder="' + h(o.ayuda || '') + '"></textarea>' +
      '<div class="hoja-botones"><button class="btn ' + (o.peligro ? 'peligro' : 'primario') + ' grande" data-accion="ventana-texto-ok">' + h(o.si || 'Aceptar') + '</button>' +
      '<button class="btn plano grande" data-accion="ventana-no">Cancelar</button></div>');
    setTimeout(() => { const t = $('#ventana-texto'); if (t) t.focus(); }, 50);
    return new Promise((r) => { this._resolver = r; });
  }
};

// ─────────────────────────── datos: traer, mezclar con la cola ───────────────────────────
async function refrescar(opciones) {
  if (!Sesion.datos || Sesion.datos.debeCambiarClave || E.cargando) return;
  E.cargando = true;
  if (!(opciones && opciones.silencioso)) renderSuave();
  const [rp, rs] = await Promise.allSettled([API.nodia('campoMisProyectos', {}), API.campo('sincronizar', {})]);
  if (!Sesion.datos) { E.cargando = false; return; } // la sesión venció durante la llamada
  if (rp.status === 'fulfilled' && Array.isArray(rp.value)) E.proyectos = rp.value;
  if (rs.status === 'fulfilled' && rs.value) {
    const d = rs.value;
    E.gastos = d.gastos || []; E.totales = d.totales || []; E.categorias = d.categorias || []; E.personas = d.personas || [];
    E.parametros = d.parametros || E.parametros; E.adminProyectos = d.proyectos || []; E.totalesPorEntregar = d.totalesPorEntregarANodia || 0;
    if (d.usuario && d.usuario.rol && d.usuario.rol !== Sesion.datos.rol) { Sesion.datos.rol = d.usuario.rol; Sesion.abrir(Sesion.datos); }
  }
  if (rp.status === 'fulfilled' || rs.status === 'fulfilled') E.ultimaSync = new Date().toISOString();
  E.cargando = false;
  await guardarCopia();
  renderSuave();
  if (opciones && opciones.avisar) {
    const fallo = [rp, rs].find((r) => r.status === 'rejected');
    if (fallo && !(fallo.reason && fallo.reason.codigo === 401)) aviso(fallo.reason && fallo.reason.esRed ? 'Sin conexión: se muestran los últimos datos guardados.' : fallo.reason.message, 'alerta');
    else if (!fallo) aviso('Datos actualizados.');
  }
}

/** Estado del proyecto contando lo que el usuario ya marcó y todavía no se ha enviado. */
function estadoVista(p) {
  let estado = p.estado, porEnviar = false;
  Cola.porEnviar().filter((i) => i.tipo === 'EVENTO' && i.idProyecto === p.idProyecto && i.etapa !== 'CAMPO')
    .forEach((i) => { estado = EVENTOS[i.datos.evento].a; porEnviar = true; });
  return { estado, porEnviar };
}

/** Gastos del proyecto: los del servidor más los que esperan en la cola (que mandan sobre los del servidor). */
function gastosVista(idProyecto) {
  const mapa = new Map();
  E.gastos.filter((g) => g.idProyecto === idProyecto).forEach((g) => mapa.set(g.idGasto, Object.assign({}, g)));
  Cola.mios().filter((i) => i.tipo === 'GASTO' && i.idProyecto === idProyecto).forEach((i) => {
    const base = mapa.get(i.id);
    const d = i.datos;
    mapa.set(i.id, Object.assign({}, base || { estado: 'PENDIENTE', registradoPor: Sesion.datos.usuario, version: 0 }, {
      idGasto: i.id, idProyecto, fecha: d.fecha, categoria: d.categoria, descripcion: d.descripcion, cantidad: d.cantidad,
      valorUnitario: d.valorUnitario, total: Math.round(d.cantidad * d.valorUnitario), pagadoA: d.pagadoA,
      enCola: i.estado, errorCola: i.ultimoError, editable: true
    }));
  });
  return Array.from(mapa.values()).sort((a, b) => (b.fecha + (b.registradoEn || '9')).localeCompare(a.fecha + (a.registradoEn || '9')));
}

/** Cifras del proyecto. Lo que está en la cola ya se cuenta, para que el ingeniero vea su gasto de inmediato. */
function cifras(p) {
  const t = E.totales.find((x) => x.idProyecto === p.idProyecto) || { aprobado: 0, pendiente: 0 };
  let aprobado = t.aprobado || 0, pendiente = t.pendiente || 0;
  Cola.porEnviar().filter((i) => i.tipo === 'GASTO' && i.idProyecto === p.idProyecto).forEach((i) => {
    const nuevo = Math.round(i.datos.cantidad * i.datos.valorUnitario);
    const base = E.gastos.find((g) => g.idGasto === i.id);
    if (!base) pendiente += nuevo;
    else if (base.estado === 'APROBADO') aprobado += nuevo - base.total;
    else if (base.estado === 'PENDIENTE') pendiente += nuevo - base.total;
  });
  // Los ítems de presupuesto que esperan en la cola ya se suman, igual que los gastos.
  const presuEnCola = Cola.porEnviar().filter((i) => i.tipo === 'PRESUPUESTO' && i.idProyecto === p.idProyecto).reduce((s, i) => s + Math.round(i.datos.cantidad * i.datos.costoUnitario), 0);
  const presupuesto = (p.presupuestoTotal || 0) + presuEnCola, compras = p.comprasTotal || 0;
  const campo = aprobado + pendiente, gastado = compras + campo;
  const pct = presupuesto > 0 ? Math.round(gastado * 100 / presupuesto) : null;
  const nivel = pct === null ? 'sin' : pct > 100 ? 'pasado' : pct >= (E.parametros.avisoPresupuestoPct || 80) ? 'aviso' : 'bien';
  return { presupuesto, compras, aprobado, pendiente, campo, gastado, pct, nivel, disponible: presupuesto - gastado };
}

// La cola avisa aquí cuando el servidor aceptó algo, para que la pantalla quede al día sin esperar otra descarga.
Cola.aplicar.gasto = (g) => {
  const i = E.gastos.findIndex((x) => x.idGasto === g.idGasto);
  const antes = i === -1 ? null : E.gastos[i];
  let t = E.totales.find((x) => x.idProyecto === g.idProyecto);
  if (!t) { t = { idProyecto: g.idProyecto, aprobado: 0, pendiente: 0, anulado: 0, cantidad: 0 }; E.totales.push(t); }
  const campo = (x) => x.estado === 'APROBADO' ? 'aprobado' : x.estado === 'PENDIENTE' ? 'pendiente' : 'anulado';
  if (antes) t[campo(antes)] -= antes.total;
  t[campo(g)] += g.total;
  if (i === -1) E.gastos.push(g); else E.gastos[i] = g;
};
Cola.aplicar.estadoProyecto = (id, r) => {
  const p = E.proyectos.find((x) => x.idProyecto === id);
  if (p) { p.estado = r.estado; p.fechaInicio = r.fechaInicio || p.fechaInicio; p.fechaFin = r.fechaFin || p.fechaFin; }
};
Cola.aplicar.presupuesto = (id, r) => {
  const p = E.proyectos.find((x) => x.idProyecto === id);
  if (p) p.presupuestoTotal = r.presupuestoTotal || 0;
  E.presupuestos[id] = { lineas: r.lineas || [], presupuestoTotal: r.presupuestoTotal || 0, cuando: new Date().toISOString() };
};
Cola.alCambiar = () => renderSuave();
Cola.alQuedarEnEspera = () => aviso('Sin conexión: quedó guardado en el teléfono y se enviará solo.', 'alerta');
Cola.alEnviar = () => { guardarCopia(); refrescar({ silencioso: true }); };

// ─────────────────────────── piezas comunes ───────────────────────────
function barraSuperior(titulo, atras) {
  const n = Cola.porEnviar().length;
  return '<header class="barra">' +
    (atras ? '<a class="barra-atras" href="' + atras + '" aria-label="Volver">‹</a>' : '<img class="barra-logo" src="img/nodia-symbol.png" alt="">') +
    '<div class="barra-titulo">' + h(titulo) + '</div>' +
    '<span class="pildora ' + (E.enLinea ? 'linea' : 'sin') + '">' + (E.enLinea ? '● En línea' : '● Sin conexión') + '</span>' +
    (n ? '<a class="barra-cola" href="#/pendientes" aria-label="Pendientes de enviar">⏫ ' + n + '</a>' : '') +
    '</header>' +
    (CONFIG.entorno ? '<div class="cinta-prueba">' + h(CONFIG.entorno) + ' · datos de prueba</div>' : '');
}
function barraInferior(activa) {
  const n = Cola.mios().length;
  const item = (ruta, icono, texto, extra) => '<a href="#/' + ruta + '" class="' + (activa === ruta ? 'activa' : '') + '"><span class="nav-icono">' + icono + '</span><span>' + texto + '</span>' + (extra || '') + '</a>';
  return '<nav class="nav">' + item('proyectos', '📋', 'Proyectos') + item('pendientes', '⏫', 'Por enviar', n ? '<b class="globo">' + n + '</b>' : '') +
    (esAdmin() ? item('admin', '🛠️', 'Administrar') : '') + item('cuenta', '👤', 'Cuenta') + '</nav>';
}
function chipEstado(estado, porEnviar) {
  return '<span class="chip estado-' + estado + '">' + h(NOMBRE_ESTADO[estado] || estado) + '</span>' + (porEnviar ? '<span class="chip por-enviar">⏫ por enviar</span>' : '');
}
function barraPresupuesto(c) {
  if (c.nivel === 'sin') return '<div class="presu"><div class="presu-texto">Gastado <b>' + moneda(c.gastado) + '</b> · <span class="tenue">sin presupuesto cargado en NODIA</span></div></div>';
  const ancho = c.pct <= 0 ? 0 : Math.max(2, Math.min(100, c.pct));
  const alerta = c.nivel === 'pasado' ? '<div class="presu-alerta pasado">🔴 Presupuesto superado por ' + moneda(-c.disponible) + '</div>'
    : c.nivel === 'aviso' ? '<div class="presu-alerta aviso">⚠️ Va en ' + c.pct + ' % del presupuesto</div>' : '';
  return '<div class="presu"><div class="presu-texto">Gastado <b>' + moneda(c.gastado) + '</b> de ' + moneda(c.presupuesto) + ' <span class="presu-pct">' + c.pct + ' %</span></div>' +
    '<div class="presu-barra"><div class="presu-relleno ' + c.nivel + '" style="width:' + ancho + '%"></div></div>' + alerta + '</div>';
}

// ─────────────────────────── 1. Ingreso ───────────────────────────
function vistaIngreso() {
  const ajenos = Cola.items.length;
  const prueba = !!CONFIG.entorno;
  return '<div class="ingreso"><div class="ingreso-marca"><img src="img/nodia-symbol.png" alt="" width="84" height="84"><h1>NODIA <span>Campo</span></h1><p>Proyectos y gastos desde la obra</p></div>' +
    '<form class="ingreso-caja" data-form="ingreso" autocomplete="on">' +
    // En un sitio de PRUEBA los campos no se dejan rellenar solos: el navegador podría poner la clave real de NODIA.
    '<label>Usuario<input id="in-usuario" type="text" ' + (prueba ? 'name="usuario-de-prueba" autocomplete="off" readonly data-sin-relleno' : 'name="username" autocomplete="username"') + ' autocapitalize="none" autocorrect="off" spellcheck="false" required></label>' +
    '<label>Contraseña<input id="in-clave" type="password" ' + (prueba ? 'name="clave-de-prueba" autocomplete="new-password" readonly data-sin-relleno' : 'name="password" autocomplete="current-password"') + ' required></label>' +
    '<button class="btn primario grande" type="submit" id="in-boton">Ingresar</button>' +
    (prueba ? '<p class="nota-cola centro"><b>Sitio de PRUEBA.</b> Use solo los usuarios de prueba. <b>No escriba su contraseña real de NODIA.</b></p>'
      : '<p class="tenue centro">Use el mismo usuario y contraseña de NODIA. Para ingresar necesita conexión; después puede trabajar sin señal.</p>') +
    (ajenos ? '<p class="nota-cola">📱 Este teléfono tiene ' + ajenos + ' registro(s) sin enviar. Se enviarán cuando ingrese quien los hizo.</p>' : '') +
    '</form>' + (CONFIG.entorno ? '<p class="ingreso-entorno">' + h(CONFIG.entorno) + ' · v' + h(CONFIG.version) + '</p>' : '') + '</div>';
}
async function ingresar(form) {
  const boton = $('#in-boton');
  if (boton.disabled) return;
  const usuario = $('#in-usuario').value.trim(), clave = $('#in-clave').value;
  if (!usuario || !clave) return;
  boton.disabled = true; boton.textContent = '⏳ Ingresando…';
  try {
    const r = await API.nodia('campoLogin', { usuario, password: clave }, { sinToken: true });
    if (!r.exito) { aviso(r.mensaje || 'Usuario o contraseña incorrectos.', 'error'); return; }
    Sesion.abrir(r);
    claveReciente = r.debeCambiarClave ? clave : '';
    form.reset();
    if (r.debeCambiarClave) { location.hash = ''; render(); return; }
    await cargarCopia();
    location.hash = '#/proyectos';
    render();
    await refrescar();
    Cola.procesar({ forzar: true });
  } catch (e) {
    aviso(e.esRed ? 'No hay conexión. Para ingresar la primera vez se necesita señal.' : e.message, 'error');
  } finally {
    const b = $('#in-boton');
    if (b) { b.disabled = false; b.textContent = 'Ingresar'; }
  }
}

// ─────────────────────────── 1b. Crear su propia contraseña (clave temporal) ───────────────────────────
function vistaCambiarClave() {
  const s = Sesion.datos;
  return '<div class="ingreso"><div class="ingreso-marca"><img src="img/nodia-symbol.png" alt="" width="72" height="72"><h1>NODIA <span>Campo</span></h1></div>' +
    '<form class="ingreso-caja" data-form="clave" autocomplete="off">' +
    '<h2>Hola, ' + h(s.nombre) + '</h2>' +
    '<p>Entró con una <b>contraseña temporal</b>. Antes de continuar, cree la suya: será su contraseña de NODIA y de NODIA Campo.</p>' +
    (claveReciente ? '' : '<label>Contraseña temporal<input id="cl-actual" type="password" autocomplete="off" required></label>') +
    '<label>Contraseña nueva<input id="cl-nueva" type="password" autocomplete="new-password" minlength="8" required></label>' +
    '<label>Repítala<input id="cl-repite" type="password" autocomplete="new-password" minlength="8" required></label>' +
    '<p class="tenue">Mínimo 8 caracteres, con letras y números. No la comparta.</p>' +
    '<button class="btn primario grande" type="submit" id="cl-boton">Guardar mi contraseña</button>' +
    '<button class="btn plano grande" type="button" data-accion="salir-directo">Salir</button>' +
    '</form></div>';
}
async function cambiarClave() {
  const boton = $('#cl-boton');
  if (boton.disabled) return;
  const actual = claveReciente || ($('#cl-actual') ? $('#cl-actual').value : '');
  const nueva = $('#cl-nueva').value, repite = $('#cl-repite').value;
  if (nueva !== repite) return aviso('Las dos contraseñas no son iguales.', 'error');
  if (nueva.length < 8) return aviso('La contraseña debe tener al menos 8 caracteres.', 'error');
  boton.disabled = true; boton.textContent = '⏳ Guardando…';
  try {
    const r = await API.nodia('campoCambiarClave', { claveActual: actual, claveNueva: nueva });
    if (!r.exito) { aviso(r.mensaje || 'No se pudo cambiar la contraseña.', 'error'); return; }
    claveReciente = '';
    Sesion.datos.debeCambiarClave = false;
    Sesion.abrir(Sesion.datos);
    await cargarCopia();
    location.hash = '#/proyectos';
    render();
    aviso('Contraseña guardada. Desde ahora use la suya.');
    await refrescar();
    Cola.procesar({ forzar: true });
  } catch (e) {
    if (e.codigo !== 401) aviso(e.esRed ? 'Sin conexión. Para cambiar la contraseña se necesita señal.' : e.message, 'error');
  } finally {
    const b = $('#cl-boton');
    if (b) { b.disabled = false; b.textContent = 'Guardar mi contraseña'; }
  }
}

// ─────────────────────────── 2. Mis proyectos ───────────────────────────
function vistaProyectos() {
  let cuerpo = '';
  if (!E.proyectos.length) {
    cuerpo = E.cargando ? '<div class="vacio">⏳ Cargando proyectos…</div>'
      : '<div class="vacio"><div class="vacio-icono">📋</div><b>No tiene proyectos asignados</b><p>Cuando administración le asigne un proyecto en NODIA, aparecerá aquí.</p></div>';
  } else {
    cuerpo = E.proyectos.map((p) => {
      const ev = estadoVista(p), c = cifras(p);
      const fechas = p.fechaInicio ? 'Inició ' + h(p.fechaInicio) : 'Sin iniciar';
      return '<a class="tarjeta proyecto" href="#/proyecto/' + encodeURIComponent(p.idProyecto) + '">' +
        '<div class="proyecto-cab"><div><div class="proyecto-nombre">' + h(p.nombre) + '</div><div class="tenue">' + h(p.cliente) + '</div></div><span class="flecha">›</span></div>' +
        '<div class="proyecto-linea">' + chipEstado(ev.estado, ev.porEnviar) + '<span class="tenue">' + fechas + (esAdmin() && p.tecnico ? ' · ' + h(p.tecnico) : '') + '</span></div>' +
        barraPresupuesto(c) + '</a>';
    }).join('');
  }
  const sync = E.ultimaSync ? 'Actualizado ' + horaLegible(new Date(E.ultimaSync)) : 'Aún sin actualizar';
  return barraSuperior('Mis proyectos') + '<main>' +
    '<div class="linea-sync"><span class="tenue">' + (E.cargando ? '⏳ Actualizando…' : h(sync)) + '</span><button class="btn mini" data-accion="refrescar">↻ Actualizar</button></div>' +
    cuerpo + '</main>' + barraInferior('proyectos');
}

// ─────────────────────────── 3. Proyecto ───────────────────────────
function filaGasto(g, conAutor) {
  const cat = categoria(g.categoria);
  const detalle = [g.pagadoA, g.descripcion].filter(Boolean).join(' · ');
  let marca = '';
  if (g.enCola === 'RECHAZADO') marca = '<span class="chip rechazado">❌ rechazado</span>';
  else if (g.enCola) marca = '<span class="chip por-enviar">⏫ por enviar</span>';
  else if (g.estado === 'ANULADO') marca = '<span class="chip anulado">anulado</span>';
  else if (g.estado === 'PENDIENTE') marca = '<span class="chip pendiente">por aprobar</span>';
  else if (conAprobacion()) marca = '<span class="chip aprobado">✓ aprobado</span>';
  return '<button class="gasto' + (g.estado === 'ANULADO' ? ' es-anulado' : '') + '" data-accion="gasto-ver" data-id="' + h(g.idGasto) + '" data-proyecto="' + h(g.idProyecto) + '">' +
    '<span class="gasto-icono">' + h(cat.icono) + '</span>' +
    '<span class="gasto-centro"><span class="gasto-cat">' + h(cat.nombre) + (g.cantidad && g.cantidad !== 1 ? ' <span class="tenue">× ' + String(g.cantidad).replace('.', ',') + '</span>' : '') + '</span>' +
    (detalle ? '<span class="gasto-det">' + h(detalle) + '</span>' : '') +
    (conAutor ? '<span class="gasto-det">' + h(fechaCorta(g.fecha)) + ' · ' + h(g.registradoPor) + '</span>' : '') +
    (g.posibleDuplicado ? '<span class="gasto-dup">⚠️ Posible duplicado</span>' : '') + '</span>' +
    '<span class="gasto-der"><span class="gasto-total">' + moneda(g.total) + '</span>' + marca + '</span></button>';
}

function vistaProyecto(id) {
  const p = E.proyectos.find((x) => x.idProyecto === id);
  if (!p) {
    return barraSuperior('Proyecto', '#/proyectos') + '<main><div class="vacio"><div class="vacio-icono">🔎</div><b>Este proyecto ya no está en su lista</b><p>Puede haber terminado o haber sido reasignado.</p><a class="btn primario" href="#/proyectos">Volver a mis proyectos</a></div></main>' + barraInferior('proyectos');
  }
  const ev = estadoVista(p), c = cifras(p);
  const botones = (BOTONES_POR_ESTADO[ev.estado] || []).map((e) =>
    '<button class="btn accion ev-' + e + '" data-accion="marcar" data-evento="' + e + '" data-id="' + h(p.idProyecto) + '">' + EVENTOS[e].boton + '</button>').join('');
  const terminado = ev.estado === 'TERMINADO' ? '<div class="nota-ok">🏁 Proyecto terminado' + (p.fechaFin ? ' el ' + h(p.fechaFin) : '') + '. Todavía puede registrar un gasto que se le haya pasado.</div>' : '';

  const gastos = gastosVista(id);
  let lista = '';
  if (!gastos.length) lista = '<div class="vacio chico">Aún no hay gastos registrados en este proyecto.</div>';
  else {
    const dias = [];
    gastos.forEach((g) => { let d = dias.find((x) => x.fecha === g.fecha); if (!d) { d = { fecha: g.fecha, items: [] }; dias.push(d); } d.items.push(g); });
    lista = dias.map((d) => {
      const total = d.items.filter((g) => g.estado !== 'ANULADO').reduce((s, g) => s + g.total, 0);
      return '<div class="dia"><div class="dia-cab"><span>' + h(diaLegible(d.fecha)) + ' <span class="tenue">' + h(fechaCorta(d.fecha)) + '</span></span><b>' + moneda(total) + '</b></div>' +
        d.items.map((g) => filaGasto(g, esAdmin() && g.registradoPor !== Sesion.datos.usuario)).join('') + '</div>';
    }).join('');
  }

  return barraSuperior(p.nombre, '#/proyectos') + '<main class="con-flotante">' +
    '<div class="tarjeta"><div class="tenue">' + h(p.cliente) + ' · ' + h(p.idProyecto) + '</div>' +
    '<div class="proyecto-linea">' + chipEstado(ev.estado, ev.porEnviar) + '<span class="tenue">' + (p.fechaInicio ? 'Inició ' + h(p.fechaInicio) : 'Sin iniciar') + '</span></div>' +
    (p.notas ? '<div class="nota">📝 ' + h(p.notas) + '</div>' : '') + terminado +
    (botones ? '<div class="acciones">' + botones + '</div>' : '') + '</div>' +

    '<div class="tarjeta"><h2>Resumen</h2>' + barraPresupuesto(c) +
    '<table class="cifras">' +
    '<tr><td>Presupuesto</td><td>' + (c.nivel === 'sin' ? '<span class="tenue">sin cargar</span>' : moneda(c.presupuesto)) + '</td></tr>' +
    '<tr><td>Compras (NODIA)</td><td>' + moneda(c.compras) + '</td></tr>' +
    filasCampo(c) +
    '<tr class="fuerte"><td>Total gastado</td><td>' + moneda(c.gastado) + '</td></tr>' +
    (c.nivel === 'sin' ? '' : '<tr class="' + (c.disponible < 0 ? 'rojo' : '') + '"><td>' + (c.disponible < 0 ? 'Sobrecosto' : 'Disponible') + '</td><td>' + moneda(Math.abs(c.disponible)) + '</td></tr>') +
    '</table><a class="btn" href="#/presupuesto/' + encodeURIComponent(p.idProyecto) + '">📋 Ver presupuesto · agregar ítem</a></div>' +

    '<div class="tarjeta"><h2>Gastos del proyecto</h2>' + lista + '</div>' +
    '</main>' +
    '<a class="flotante" href="#/gasto/' + encodeURIComponent(p.idProyecto) + '">＋ Gasto</a>' + barraInferior('proyectos');
}

/** Filas de «gastos de campo» del resumen: una sola si no hay aprobación; dos si la hay o quedó algo pendiente. */
function filasCampo(c) {
  if (!conAprobacion() && !c.pendiente) return '<tr><td>Gastos de campo</td><td>' + moneda(c.campo) + '</td></tr>';
  return '<tr><td>Gastos de campo aprobados</td><td>' + moneda(c.aprobado) + '</td></tr><tr><td>Gastos de campo por aprobar</td><td>' + moneda(c.pendiente) + '</td></tr>';
}

async function marcar(idProyecto, evento) {
  const p = E.proyectos.find((x) => x.idProyecto === idProyecto);
  if (!p) return;
  const def = EVENTOS[evento], ahora = new Date();
  const si = await Ventana.confirmar({
    titulo: def.pregunta, si: def.si, peligro: evento === 'FIN',
    texto: '<b>' + h(p.nombre) + '</b><br>Hora que quedará registrada: <b>' + h(horaLegible(ahora)) + '</b>' + (E.enLinea ? '' : '<br><span class="tenue">Sin conexión: se enviará cuando vuelva la señal.</span>')
  });
  if (!si) return;
  await Cola.poner({ id: nuevoUuid(), tipo: 'EVENTO', idProyecto, etapa: 'NODIA', datos: { evento, fechaHora: ahora.toISOString() } });
  aviso(def.hecho + ' registrada' + (E.enLinea && navigator.onLine ? '.' : ' en el teléfono. Se enviará al volver la señal.'));
  Cola.procesar({ forzar: true });
}

// ─────────────────────────── 4. Nuevo gasto ───────────────────────────
function abrirFormulario(idProyecto, idGasto) {
  const hoy = hoyISO();
  if (idGasto) {
    const g = gastosVista(idProyecto).find((x) => x.idGasto === idGasto);
    if (!g) return false;
    const enCola = Cola.buscar(idGasto);
    F = {
      idProyecto, idGasto, edicion: true, paso: 'valor', categoria: g.categoria, valor: String(g.valorUnitario || ''), cantidad: g.cantidad || 1,
      fecha: g.fecha, descripcion: g.descripcion || '', pagadoA: g.pagadoA || '', mas: !!g.descripcion || g.cantidad !== 1 || g.fecha !== hoy,
      // Si aún no ha salido del teléfono se conserva su versión; si ya está en el servidor, es la siguiente.
      version: enCola ? enCola.datos.version : (g.version || 1) + 1
    };
  } else {
    F = { idProyecto, idGasto: nuevoUuid(), edicion: false, paso: 'categoria', categoria: '', valor: '', cantidad: 1, fecha: hoy, descripcion: '', pagadoA: '', mas: false, version: 1 };
  }
  return true;
}

/** Gastos del último día anterior a hoy con registros: para repetirlos con un toque. */
function repetibles(idProyecto) {
  const hoy = hoyISO();
  const previos = gastosVista(idProyecto).filter((g) => g.fecha < hoy && g.estado !== 'ANULADO' && g.registradoPor === Sesion.datos.usuario);
  if (!previos.length) return null;
  const fecha = previos[0].fecha;
  return { fecha, items: previos.filter((g) => g.fecha === fecha).slice(0, 6) };
}
function valoresFrecuentes(idProyecto, codigo) {
  const cuenta = {};
  E.gastos.filter((g) => g.categoria === codigo && g.estado !== 'ANULADO').forEach((g) => {
    cuenta[g.valorUnitario] = (cuenta[g.valorUnitario] || 0) + (g.idProyecto === idProyecto ? 2 : 1);
  });
  return Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a]).slice(0, 3).map(Number);
}

function textoValor() {
  const v = Number(F.valor || 0), cant = Number(F.cantidad) || 1;
  if (cant !== 1) return { grande: moneda(v), chico: String(cant).replace('.', ',') + ' × ' + moneda(v) + ' = ' + moneda(Math.round(cant * v)) };
  return { grande: moneda(v), chico: '' };
}

function vistaGasto(idProyecto, idGasto) {
  const p = proyecto(idProyecto);
  if (!p) return vistaProyecto(idProyecto);
  if (!F || F.idProyecto !== idProyecto || (idGasto && F.idGasto !== idGasto) || (!idGasto && F.edicion)) {
    if (!abrirFormulario(idProyecto, idGasto)) return vistaProyecto(idProyecto);
  }
  const atras = '#/proyecto/' + encodeURIComponent(idProyecto);
  const titulo = F.edicion ? 'Corregir gasto' : 'Nuevo gasto';
  const cab = barraSuperior(titulo, atras) + '<main class="formulario"><div class="tenue centro">' + h(p.nombre) + '</div>';

  if (F.paso === 'categoria') {
    const rep = F.edicion ? null : repetibles(idProyecto);
    const bloqueRep = rep ? '<div class="repetir"><div class="repetir-titulo">🔁 Repetir ' + (diaLegible(rep.fecha) === 'Ayer' ? 'los de ayer' : 'los del ' + h(diaLegible(rep.fecha))) + '</div><div class="fichas">' +
      rep.items.map((g) => '<button class="ficha" data-accion="repetir" data-id="' + h(g.idGasto) + '">' + h(categoria(g.categoria).icono) + ' ' + (g.pagadoA ? h(g.pagadoA) + ' · ' : '') + '<b>' + moneda(g.total) + '</b></button>').join('') + '</div></div>' : '';
    const activas = E.categorias.filter((c) => c.activo !== false);
    return cab + bloqueRep + '<h2 class="centro">¿En qué se gastó?</h2><div class="categorias">' +
      activas.map((c) => '<button class="cat" data-accion="cat" data-codigo="' + h(c.codigo) + '"><span class="cat-icono">' + h(c.icono) + '</span><span>' + h(c.nombre) + '</span></button>').join('') +
      '</div>' + (activas.length ? '' : '<div class="vacio chico">No hay categorías disponibles. Actualice los datos con conexión.</div>') + '</main>';
  }

  const cat = categoria(F.categoria), tv = textoValor();
  const frecuentes = valoresFrecuentes(idProyecto, F.categoria);
  const personas = E.personas.filter((x) => x.activo !== false);
  const bloquePersona = cat.pidePersona
    ? '<div class="campo"><div class="campo-titulo">👤 ¿A quién se le pagó? <span class="obligatorio">obligatorio</span></div><div class="fichas">' +
      personas.map((x) => '<button class="ficha' + (F.pagadoA === x.nombre ? ' elegida' : '') + '" data-accion="persona" data-nombre="' + h(x.nombre) + '">' + h(x.nombre) + '</button>').join('') +
      '</div><input type="text" id="g-persona" maxlength="80" placeholder="Otro nombre (nombre y apellido)" value="' + (personas.some((x) => x.nombre === F.pagadoA) ? '' : h(F.pagadoA)) + '" autocomplete="off"></div>'
    : '';
  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'];
  return cab +
    '<button class="cat-elegida" data-accion="cambiar-cat"><span class="cat-icono">' + h(cat.icono) + '</span><span>' + h(cat.nombre) + '</span><span class="tenue">cambiar ›</span></button>' +
    '<div class="valor"><div class="valor-grande" id="g-valor">' + tv.grande + '</div><div class="valor-chico" id="g-valor-chico">' + h(tv.chico) + '</div></div>' +
    (frecuentes.length ? '<div class="fichas centro">' + frecuentes.map((v) => '<button class="ficha" data-accion="valor-frecuente" data-valor="' + v + '">' + moneda(v) + '</button>').join('') + '</div>' : '') +
    '<div class="teclado">' + teclas.map((t) => '<button class="tecla' + (t === '⌫' ? ' borrar' : '') + '" data-accion="tecla" data-tecla="' + t + '">' + t + '</button>').join('') + '</div>' +
    bloquePersona +
    '<button class="mas-detalles" data-accion="mas">' + (F.mas ? '▾' : '▸') + ' Más detalles (fecha, cantidad, descripción)</button>' +
    (F.mas ? '<div class="detalles">' +
      '<label>Fecha<input type="date" id="g-fecha" value="' + h(F.fecha) + '" max="' + hoyISO() + '" min="' + sumarDias(hoyISO(), -(E.parametros.diasAtrasMax || 60)) + '"></label>' +
      '<label>Cantidad <span class="tenue">(días, unidades…)</span><input type="number" id="g-cantidad" inputmode="decimal" min="0.01" step="0.01" value="' + h(F.cantidad) + '"></label>' +
      '<label class="ancho">Descripción <span class="tenue">(puede dictarla con el micrófono del teclado)</span><textarea id="g-descripcion" rows="2" maxlength="300">' + h(F.descripcion) + '</textarea></label>' +
      (cat.pidePersona ? '' : '<label class="ancho">Pagado a <span class="tenue">(opcional)</span><input type="text" id="g-pagado" maxlength="80" value="' + h(F.pagadoA) + '" autocomplete="off"></label>') +
      '</div>' : '') +
    '<button class="btn exito grande" data-accion="gasto-guardar" id="g-guardar">✓ Guardar gasto</button>' +
    '</main>';
}

function pintarValor() {
  const tv = textoValor();
  const a = $('#g-valor'), b = $('#g-valor-chico');
  if (a) a.textContent = tv.grande;
  if (b) b.textContent = tv.chico;
}

async function guardarGasto() {
  const cat = categoria(F.categoria);
  const valor = Number(F.valor || 0), cantidad = Math.round((Number(String(F.cantidad).replace(',', '.')) || 0) * 100) / 100;
  if (!(valor > 0)) return aviso('Escriba el valor del gasto.', 'error');
  if (!(cantidad > 0)) return aviso('La cantidad debe ser mayor que cero.', 'error');
  if (Math.round(valor * cantidad) > (E.parametros.valorMaximo || 50000000)) return aviso('El total supera el máximo permitido (' + moneda(E.parametros.valorMaximo) + '). Revise el valor.', 'error');
  const pagadoA = String(F.pagadoA || '').trim();
  if (cat.pidePersona && pagadoA.length < 3) return aviso('Indique a quién se le pagó.', 'error');
  if (!F.fecha || F.fecha > hoyISO()) return aviso('Revise la fecha del gasto.', 'error');
  const idProyecto = F.idProyecto;
  await Cola.poner({
    id: F.idGasto, tipo: 'GASTO', idProyecto,
    datos: {
      idGasto: F.idGasto, idProyecto, fecha: F.fecha, categoria: F.categoria, descripcion: String(F.descripcion || '').trim(),
      cantidad, valorUnitario: valor, pagadoA, origenDispositivo: dispositivo(), version: F.version
    }
  });
  F = null;
  aviso(E.enLinea && navigator.onLine ? 'Gasto guardado.' : 'Gasto guardado en el teléfono. Se enviará al volver la señal.');
  location.hash = '#/proyecto/' + encodeURIComponent(idProyecto);
  Cola.procesar({ forzar: true });
}

function dispositivo() {
  let id = localStorage.getItem('campo_dispositivo');
  if (!id) { id = nuevoUuid().slice(0, 8); localStorage.setItem('campo_dispositivo', id); }
  const ua = navigator.userAgent;
  const tipo = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : 'Computador';
  return tipo + ' ' + id;
}

function verGasto(idProyecto, idGasto) {
  const g = gastosVista(idProyecto).find((x) => x.idGasto === idGasto) || E.gastos.find((x) => x.idGasto === idGasto);
  if (!g) return;
  const cat = categoria(g.categoria), p = proyecto(g.idProyecto);
  const estado = g.enCola === 'RECHAZADO' ? '❌ Rechazado por el servidor: ' + h(g.errorCola || '') : g.enCola ? '⏫ Guardado en el teléfono, por enviar'
    : g.estado === 'APROBADO' ? (g.revisadoPor ? '✓ Aprobado por ' + h(g.revisadoPor) : 'Registrado') : g.estado === 'ANULADO' ? 'Anulado por ' + h(g.revisadoPor) + '. Motivo: ' + h(g.motivoAnulacion) : 'Por aprobar';
  const fila = (a, b) => b ? '<tr><td>' + a + '</td><td>' + b + '</td></tr>' : '';
  let botones = '';
  const editableAqui = g.editable && E.proyectos.some((x) => x.idProyecto === g.idProyecto);
  if (editableAqui) botones += '<a class="btn primario grande" href="#/gasto/' + encodeURIComponent(g.idProyecto) + '/' + encodeURIComponent(g.idGasto) + '" data-accion="ventana-cerrar-enlace">✏️ Corregir</a>';
  if (g.enCola === 'RECHAZADO') botones += '<button class="btn peligro grande" data-accion="cola-descartar" data-id="' + h(g.idGasto) + '">Descartar</button>';
  if (esAdmin() && !g.enCola) {
    if (g.estado === 'PENDIENTE') botones += '<button class="btn exito grande" data-accion="admin-aprobar" data-id="' + h(g.idGasto) + '">✓ Aprobar</button>';
    if (g.estado !== 'ANULADO') botones += '<button class="btn peligro grande" data-accion="admin-anular" data-id="' + h(g.idGasto) + '">✕ Anular</button>';
  }
  const noEditable = !g.editable && !esAdmin() && !g.enCola && g.estado !== 'ANULADO' && !(conAprobacion() && g.estado === 'APROBADO') ? '<p class="tenue">Ya pasaron ' + (E.parametros.horasEdicion || 24) + ' horas: para corregirlo, pídale el cambio al administrador.</p>' : '';
  Ventana.abrir('<h3>' + h(cat.icono) + ' ' + h(cat.nombre) + '</h3><div class="detalle-total">' + moneda(g.total) + '</div>' +
    '<table class="cifras">' + fila('Proyecto', h(p ? p.nombre : g.idProyecto)) + fila('Fecha', h(fechaCorta(g.fecha))) +
    (g.cantidad !== 1 ? fila('Cantidad × valor', String(g.cantidad).replace('.', ',') + ' × ' + moneda(g.valorUnitario)) : '') +
    fila('Pagado a', h(g.pagadoA)) + fila('Descripción', h(g.descripcion)) + fila('Registró', h(g.registradoPor)) + fila('Estado', estado) + '</table>' +
    (g.posibleDuplicado ? '<p class="gasto-dup">⚠️ Hay otro gasto igual (mismo día, categoría, valor y persona). Revise si está repetido.</p>' : '') + noEditable +
    '<div class="hoja-botones">' + botones + '<button class="btn plano grande" data-accion="ventana-no">Cerrar</button></div>');
}

// ─────────────────────────── 4b. Presupuesto del proyecto ───────────────────────────
const UNIDADES = ['un', 'día', 'global', 'viaje', 'm', 'hora'];

/** Ítems de presupuesto que esperan en la cola (ya se cuentan en el presupuesto que ve el ingeniero). */
function presupuestoEnCola(idProyecto) {
  return Cola.mios().filter((i) => i.tipo === 'PRESUPUESTO' && i.idProyecto === idProyecto);
}

/** Trae de NODIA las líneas del presupuesto. Sin señal se muestra lo último guardado en el teléfono. */
async function cargarPresupuesto(idProyecto) {
  if (!Sesion.datos || Sesion.datos.debeCambiarClave || !idProyecto) return;
  try {
    const r = await API.nodia('campoPresupuestoListar', { idProyecto });
    E.presupuestos[idProyecto] = { lineas: r.lineas || [], presupuestoTotal: r.presupuestoTotal || 0, cuando: new Date().toISOString() };
    const p = E.proyectos.find((x) => x.idProyecto === idProyecto);
    if (p) p.presupuestoTotal = r.presupuestoTotal || 0;
    guardarCopia();
    renderSuave();
  } catch (e) {
    if (!e.esRed && e.codigo !== 401) aviso(e.message, 'error');
  }
}

function vistaPresupuesto(idProyecto) {
  const p = E.proyectos.find((x) => x.idProyecto === idProyecto);
  if (!p) return vistaProyecto(idProyecto);
  const atras = '#/proyecto/' + encodeURIComponent(idProyecto);
  const guardado = E.presupuestos[idProyecto];
  const enCola = presupuestoEnCola(idProyecto);
  const c = cifras(p);
  const fila = (desc, cant, unidad, costo, total, marca) => '<div class="presu-linea"><span class="presu-linea-centro"><span class="gasto-cat">' + h(desc) + '</span>' +
    '<span class="gasto-det">' + String(cant).replace('.', ',') + ' ' + h(unidad) + ' × ' + moneda(costo) + '</span></span>' +
    '<span class="gasto-der"><span class="gasto-total">' + moneda(total) + '</span>' + (marca || '') + '</span></div>';
  let lista = '';
  if (guardado) lista += guardado.lineas.map((l) => fila(l.descripcion, l.cantidad, l.unidad, l.costoUnitario, l.total)).join('');
  lista += enCola.map((i) => fila(i.datos.descripcion, i.datos.cantidad, i.datos.unidad, i.datos.costoUnitario, Math.round(i.datos.cantidad * i.datos.costoUnitario),
    i.estado === 'RECHAZADO' ? '<span class="chip rechazado">❌ rechazado</span>' : '<span class="chip por-enviar">⏫ por enviar</span>')).join('');
  if (!lista) lista = guardado ? '<div class="vacio chico">Este proyecto aún no tiene ítems de presupuesto.</div>'
    : '<div class="vacio chico">' + (E.enLinea ? '⏳ Cargando el presupuesto…' : 'Sin conexión: el detalle se verá cuando vuelva la señal. Puede agregar ítems igual.') + '</div>';
  return barraSuperior('Presupuesto', atras) + '<main class="con-flotante"><div class="tenue centro">' + h(p.nombre) + '</div>' +
    '<div class="tarjeta"><div class="presu-total"><span>Presupuesto del proyecto</span><b>' + moneda(c.presupuesto) + '</b></div>' +
    '<div class="tenue">Gastado hasta hoy: ' + moneda(c.gastado) + (c.pct === null ? '' : ' (' + c.pct + ' %)') + '</div></div>' +
    '<div class="tarjeta"><h2>Ítems del presupuesto</h2>' + lista + '</div>' +
    '<p class="tenue">Aquí puede agregar ítems. Para corregir o quitar uno, se hace en NODIA.</p></main>' +
    '<button class="flotante" data-accion="presu-nuevo" data-id="' + h(idProyecto) + '">＋ Ítem de presupuesto</button>' + barraInferior('proyectos');
}

function abrirItemPresupuesto(idProyecto) {
  const sugeridos = E.categorias.filter((x) => x.activo !== false).slice(0, 6);
  Ventana.abrir('<h3>Nuevo ítem de presupuesto</h3>' +
    '<label>Descripción<input type="text" id="pr-descripcion" maxlength="120" autocomplete="off" placeholder="Ej.: Mano de obra contratada"></label>' +
    (sugeridos.length ? '<div class="fichas">' + sugeridos.map((x) => '<button class="ficha" data-accion="presu-sugerido" data-texto="' + h(x.nombre) + '">' + h(x.icono) + ' ' + h(x.nombre) + '</button>').join('') + '</div>' : '') +
    '<div class="detalles sin-caja"><label>Cantidad<input type="number" id="pr-cantidad" inputmode="decimal" min="0.01" step="0.01" value="1"></label>' +
    '<label>Costo unitario ($)<input type="text" id="pr-costo" inputmode="numeric" autocomplete="off" placeholder="0"></label></div>' +
    '<div class="campo-titulo">Unidad</div><div class="fichas" id="pr-unidades">' + UNIDADES.map((u, i) => '<button class="ficha' + (i === 0 ? ' elegida' : '') + '" data-accion="presu-unidad" data-unidad="' + u + '">' + u + '</button>').join('') + '</div>' +
    '<div class="presu-total"><span>Total del ítem</span><b id="pr-total">$ 0</b></div>' +
    '<div class="hoja-botones"><button class="btn exito grande" data-accion="presu-guardar" data-id="' + h(idProyecto) + '">✓ Agregar al presupuesto</button><button class="btn plano grande" data-accion="ventana-no">Cancelar</button></div>');
}
const soloDigitos = (t) => String(t || '').replace(/\D/g, '').replace(/^0+/, '').slice(0, 10);
function pintarTotalItem() {
  const costo = $('#pr-costo'), cant = $('#pr-cantidad'), total = $('#pr-total');
  if (!costo || !total) return;
  const d = soloDigitos(costo.value);
  costo.value = d ? miles(d) : '';
  total.textContent = moneda(Math.round((Number(String(cant.value).replace(',', '.')) || 0) * Number(d || 0)));
}
async function guardarItemPresupuesto(idProyecto) {
  const descripcion = ($('#pr-descripcion').value || '').replace(/\s+/g, ' ').trim();
  const cantidad = Math.round((Number(String($('#pr-cantidad').value).replace(',', '.')) || 0) * 100) / 100;
  const costoUnitario = Number(soloDigitos($('#pr-costo').value) || 0);
  const elegida = $('#pr-unidades .elegida');
  const unidad = elegida ? elegida.dataset.unidad : 'un';
  if (descripcion.length < 3) return aviso('Escriba la descripción del ítem.', 'error');
  if (!(cantidad > 0)) return aviso('La cantidad debe ser mayor que cero.', 'error');
  if (!(costoUnitario > 0)) return aviso('Escriba el costo unitario.', 'error');
  const idLinea = nuevoUuid();
  Ventana.cerrar(false);
  await Cola.poner({ id: idLinea, tipo: 'PRESUPUESTO', idProyecto, datos: { idProyecto, idLinea, descripcion, unidad, cantidad, costoUnitario } });
  aviso(E.enLinea && navigator.onLine ? 'Ítem agregado al presupuesto.' : 'Ítem guardado en el teléfono. Se enviará al volver la señal.');
  Cola.procesar({ forzar: true });
}

// ─────────────────────────── 5. Pendientes de enviar ───────────────────────────
function vistaPendientes() {
  const mios = Cola.mios(), ajenos = Cola.ajenos();
  const fila = (i) => {
    const p = proyecto(i.idProyecto);
    let titulo, valor = '';
    if (i.tipo === 'GASTO') { const c = categoria(i.datos.categoria); titulo = c.icono + ' ' + c.nombre; valor = moneda(Math.round(i.datos.cantidad * i.datos.valorUnitario)); }
    else if (i.tipo === 'PRESUPUESTO') { titulo = '📋 Ítem de presupuesto: ' + i.datos.descripcion; valor = moneda(Math.round(i.datos.cantidad * i.datos.costoUnitario)); }
    else titulo = '🕒 ' + EVENTOS[i.datos.evento].hecho + ' del proyecto';
    let estado;
    if (i.estado === 'RECHAZADO') estado = '<span class="cola-estado rechazado">❌ Rechazado: ' + h(i.ultimoError) + '</span>';
    else if (i.estado === 'ENVIANDO') estado = '<span class="cola-estado enviando">⏳ Enviando…</span>';
    else if (i.intentos) estado = '<span class="cola-estado espera">🔁 Sin conexión · intento ' + i.intentos + ' · se reintenta solo</span>';
    else estado = '<span class="cola-estado espera">⏳ Esperando para enviar</span>';
    const botones = i.estado === 'RECHAZADO'
      ? '<div class="cola-botones">' + (i.tipo === 'GASTO' ? '<a class="btn mini" href="#/gasto/' + encodeURIComponent(i.idProyecto) + '/' + encodeURIComponent(i.id) + '">✏️ Corregir</a>' : '') +
      '<button class="btn mini peligro" data-accion="cola-descartar" data-id="' + h(i.id) + '">Descartar</button></div>' : '';
    return '<div class="cola-item"><div class="cola-cab"><b>' + h(titulo) + '</b><b>' + valor + '</b></div><div class="tenue">' + h(p ? p.nombre : i.idProyecto) + ' · ' + h(horaLegible(new Date(i.creadoEn))) + '</div>' + estado + botones + '</div>';
  };
  let cuerpo;
  if (!mios.length) cuerpo = '<div class="vacio"><div class="vacio-icono">✅</div><b>Todo está enviado</b><p>No hay registros esperando en este teléfono.</p></div>';
  else cuerpo = '<div class="tarjeta">' + mios.map(fila).join('') + '</div><button class="btn primario grande" data-accion="cola-enviar"' + (Cola.ocupada ? ' disabled' : '') + '>' + (Cola.ocupada ? '⏳ Enviando…' : '⏫ Enviar ahora') + '</button>';
  if (ajenos.length) cuerpo += '<div class="nota">📱 Hay ' + ajenos.length + ' registro(s) de otro usuario (' + h(Array.from(new Set(ajenos.map((a) => a.usuario))).join(', ')) + '). Se enviarán cuando esa persona ingrese en este teléfono.</div>';
  return barraSuperior('Por enviar') + '<main>' +
    '<p class="tenue">Lo que registra queda primero en el teléfono y se envía solo cuando hay señal. Nada se duplica aunque se reintente.</p>' + cuerpo + '</main>' + barraInferior('pendientes');
}

// ─────────────────────────── 6. Administración ───────────────────────────
function vistaAdmin() {
  if (!esAdmin()) return vistaProyectos();
  const pest = (id, texto) => '<button class="' + (E.adminPestana === id ? 'activa' : '') + '" data-accion="admin-pestana" data-id="' + id + '">' + texto + '</button>';
  const nPend = E.gastos.filter((g) => g.estado === 'PENDIENTE').length;
  let cuerpo = '';
  // Sin aprobación la lista es de revisión: «Registrados» (para corregir o anular) y «Anulados».
  if (!conAprobacion() && !nPend && E.adminFiltro !== 'ANULADO') E.adminFiltro = 'ACTIVOS';
  if ((conAprobacion() || nPend) && E.adminFiltro === 'ACTIVOS') E.adminFiltro = 'PENDIENTE';

  if (E.adminPestana === 'aprobar') {
    const filtro = (id, texto) => '<button class="' + (E.adminFiltro === id ? 'activa' : '') + '" data-accion="admin-filtro" data-id="' + id + '">' + texto + '</button>';
    const lista = E.gastos.filter((g) => E.adminFiltro === 'ACTIVOS' ? g.estado !== 'ANULADO' : g.estado === E.adminFiltro);
    const grupos = [];
    lista.forEach((g) => { let x = grupos.find((y) => y.id === g.idProyecto); if (!x) { x = { id: g.idProyecto, items: [] }; grupos.push(x); } x.items.push(g); });
    cuerpo = '<div class="segmento chico">' + (E.adminFiltro === 'ACTIVOS' ? filtro('ACTIVOS', 'Registrados') : filtro('PENDIENTE', 'Por aprobar') + filtro('APROBADO', conAprobacion() ? 'Aprobados' : 'Registrados')) + filtro('ANULADO', 'Anulados') + '</div>' +
      (conAprobacion() ? '' : '<p class="tenue">Los gastos cuentan desde que se registran. Aquí puede revisarlos, corregirlos (tocando el gasto) o anularlos.</p>');
    if (!grupos.length) cuerpo += '<div class="vacio"><div class="vacio-icono">' + (E.adminFiltro === 'PENDIENTE' ? '✅' : '🗂️') + '</div><b>' + (E.adminFiltro === 'PENDIENTE' ? 'No hay gastos por aprobar' : E.adminFiltro === 'ACTIVOS' ? 'Aún no hay gastos registrados' : 'No hay gastos en este estado') + '</b></div>';
    cuerpo += grupos.map((gr) => {
      const p = proyecto(gr.id), total = gr.items.reduce((s, g) => s + g.total, 0);
      gr.items.sort((a, b) => (b.fecha + b.registradoEn).localeCompare(a.fecha + a.registradoEn));
      return '<div class="tarjeta"><div class="grupo-cab"><div><b>' + h(p ? p.nombre : gr.id) + '</b><div class="tenue">' + gr.items.length + ' gasto(s) · ' + moneda(total) + '</div></div>' +
        (E.adminFiltro === 'PENDIENTE' && gr.items.length > 1 ? '<button class="btn mini exito" data-accion="admin-aprobar-todos" data-id="' + h(gr.id) + '">✓ Aprobar los ' + gr.items.length + '</button>' : '') + '</div>' +
        gr.items.map((g) => '<div class="revision">' + filaGasto(g, true) +
          (g.estado === 'ANULADO' ? '<div class="tenue motivo">Motivo: ' + h(g.motivoAnulacion) + '</div>' :
            '<div class="revision-botones">' + (g.estado === 'PENDIENTE' ? '<button class="btn exito" data-accion="admin-aprobar" data-id="' + h(g.idGasto) + '">✓ Aprobar</button>' : '') +
            '<button class="btn peligro-suave" data-accion="admin-anular" data-id="' + h(g.idGasto) + '">✕ Anular</button></div>') + '</div>').join('') + '</div>';
    }).join('');
  } else if (E.adminPestana === 'totales') {
    const ids = Array.from(new Set(E.proyectos.map((p) => p.idProyecto).concat(E.totales.map((t) => t.idProyecto))));
    cuerpo = (E.totalesPorEntregar ? '<div class="nota">⏳ Hay ' + E.totalesPorEntregar + ' proyecto(s) con totales aún por entregar a NODIA (se reintenta solo). <button class="btn mini" data-accion="admin-reenviar">Reintentar ahora</button></div>' : '') +
      ids.map((id) => {
        const p = proyecto(id) || { idProyecto: id, nombre: id, presupuestoTotal: 0, comprasTotal: 0 };
        const c = cifras(p);
        return '<div class="tarjeta"><b>' + h(p.nombre) + '</b><div class="tenue">' + h(id) + (p.tecnico ? ' · ' + h(p.tecnico) : '') + (p.estado ? ' · ' + h(NOMBRE_ESTADO[p.estado] || p.estado) : '') + '</div>' +
          '<table class="cifras"><tr><td>Presupuestado</td><td>' + moneda(c.presupuesto) + '</td></tr><tr><td>Compras (NODIA)</td><td>' + moneda(c.compras) + '</td></tr>' +
          filasCampo(c) +
          '<tr class="fuerte"><td>Real total</td><td>' + moneda(c.gastado) + '</td></tr>' +
          '<tr class="' + (c.disponible < 0 ? 'rojo' : '') + '"><td>Diferencia</td><td>' + (c.disponible < 0 ? '− ' : '') + moneda(Math.abs(c.disponible)) + '</td></tr></table></div>';
      }).join('') || '<div class="vacio">Sin proyectos.</div>';
  } else {
    cuerpo = '<div class="tarjeta"><h2>Categorías de gasto</h2>' +
      E.categorias.map((c) => '<div class="catalogo' + (c.activo ? '' : ' inactivo') + '"><span class="cat-icono chico">' + h(c.icono) + '</span><span class="catalogo-nombre">' + h(c.nombre) + (c.pidePersona ? ' <span class="chip pendiente">pide persona</span>' : '') + (c.activo ? '' : ' <span class="chip anulado">inactiva</span>') + '</span>' +
        '<button class="btn mini" data-accion="cat-editar" data-codigo="' + h(c.codigo) + '">Editar</button></div>').join('') +
      '<button class="btn primario" data-accion="cat-editar" data-codigo="">＋ Nueva categoría</button></div>' +
      '<div class="tarjeta"><h2>Personas (mano de obra)</h2>' +
      (E.personas.map((x) => '<div class="catalogo' + (x.activo ? '' : ' inactivo') + '"><span class="catalogo-nombre">👤 ' + h(x.nombre) + (x.activo ? '' : ' <span class="chip anulado">inactiva</span>') + '</span>' +
        '<button class="btn mini" data-accion="persona-editar" data-id="' + h(x.idPersona) + '">Editar</button></div>').join('') || '<div class="tenue">Aún no hay personas.</div>') +
      '<button class="btn primario" data-accion="persona-editar" data-id="">＋ Nueva persona</button></div>' +
      '<div class="tarjeta"><h2>Ajustes</h2><div class="catalogo"><span class="catalogo-nombre">Aprobación de gastos<br><span class="tenue">' +
      (conAprobacion() ? 'Activa: cada gasto queda «por aprobar» hasta que un administrador lo apruebe.' : 'Desactivada: lo que se registra cuenta de inmediato como gasto real.') + '</span></span>' +
      '<button class="btn mini" data-accion="ajuste-aprobacion">' + (conAprobacion() ? 'Quitar' : 'Exigir') + '</button></div></div>';
  }
  return barraSuperior('Administración') + '<main><div class="segmento">' + pest('aprobar', 'Gastos' + (nPend ? ' (' + nPend + ')' : '')) + pest('totales', 'Totales') + pest('catalogos', 'Catálogos') + '</div>' + cuerpo + '</main>' + barraInferior('admin');
}

/** Acciones del administrador: necesitan conexión (no van a la cola). */
async function accionAdmin(boton, fn, mensajeOk) {
  if (boton && boton.disabled) return;
  const texto = boton ? boton.textContent : '';
  if (boton) { boton.disabled = true; boton.textContent = '⏳'; }
  try {
    await fn();
    if (mensajeOk) aviso(mensajeOk);
    await refrescar({ silencioso: true });
  } catch (e) {
    aviso(e.esRed ? 'Sin conexión. Esta acción necesita señal; intente de nuevo.' : e.message, 'error');
    if (boton && boton.isConnected) { boton.disabled = false; boton.textContent = texto; }
  }
}

function editarCategoria(codigo) {
  const c = codigo ? categoria(codigo) : { codigo: '', nombre: '', icono: '📦', orden: E.categorias.length + 1, activo: true, pidePersona: false };
  const iconos = ['🥤', '🍽️', '🚚', '⛽', '👷', '🧰', '🏗️', '🔌', '🅿️', '🏨', '📦', '🧾'];
  Ventana.abrir('<h3>' + (codigo ? 'Editar categoría' : 'Nueva categoría') + '</h3>' +
    '<label>Nombre<input type="text" id="c-nombre" maxlength="40" value="' + h(c.nombre) + '"></label>' +
    '<div class="campo-titulo">Ícono</div><div class="fichas" id="c-iconos">' + iconos.map((i) => '<button class="ficha icono' + (i === c.icono ? ' elegida' : '') + '" data-accion="icono" data-icono="' + i + '">' + i + '</button>').join('') + '</div>' +
    '<label class="casilla"><input type="checkbox" id="c-persona"' + (c.pidePersona ? ' checked' : '') + '> Pedir el nombre de la persona (mano de obra)</label>' +
    '<label class="casilla"><input type="checkbox" id="c-activo"' + (c.activo ? ' checked' : '') + '> Activa (aparece al registrar gastos)</label>' +
    '<div class="hoja-botones"><button class="btn primario grande" data-accion="cat-guardar" data-codigo="' + h(c.codigo) + '" data-orden="' + h(c.orden) + '">Guardar</button><button class="btn plano grande" data-accion="ventana-no">Cancelar</button></div>');
}
function editarPersona(id) {
  const x = id ? E.personas.find((y) => y.idPersona === id) : { idPersona: '', nombre: '', activo: true };
  if (!x) return;
  Ventana.abrir('<h3>' + (id ? 'Editar persona' : 'Nueva persona') + '</h3>' +
    '<label>Nombre y apellido<input type="text" id="p-nombre" maxlength="80" value="' + h(x.nombre) + '"></label>' +
    '<label class="casilla"><input type="checkbox" id="p-activo"' + (x.activo ? ' checked' : '') + '> Activa (aparece en la lista al registrar)</label>' +
    '<div class="hoja-botones"><button class="btn primario grande" data-accion="persona-guardar" data-id="' + h(x.idPersona) + '">Guardar</button><button class="btn plano grande" data-accion="ventana-no">Cancelar</button></div>');
}

// ─────────────────────────── Cuenta ───────────────────────────
function vistaCuenta() {
  const s = Sesion.datos;
  return barraSuperior('Cuenta') + '<main><div class="tarjeta"><div class="cuenta-nombre">👤 ' + h(s.nombre) + '</div>' +
    '<table class="cifras"><tr><td>Usuario</td><td>' + h(s.usuario) + '</td></tr><tr><td>Rol</td><td>' + h(s.rol) + '</td></tr>' +
    '<tr><td>Sesión válida hasta</td><td>' + (s.expiraEn ? h(horaLegible(new Date(s.expiraEn))) : '—') + '</td></tr>' +
    '<tr><td>Última actualización</td><td>' + (E.ultimaSync ? h(horaLegible(new Date(E.ultimaSync))) : '—') + '</td></tr>' +
    '<tr><td>Versión</td><td>' + h(CONFIG.version) + (CONFIG.entorno ? ' · ' + h(CONFIG.entorno) : '') + '</td></tr></table></div>' +
    '<button class="btn primario grande" data-accion="refrescar">↻ Actualizar datos</button>' +
    '<button class="btn plano grande" data-accion="salir">Cerrar sesión</button>' +
    '<p class="tenue centro">Para instalarla: en el menú del navegador elija «Agregar a la pantalla de inicio».</p></main>' + barraInferior('cuenta');
}
async function salir() {
  const n = Cola.porEnviar().length;
  const si = await Ventana.confirmar({
    titulo: '¿Cerrar sesión?', si: 'Cerrar sesión', peligro: true,
    texto: n ? 'Tiene <b>' + n + ' registro(s) sin enviar</b>. No se pierden: quedan en este teléfono y se enviarán cuando vuelva a ingresar.' : 'Tendrá que escribir su usuario y contraseña para volver a entrar.'
  });
  if (!si) return;
  try { await Promise.allSettled([API.campo('salir', {}), API.nodia('logout', {})]); } catch (e) { /* sin señal: se cierra igual en el teléfono */ }
  cerrarSesionLocal();
}
function cerrarSesionLocal(mensaje) {
  Sesion.cerrar();
  ['proyectos', 'gastos', 'totales', 'adminProyectos'].forEach((k) => { E[k] = []; });
  E.presupuestos = {};
  E.ultimaSync = null; F = null;
  if (Ventana.abierta()) Ventana.cerrar(false);
  location.hash = '';
  render();
  if (mensaje) aviso(mensaje, 'alerta');
}

// ─────────────────────────── dibujo y navegación ───────────────────────────
function ruta() { return location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent); }

function render() {
  E.renderPendiente = false;
  const app = $('#app');
  if (!Sesion.datos) { app.innerHTML = vistaIngreso(); return; }
  if (Sesion.datos.debeCambiarClave) { app.innerHTML = vistaCambiarClave(); return; }
  const r = ruta();
  if (r[0] !== 'gasto') F = null;
  let html;
  switch (r[0]) {
    case 'proyecto': html = vistaProyecto(r[1]); break;
    case 'gasto': html = vistaGasto(r[1], r[2]); break;
    case 'presupuesto': html = vistaPresupuesto(r[1]); break;
    case 'pendientes': html = vistaPendientes(); break;
    case 'admin': html = vistaAdmin(); break;
    case 'cuenta': html = vistaCuenta(); break;
    default: html = vistaProyectos();
  }
  app.innerHTML = html;
}
/** Redibuja sin interrumpir a quien está escribiendo o tiene una ventana abierta. */
function renderSuave() {
  const a = document.activeElement;
  const escribiendo = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  if (escribiendo || Ventana.abierta()) { E.renderPendiente = true; return; }
  render();
}

// ─────────────────────────── eventos de pantalla ───────────────────────────
document.addEventListener('submit', (ev) => {
  if (ev.target.dataset.form === 'ingreso') { ev.preventDefault(); ingresar(ev.target); }
  if (ev.target.dataset.form === 'clave') { ev.preventDefault(); cambiarClave(); }
});

document.addEventListener('input', (ev) => {
  if (ev.target.id === 'pr-costo' || ev.target.id === 'pr-cantidad') { pintarTotalItem(); return; }
  if (!F) return;
  const t = ev.target;
  if (t.id === 'g-persona') { F.pagadoA = t.value; document.querySelectorAll('[data-accion="persona"]').forEach((b) => b.classList.remove('elegida')); }
  else if (t.id === 'g-pagado') F.pagadoA = t.value;
  else if (t.id === 'g-descripcion') F.descripcion = t.value;
  else if (t.id === 'g-fecha') F.fecha = t.value;
  else if (t.id === 'g-cantidad') { F.cantidad = t.value; pintarValor(); }
});
// Los campos protegidos contra el relleno automático se habilitan cuando la persona los toca.
// (pointerdown ocurre antes del foco: así el teclado del celular abre al primer toque.)
['pointerdown', 'focusin'].forEach((tipo) => document.addEventListener(tipo, (ev) => {
  if (ev.target && ev.target.dataset && 'sinRelleno' in ev.target.dataset) ev.target.removeAttribute('readonly');
}, true));
document.addEventListener('focusout', () => { setTimeout(() => { if (E.renderPendiente) renderSuave(); }, 150); });

document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-accion]');
  if (!el) return;
  const a = el.dataset.accion, d = el.dataset;
  switch (a) {
    case 'ventana-cerrar': case 'ventana-no': Ventana.cerrar(false); break;
    case 'ventana-si': Ventana.cerrar(true); break;
    case 'ventana-texto-ok': Ventana.cerrar(($('#ventana-texto').value || '').trim() || ''); break;
    case 'ventana-cerrar-enlace': Ventana.cerrar(false); break;
    case 'refrescar': refrescar({ avisar: true }); Cola.procesar({ forzar: true }); break;
    case 'marcar': marcar(d.id, d.evento); break;
    case 'gasto-ver': verGasto(d.proyecto, d.id); break;
    case 'cat': F.categoria = d.codigo; F.paso = 'valor'; if (!categoria(d.codigo).pidePersona) F.pagadoA = ''; render(); break;
    case 'cambiar-cat': F.paso = 'categoria'; render(); break;
    case 'repetir': {
      const g = gastosVista(F.idProyecto).find((x) => x.idGasto === d.id);
      if (g) { Object.assign(F, { categoria: g.categoria, valor: String(g.valorUnitario), cantidad: g.cantidad || 1, pagadoA: g.pagadoA || '', descripcion: g.descripcion || '', paso: 'valor', mas: !!g.descripcion || g.cantidad !== 1 }); render(); }
      break;
    }
    case 'tecla': {
      const t = d.tecla;
      if (t === '⌫') F.valor = F.valor.slice(0, -1);
      else if ((F.valor + t).replace(/^0+/, '').length <= 9) F.valor = (F.valor + t).replace(/^0+/, '');
      pintarValor();
      break;
    }
    case 'valor-frecuente': F.valor = String(d.valor); pintarValor(); break;
    case 'persona': F.pagadoA = d.nombre; render(); break;
    case 'mas': F.mas = !F.mas; render(); break;
    case 'gasto-guardar': guardarGasto(); break;
    case 'cola-enviar': Cola.procesar({ forzar: true }); break;
    case 'presu-nuevo': abrirItemPresupuesto(d.id); break;
    case 'presu-sugerido': $('#pr-descripcion').value = d.texto; break;
    case 'presu-unidad': document.querySelectorAll('#pr-unidades .ficha').forEach((b) => b.classList.remove('elegida')); el.classList.add('elegida'); break;
    case 'presu-guardar': guardarItemPresupuesto(d.id); break;
    case 'cola-descartar': {
      if (Ventana.abierta()) Ventana.cerrar(false);
      const si = await Ventana.confirmar({ titulo: '¿Descartar este registro?', texto: 'El servidor lo rechazó. Si lo descarta, se quita de este teléfono.', si: 'Descartar', peligro: true });
      if (si) { await Cola.quitar(d.id); aviso('Registro descartado.', 'alerta'); }
      break;
    }
    case 'salir': salir(); break;
    case 'salir-directo': claveReciente = ''; try { await API.nodia('logout', {}); } catch (e) { /* se cierra igual en el teléfono */ } cerrarSesionLocal(); break;
    case 'ajuste-aprobacion': {
      const exigir = !conAprobacion();
      const porAprobar = E.gastos.filter((g) => g.estado === 'PENDIENTE').length;
      const si = await Ventana.confirmar(exigir
        ? { titulo: '¿Exigir aprobación de los gastos?', texto: 'Desde ahora cada gasto nuevo quedará «por aprobar» hasta que un administrador lo apruebe.', si: 'Sí, exigir aprobación' }
        : { titulo: '¿Quitar la aprobación?', texto: 'Lo que se registre contará de inmediato como gasto real.' + (porAprobar ? ' Los <b>' + porAprobar + '</b> gastos que están por aprobar quedarán aprobados.' : ''), si: 'Sí, quitar aprobación' });
      if (si) accionAdmin(null, () => API.campo('ajustesGuardar', { requiereAprobacion: exigir }), 'Ajuste guardado.');
      break;
    }
    case 'admin-pestana': E.adminPestana = d.id; render(); break;
    case 'admin-filtro': E.adminFiltro = d.id; render(); break;
    case 'admin-aprobar': {
      const id = d.id;
      if (Ventana.abierta()) Ventana.cerrar(false);
      accionAdmin(el.isConnected ? el : null, () => API.campo('gastoAprobar', { idGasto: id }), 'Gasto aprobado.');
      break;
    }
    case 'admin-aprobar-todos': {
      const lista = E.gastos.filter((g) => g.idProyecto === d.id && g.estado === 'PENDIENTE');
      const p = proyecto(d.id);
      const si = await Ventana.confirmar({ titulo: '¿Aprobar ' + lista.length + ' gastos?', texto: '<b>' + h(p ? p.nombre : d.id) + '</b><br>Total: <b>' + moneda(lista.reduce((s, g) => s + g.total, 0)) + '</b>', si: 'Sí, aprobar todos' });
      if (si) accionAdmin(null, () => API.campo('gastoAprobar', { idGastos: lista.map((g) => g.idGasto) }), lista.length + ' gastos aprobados.');
      break;
    }
    case 'admin-anular': {
      const id = d.id, g = E.gastos.find((x) => x.idGasto === id);
      if (Ventana.abierta()) Ventana.cerrar(false);
      const motivo = await Ventana.pedirTexto({ titulo: '¿Anular este gasto?', texto: g ? h(categoria(g.categoria).nombre) + ' · <b>' + moneda(g.total) + '</b> · ' + h(g.registradoPor) + '<br>El gasto no se borra: queda anulado con el motivo.' : '', ayuda: 'Motivo de la anulación', si: 'Anular gasto', peligro: true });
      if (motivo === false) break;
      if (String(motivo).length < 5) { aviso('Escriba el motivo de la anulación.', 'error'); break; }
      accionAdmin(null, () => API.campo('gastoAnular', { idGasto: id, motivo }), 'Gasto anulado.');
      break;
    }
    case 'admin-reenviar': accionAdmin(el, () => API.campo('reenviarTotales', {}), 'Reintento hecho.'); break;
    case 'cat-editar': editarCategoria(d.codigo); break;
    case 'icono': document.querySelectorAll('#c-iconos .ficha').forEach((b) => b.classList.remove('elegida')); el.classList.add('elegida'); break;
    case 'cat-guardar': {
      const datos = { codigo: d.codigo, nombre: $('#c-nombre').value, icono: ($('#c-iconos .elegida') || {}).dataset ? $('#c-iconos .elegida').dataset.icono : '📦', orden: Number(d.orden) || 50, pidePersona: $('#c-persona').checked, activo: $('#c-activo').checked };
      Ventana.cerrar(false);
      accionAdmin(null, () => API.campo('categoriaGuardar', datos), 'Categoría guardada.');
      break;
    }
    case 'persona-editar': editarPersona(d.id); break;
    case 'persona-guardar': {
      const datos = { idPersona: d.id, nombre: $('#p-nombre').value, activo: $('#p-activo').checked };
      Ventana.cerrar(false);
      accionAdmin(null, () => API.campo('personaGuardar', datos), 'Persona guardada.');
      break;
    }
  }
});

window.addEventListener('hashchange', () => {
  if (Ventana.abierta()) Ventana.cerrar(false);
  render(); window.scrollTo(0, 0);
  const r = ruta();
  if (r[0] === 'presupuesto') cargarPresupuesto(r[1]);
});
window.addEventListener('online', () => { E.enLinea = true; renderSuave(); Cola.procesar({ forzar: true }); refrescar({ silencioso: true }); });
window.addEventListener('offline', () => { E.enLinea = false; renderSuave(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && Sesion.datos) { Cola.procesar({ forzar: true }); refrescar({ silencioso: true }); } });

API.alCambiarConexion = (enLinea) => { if (E.enLinea !== enLinea) { E.enLinea = enLinea; renderSuave(); } };
API.alVencerSesion = () => { if (Sesion.datos) cerrarSesionLocal('Su sesión venció. Ingrese de nuevo; lo que no se ha enviado sigue guardado en el teléfono.'); };

// ─────────────────────────── arranque ───────────────────────────
(async function arrancar() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Sin modo sin conexión para la app:', e));
  Sesion.cargar();
  try { await Cola.cargar(); } catch (e) { console.warn('No se pudo leer la cola', e); }
  if (Sesion.datos) await cargarCopia();
  render();
  if (Sesion.datos && !Sesion.datos.debeCambiarClave) {
    await refrescar({ silencioso: true });
    Cola.procesar({ forzar: true });
    const r0 = ruta();
    if (r0[0] === 'presupuesto') cargarPresupuesto(r0[1]);
  }
})();
