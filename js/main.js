// NODIA — JS puro, sin dependencias ni backend.

(function () {
  'use strict';

  var WHATSAPP_NUMERO = '573011482343'; // número operativo confirmado para NODIA

  function iniciarNavMovil() {
    var toggle = document.querySelector('[data-nav-toggle]');
    var nav = document.querySelector('[data-nav-principal]');
    if (!toggle || !nav) return;

    toggle.addEventListener('click', function () {
      var abierto = nav.classList.toggle('abierto');
      toggle.classList.toggle('abierto', abierto);
      toggle.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    });

    nav.querySelectorAll('a').forEach(function (enlace) {
      enlace.addEventListener('click', function () {
        nav.classList.remove('abierto');
        toggle.classList.remove('abierto');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  function marcarAnioFooter() {
    var el = document.querySelector('[data-anio]');
    if (el) el.textContent = new Date().getFullYear();
  }

  var MENSAJES_DIVISION = {
    solar: function (campos) {
      var l = ['Hola, soy ' + campos.nombre + '. Necesito información sobre Energía Solar.'];
      if (campos.ubicacion) l.push('Ubicación del proyecto: ' + campos.ubicacion);
      if (campos.inmueble) l.push('Tipo de inmueble: ' + campos.inmueble);
      if (campos.necesidad) l.push('Necesidad energética: ' + campos.necesidad);
      return l.join('\n');
    },
    mantenimiento: function (campos) {
      var l = ['Hola, soy ' + campos.nombre + '. Necesito mantenimiento eléctrico.'];
      if (campos.equipo) l.push('Equipo o instalación: ' + campos.equipo);
      if (campos.servicio) l.push('Servicio requerido: ' + campos.servicio);
      return l.join('\n');
    }
  };

  function iniciarCotizador() {
    var formulario = document.querySelector('[data-form-cotizador]');
    if (!formulario) return;

    var mensajeError = formulario.querySelector('[data-form-mensaje]');
    var botonesDivision = formulario.querySelectorAll('[data-division-btn]');
    var gruposCampos = formulario.querySelectorAll('[data-campos]');
    var nombre = formulario.querySelector('#cot-nombre');
    var divisionActiva = null;

    function limpiarError() {
      if (!mensajeError) return;
      mensajeError.textContent = '';
      mensajeError.classList.remove('visible', 'error');
    }

    function elegirDivision(division) {
      if (!MENSAJES_DIVISION[division]) return;
      divisionActiva = division;
      limpiarError();

      botonesDivision.forEach(function (btn) {
        var activo = btn.getAttribute('data-division') === division;
        btn.setAttribute('aria-pressed', activo ? 'true' : 'false');
      });

      var primerCampo = null;
      gruposCampos.forEach(function (grupo) {
        var esEsta = grupo.getAttribute('data-campos') === division;
        grupo.hidden = !esEsta;
        grupo.querySelectorAll('select, input, textarea').forEach(function (campo) {
          campo.disabled = !esEsta;
          if (esEsta && !primerCampo) primerCampo = campo;
        });
      });
      if (primerCampo) primerCampo.focus();
    }

    botonesDivision.forEach(function (btn) {
      btn.addEventListener('click', function () {
        elegirDivision(btn.getAttribute('data-division'));
      });
    });

    formulario.addEventListener('submit', function (evento) {
      evento.preventDefault();

      if (!divisionActiva) {
        if (mensajeError) {
          mensajeError.textContent = 'Selecciona primero qué necesitas: Energía Solar o Mantenimiento.';
          mensajeError.classList.add('visible', 'error');
        }
        if (botonesDivision[0]) botonesDivision[0].focus();
        return;
      }
      if (!nombre || !nombre.value.trim()) {
        if (mensajeError) {
          mensajeError.textContent = 'Por favor escribe tu nombre.';
          mensajeError.classList.add('visible', 'error');
        }
        if (nombre) nombre.focus();
        return;
      }

      var campos = { nombre: nombre.value.trim() };
      formulario.querySelectorAll('[data-campos="' + divisionActiva + '"] select, [data-campos="' + divisionActiva + '"] input').forEach(function (campo) {
        if (campo.value && campo.value.trim) campos[campo.name] = campo.value.trim();
      });

      limpiarError();
      var texto = encodeURIComponent(MENSAJES_DIVISION[divisionActiva](campos));
      var url = 'https://wa.me/' + WHATSAPP_NUMERO + '?text=' + texto;
      window.open(url, '_blank', 'noopener');
    });

    var parametroDefecto = formulario.getAttribute('data-division-defecto-param');
    var divisionDesdeUrl = parametroDefecto
      ? new URLSearchParams(window.location.search).get(parametroDefecto)
      : null;
    if (divisionDesdeUrl && MENSAJES_DIVISION[divisionDesdeUrl]) elegirDivision(divisionDesdeUrl);
  }

  function iniciarRevelado() {
    var selectorBloques = [
      '.encabezado-seccion',
      '.subhero > .contenedor > *',
      '.bento-servicios > *',
      '.divisiones-grid > *',
      '.bloques-especialidad > *',
      '.indice-division',
      '.galeria-grid > *',
      '.trabajos-destacados > *',
      '.mosaico-proyecto > *',
      '.grid-proceso > *',
      '.cotizador-intro',
      '.cotizador form',
      '.cta-final',
      '.ficha-servicio',
      '.valores-grid > *',
      '.grid-confianza > *',
      '.info-contacto .info-item',
      '.contacto-grid > form'
    ].join(',');

    var elementos = document.querySelectorAll(selectorBloques);
    if (!elementos.length) return;
    if (!('IntersectionObserver' in window)) return;

    elementos.forEach(function (el) {
      el.classList.add('reveal');
      var indice = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
      el.style.transitionDelay = (Math.min(indice, 5) * 0.07) + 's';
    });

    var observador = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada) {
        if (entrada.isIntersecting) {
          entrada.target.classList.add('is-visible');
          observador.unobserve(entrada.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -120px 0px' });

    elementos.forEach(function (el) { observador.observe(el); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    iniciarNavMovil();
    marcarAnioFooter();
    iniciarCotizador();
    iniciarRevelado();
  });
})();
