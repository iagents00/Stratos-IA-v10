/* ============================================================
   Mariana Ángeles López — Portfolio
   Interactions: loader, nav, scroll reveal, marquee, form
   ============================================================ */

(() => {
  'use strict';

  // ---------- LOADER ----------
  window.addEventListener('load', () => {
    const loader = document.getElementById('loader');
    if (!loader) return;
    setTimeout(() => loader.classList.add('is-hidden'), 1200);
  });

  // ---------- NAV ----------
  const nav = document.getElementById('nav');
  const burger = document.getElementById('burger');

  const onScroll = () => {
    if (window.scrollY > 60) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (burger) {
    burger.addEventListener('click', () => nav.classList.toggle('open'));
    document.querySelectorAll('.nav-links a').forEach(a => {
      a.addEventListener('click', () => nav.classList.remove('open'));
    });
  }

  // ---------- SCROLL REVEAL ----------
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  // Auto-add reveal to common children inside sections (progressive enhancement)
  document.querySelectorAll('.section .section-title, .section .section-sub, .service-card, .g-item, .brand, .cv-col, .contact-list li')
    .forEach((el, i) => {
      el.classList.add('reveal');
      el.style.transitionDelay = `${(i % 6) * 60}ms`;
      io.observe(el);
    });

  // ---------- IMAGE FALLBACK (until photos arrive) ----------
  // If an image fails to load, replace with a beautiful gradient placeholder
  // bearing the section name. Lets the design hold up before real assets land.
  const placeholders = {
    'hero.jpg':        ['#2b2421', '#8a6b6b', 'M A R I A N A'],
    'about.jpg':       ['#d9bcc1', '#8a6b6b', 'Mariana'],
    'portfolio-1.jpg': ['#1c1a19', '#b78b94', 'Editorial'],
    'portfolio-2.jpg': ['#0f0f0f', '#3a3a3a', 'Adidas · Performance'],
    'portfolio-3.jpg': ['#c6a5b0', '#7a4f59', 'Lifestyle'],
    'portfolio-4.jpg': ['#ebe2d6', '#b78b94', 'Beauty'],
    'portfolio-5.jpg': ['#1c1a19', '#d9bcc1', 'Pilates'],
    'portfolio-6.jpg': ['#2b2421', '#c6a5b0', 'Strength'],
  };

  const renderPlaceholder = (el, [c1, c2, label]) => {
    const svg = `
      <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 1000' preserveAspectRatio='xMidYMid slice'>
        <defs>
          <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
            <stop offset='0' stop-color='${c1}'/>
            <stop offset='1' stop-color='${c2}'/>
          </linearGradient>
        </defs>
        <rect width='800' height='1000' fill='url(#g)'/>
        <text x='50%' y='50%' text-anchor='middle' dominant-baseline='middle'
              fill='rgba(247,241,233,0.85)' font-family='Cormorant Garamond, Georgia, serif'
              font-style='italic' font-size='56' letter-spacing='6'>${label}</text>
      </svg>`;
    const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    if (el.tagName === 'IMG') el.src = url;
    else el.style.backgroundImage = `url("${url}")`;
  };

  // Hero background div
  const heroImg = document.querySelector('.hero-img');
  if (heroImg) {
    const test = new Image();
    test.onerror = () => renderPlaceholder(heroImg, placeholders['hero.jpg']);
    test.src = 'images/hero.jpg';
  }

  // All <img> tags inside the page
  document.querySelectorAll('img').forEach(img => {
    img.addEventListener('error', () => {
      const file = (img.getAttribute('src') || '').split('/').pop();
      if (placeholders[file]) renderPlaceholder(img, placeholders[file]);
      else renderPlaceholder(img, ['#1c1a19', '#b78b94', 'Mariana']);
    });
  });

  // ---------- CONTACT FORM (mailto fallback) ----------
  const form = document.getElementById('contactForm');
  const note = document.getElementById('formNote');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const name = (data.get('name') || '').trim();
      const email = (data.get('email') || '').trim();
      const subject = (data.get('subject') || 'Contacto desde el sitio').trim();
      const message = (data.get('message') || '').trim();

      if (!name || !email || !message) {
        note.textContent = 'Por favor completa nombre, email y mensaje.';
        note.className = 'form-note err';
        return;
      }

      const body =
        `Hola Mariana,\n\nMi nombre es ${name}.\n\n${message}\n\n— ${name}\n${email}`;
      const href =
        `mailto:mariananlo02@gmail.com` +
        `?subject=${encodeURIComponent('[Sitio] ' + subject)}` +
        `&body=${encodeURIComponent(body)}`;

      window.location.href = href;
      note.textContent = 'Abriendo tu cliente de correo… ¡gracias!';
      note.className = 'form-note ok';
      form.reset();
    });
  }

  // ---------- YEAR ----------
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

})();
