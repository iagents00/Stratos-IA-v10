# Mariana Ángeles López — Portafolio

Sitio editorial premium para **Mariana Ángeles López** — modelo, coach de
Pilates Reformer + entrenamiento de fuerza, y Licenciada en Nutrición.

Diseñado con la estética de portfolios de modelos top + estudios de Pilates
boutique. Sin frameworks, sin build step: **HTML + CSS + JS puro**, listo para
desplegar en cualquier lado.

---

## 🎨 Identidad visual

- **Paleta**: crema cálido, rosa empolvado, mauve, tinta carbón.
- **Tipografía**: *Cormorant Garamond* (display editorial) + *Inter* (UI).
- **Tono**: editorial, sereno, premium, con energía.

## 🧱 Estructura del sitio

1. **Hero** — Nombre a pantalla completa + marquee con disciplinas.
2. **Sobre ella** — Historia narrativa que une modelaje + coaching + nutrición.
3. **Portafolio** — Grid editorial asimétrico (6 fotos, fácil de extender).
4. **Servicios** — Pilates Reformer, Fuerza, Nutrición y Modelaje.
5. **Marcas** — Strip horizontal con marcas con las que ha trabajado.
6. **Trayectoria** — Educación, certificaciones, skills, idiomas.
7. **Quote** — Frase ancla.
8. **Contacto** — Email, teléfono, ubicación, formulario.

## 📁 Estructura de archivos

```
.
├── index.html         # Markup completo del sitio
├── styles.css         # Diseño + animaciones
├── script.js          # Loader, nav, scroll reveal, fallback de imágenes, form
├── assets/
│   └── favicon.svg
└── images/            # ← Aquí van las fotos (ver images/README.md)
```

## ▶️ Cómo ver el sitio localmente

Cualquiera de estas funciona:

```bash
# Opción 1: servidor estático con Python
python3 -m http.server 8080
# Abre http://localhost:8080

# Opción 2: con Node (npx)
npx serve .

# Opción 3: simplemente abre index.html en tu navegador
```

## 🚀 Cómo publicarlo en Vercel como `marianaanlo`

> URL final esperada: **https://marianaanlo.vercel.app**

El `vercel.json` ya define `"name": "marianaanlo"` y los headers de cache y
seguridad. Tres caminos:

### A. Drag & drop (más fácil — sin instalar nada)
1. Comprime esta carpeta a `marianaanlo.zip`.
2. Entra a **https://vercel.com/new** → Login.
3. Arrastra el zip → **Project Name**: `marianaanlo` → **Deploy**.
4. Listo: `https://marianaanlo.vercel.app`.

### B. Vercel CLI desde tu compu
```bash
cd mariana-portfolio
npx vercel@latest login            # primer paso, solo la primera vez
npx vercel@latest --name marianaanlo
npx vercel@latest --prod --name marianaanlo
```

### C. GitHub → Vercel (auto-deploy en cada push) ⭐ recomendado

**Repo destino:** `iagents00/marianaanlo` (público)

```bash
# 1) Crea el repo VACÍO en GitHub (sin README, sin .gitignore, sin license):
#    https://github.com/organizations/iagents00/repositories/new
#    → Name: marianaanlo
#    → Public
#    → NO inicialices con README ni nada
#
# 2) Empuja desde tu compu:
cd mariana-portfolio
git remote add origin https://github.com/iagents00/marianaanlo.git
git branch -M main
git push -u origin main

# 3) Conecta a Vercel:
#    https://vercel.com/new → Import Git Repository → iagents00/marianaanlo
#    → Project Name: marianaanlo (ya viene del vercel.json) → Deploy
#
# 4) ✅ Vivo en: https://marianaanlo.vercel.app
#    Cada git push posterior redepliega automáticamente.
```

> O usa el script de un solo paso: `bash setup-remote.sh`

### Netlify (alternativa)
1. Arrastra la carpeta a [app.netlify.com/drop](https://app.netlify.com/drop).

### GitHub Pages (alternativa)
1. Sube a GitHub. Settings → Pages → Source: `main` branch, `/ (root)`.

## 📸 Para agregar las fotos

Ver `images/README.md` con los nombres exactos y proporciones recomendadas.

Mientras llegan las fotos reales, el sitio muestra placeholders en gradiente
elegante con el nombre de cada sección — perfecto para preview con el cliente.

## ✏️ Para editar contenido

- **Bio / Historia** → `index.html`, sección `<!-- ABOUT -->`
- **Servicios** → `index.html`, sección `<!-- SERVICES -->`
- **Marcas** → `index.html`, sección `<!-- BRANDS -->`
- **Redes sociales** → `index.html`, dentro de `.socials` (ahora apuntan a `#`)
- **Colores** → `styles.css`, variables `:root` al inicio

## ♿ Accesibilidad y performance

- Imágenes con `loading="lazy"`.
- Respeta `prefers-reduced-motion`.
- Sin dependencias externas pesadas (sólo Google Fonts).
- HTML semántico (`header`, `nav`, `section`, `article`, `figure`, `footer`).
- Meta tags Open Graph y descripción para compartir en redes.
- Formulario con validación cliente y fallback `mailto:`.

## 🛠️ Siguientes mejoras posibles

- [ ] Integrar formulario con Formspree / Netlify Forms / EmailJS.
- [ ] Galería con lightbox al hacer click.
- [ ] Sección de testimonios reales con foto.
- [ ] Página `/clases` con calendario y reserva.
- [ ] Versión en inglés (toggle ES/EN).

## 📝 Licencia

Sitio de uso exclusivo para Mariana Ángeles López. Todos los derechos
reservados.
