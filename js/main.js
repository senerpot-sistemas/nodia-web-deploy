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

  function iniciarCotizador() {
    var formulario = document.querySelector('[data-form-cotizador]');
    if (!formulario) return;

    var mensajeError = formulario.querySelector('[data-form-mensaje]');

    formulario.addEventListener('submit', function (evento) {
      evento.preventDefault();

      var servicio = formulario.querySelector('#cot-servicio');
      var nombre = formulario.querySelector('#cot-nombre');
      var empresa = formulario.querySelector('#cot-empresa');
      var ciudad = formulario.querySelector('#cot-ciudad');
      var detalle = formulario.querySelector('#cot-detalle');

      if (!nombre.value.trim() || !servicio.value) {
        if (mensajeError) {
          mensajeError.textContent = 'Por favor completa al menos tu nombre y el servicio de interés.';
          mensajeError.classList.add('visible', 'error');
        }
        return;
      }

      var lineas = [
        'Hola NODIA, quiero solicitar una cotización.',
        'Servicio: ' + servicio.value,
        'Nombre: ' + nombre.value.trim()
      ];
      if (empresa.value.trim()) lineas.push('Empresa: ' + empresa.value.trim());
      if (ciudad.value.trim()) lineas.push('Ciudad: ' + ciudad.value.trim());
      if (detalle.value.trim()) lineas.push('Detalle: ' + detalle.value.trim());

      var texto = encodeURIComponent(lineas.join('\n'));
      var url = 'https://wa.me/' + WHATSAPP_NUMERO + '?text=' + texto;

      window.open(url, '_blank', 'noopener');
    });
  }

  function iniciarRevelado() {
    var selectorBloques = [
      '.encabezado-seccion',
      '.subhero > .contenedor > *',
      '.bento-servicios > *',
      '.galeria-grid > *',
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

    var prefiereMenosMovimiento = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefiereMenosMovimiento || !('IntersectionObserver' in window)) return;

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
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    elementos.forEach(function (el) { observador.observe(el); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    iniciarNavMovil();
    marcarAnioFooter();
    iniciarCotizador();
    iniciarRevelado();
  });
})();
