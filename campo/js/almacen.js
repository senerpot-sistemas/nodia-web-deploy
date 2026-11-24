// Almacenamiento del teléfono (IndexedDB): copia de lo último visto y cola de lo que falta enviar.
// El token NO se guarda aquí (vive aparte, en Sesion) y nunca entra a la cola.
const Almacen = (() => {
  let promesa = null;
  function abrir() {
    if (!promesa) {
      promesa = new Promise((resolver, rechazar) => {
        const r = indexedDB.open('nodia_campo', 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore('kv');
          r.result.createObjectStore('cola', { keyPath: 'id' });
        };
        r.onsuccess = () => resolver(r.result);
        r.onerror = () => rechazar(r.error);
      });
    }
    return promesa;
  }
  async function tx(almacen, modo, fn) {
    const db = await abrir();
    return new Promise((resolver, rechazar) => {
      const t = db.transaction(almacen, modo);
      const pedido = fn(t.objectStore(almacen));
      t.oncomplete = () => resolver(pedido ? pedido.result : undefined);
      t.onerror = () => rechazar(t.error);
      t.onabort = () => rechazar(t.error);
    });
  }
  return {
    leer: (k) => tx('kv', 'readonly', (s) => s.get(k)),
    guardar: (k, v) => tx('kv', 'readwrite', (s) => s.put(v, k)),
    quitar: (k) => tx('kv', 'readwrite', (s) => s.delete(k)),
    colaTodos: () => tx('cola', 'readonly', (s) => s.getAll()),
    colaPoner: (item) => tx('cola', 'readwrite', (s) => s.put(item)),
    colaQuitar: (id) => tx('cola', 'readwrite', (s) => s.delete(id))
  };
})();
