// Cola sin conexión: todo gasto o evento se guarda PRIMERO en el teléfono con su UUID y se envía
// cuando hay señal. Si no se sabe si llegó, se reenvía: el servidor responde «ya existía» y no duplica.
// Un elemento de la cola nunca contiene el token.
const Cola = {
  items: [],
  ocupada: false,
  _reloj: null,
  ESPERAS_SEG: [5, 15, 30, 60, 120, 300], // espera creciente entre reintentos
  alCambiar: () => {},   // lo define app.js (para redibujar)
  alEnviar: () => {},    // lo define app.js (para refrescar datos tras un envío)
  alQuedarEnEspera: () => {}, // lo define app.js (avisa la primera vez que algo no pudo salir)
  aplicar: {},           // lo define app.js: { gasto(g), estadoProyecto(id, r) }

  async cargar() {
    this.items = (await Almacen.colaTodos()).sort((a, b) => String(a.creadoEn).localeCompare(String(b.creadoEn)));
    // Si la app se cerró a mitad de un envío, ese elemento vuelve a «pendiente» (reenviarlo es seguro).
    for (const it of this.items) if (it.estado === 'ENVIANDO') { it.estado = 'PENDIENTE'; await Almacen.colaPoner(it); }
  },

  /** Los del usuario que tiene la sesión abierta (los de otro usuario esperan a que él ingrese). */
  mios() { const u = Sesion.datos && Sesion.datos.usuario; return this.items.filter((i) => i.usuario === u); },
  ajenos() { const u = Sesion.datos && Sesion.datos.usuario; return this.items.filter((i) => i.usuario !== u); },
  porEnviar() { return this.mios().filter((i) => i.estado !== 'RECHAZADO'); },
  buscar(id) { return this.items.find((i) => i.id === id); },

  async poner(item) {
    const previo = this.buscar(item.id);
    if (previo) {
      Object.assign(previo, item, { rev: (previo.rev || 0) + 1, estado: 'PENDIENTE', intentos: 0, proximoIntento: 0, ultimoError: '' });
      await Almacen.colaPoner(previo);
    } else {
      const nuevo = Object.assign({ creadoEn: new Date().toISOString(), estado: 'PENDIENTE', intentos: 0, proximoIntento: 0, ultimoError: '', rev: 0, usuario: Sesion.datos.usuario }, item);
      this.items.push(nuevo);
      await Almacen.colaPoner(nuevo);
    }
    this.alCambiar();
  },

  async quitar(id) {
    this.items = this.items.filter((i) => i.id !== id);
    await Almacen.colaQuitar(id);
    this.alCambiar();
  },

  async _enviar(it) {
    if (it.tipo === 'GASTO') {
      const r = await API.campo('gastoGuardar', it.datos);
      this.aplicar.gasto(r.gasto);
      return r;
    }
    if (it.tipo === 'PRESUPUESTO') {
      // Ítem de presupuesto: lo guarda NODIA (es la dueña del presupuesto). Idempotente por idLinea.
      const r = await API.nodia('campoPresupuestoAgregar', it.datos);
      if (!r.exito) throw new ErrorApi(r.mensaje || 'NODIA no aceptó este ítem.', 409);
      this.aplicar.presupuesto(it.idProyecto, r);
      return r;
    }
    // EVENTO: primero NODIA (es quien cambia el estado del proyecto); después la bitácora propia de Campo.
    if (it.etapa !== 'CAMPO') {
      const r = await API.nodia('campoMarcar', { idProyecto: it.idProyecto, evento: it.datos.evento, idEvento: it.id, fechaHora: it.datos.fechaHora });
      if (!r.exito) throw new ErrorApi(r.mensaje || 'NODIA no aceptó este registro.', 409);
      this.aplicar.estadoProyecto(it.idProyecto, r);
      it.etapa = 'CAMPO';
      await Almacen.colaPoner(it);
    }
    try {
      await API.campo('eventoRegistrar', { idEvento: it.id, idProyecto: it.idProyecto, evento: it.datos.evento, fechaHora: it.datos.fechaHora, enviadoANodia: true });
    } catch (e) {
      if (e.esRed || e.codigo === 401) throw e; // se reintenta luego
      console.warn('La bitácora de Campo no aceptó el evento:', e.message); // NODIA ya lo tiene: no se molesta al usuario
    }
  },

  /** Envía en orden. Si no hay señal, se detiene (para no desordenar) y vuelve a intentar más tarde. */
  async procesar(opciones) {
    const forzar = opciones && opciones.forzar;
    if (this.ocupada || !Sesion.datos || Sesion.datos.debeCambiarClave) return;
    this.ocupada = true;
    let huboEnvio = false, huboCambio = false;
    try {
      for (const it of this.mios()) {
        if (!Sesion.datos) break;
        if (it.estado === 'RECHAZADO') continue;
        if (!forzar && it.proximoIntento && it.proximoIntento > Date.now()) break;
        huboCambio = true;
        const revAlEnviar = it.rev || 0;
        it.estado = 'ENVIANDO';
        this.alCambiar();
        try {
          const r = await this._enviar(it);
          if ((it.rev || 0) !== revAlEnviar && it.tipo === 'GASTO') {
            // Lo corrigieron mientras se enviaba: queda pendiente la corrección, sobre la versión que ya aceptó el servidor.
            it.datos.version = ((r && r.gasto && r.gasto.version) || 1) + 1;
            it.estado = 'PENDIENTE';
            await Almacen.colaPoner(it);
          } else {
            await this.quitar(it.id);
          }
          huboEnvio = true;
        } catch (e) {
          const errorRepetido = e.interno && (it.intentos || 0) >= 5; // el servidor falla siempre con este: no bloquear a los demás
          if ((e.esRed && !errorRepetido) || e.codigo === 401) {
            it.estado = 'PENDIENTE';
            if (e.esRed) {
              it.intentos = (it.intentos || 0) + 1;
              it.proximoIntento = Date.now() + this.ESPERAS_SEG[Math.min(it.intentos - 1, this.ESPERAS_SEG.length - 1)] * 1000;
              it.ultimoError = e.message;
              if (it.intentos === 1) this.alQuedarEnEspera(it);
            }
            await Almacen.colaPoner(it);
            break;
          }
          it.estado = 'RECHAZADO';
          it.ultimoError = e.message;
          await Almacen.colaPoner(it);
        }
      }
    } finally {
      this.ocupada = false;
      if (huboCambio) this.alCambiar(); // sin novedades no se redibuja (evita parpadeos mientras no hay señal)
      this.programar();
      if (huboEnvio) this.alEnviar();
    }
  },

  programar() {
    clearTimeout(this._reloj);
    // Se envía en orden: lo que manda es cuándo le toca al PRIMERO de la fila.
    const primero = this.porEnviar()[0];
    if (!primero || !Sesion.datos) return;
    const espera = Math.max(1000, (primero.proximoIntento || 0) - Date.now());
    this._reloj = setTimeout(() => this.procesar(), Math.min(espera, 300000));
  }
};
