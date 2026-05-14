# Imágenes del sitio

Pon aquí las 4 fotos con estos **nombres exactos**. Mientras no estén, el sitio
renderiza placeholders en gradiente con la paleta real de cada foto — no rompe
nada.

## Las 4 fotos que mandaste y dónde van

| Archivo            | Foto que va aquí                                              | Sección del sitio        |
|--------------------|---------------------------------------------------------------|--------------------------|
| `hero.jpg`         | **Pasarela** — vestido magenta con alas, Centro de Querétaro  | Hero (full-screen)       |
| `about.jpg`        | **Linen verde oliva** — retrato editorial recostada           | "Sobre ella" (retrato)   |
| `portfolio-1.jpg`  | **Pasarela** — la misma del hero (versión vertical recortada) | Gallery 01 · Runway      |
| `portfolio-2.jpg`  | **Linen verde oliva** — la misma del about                    | Gallery 02 · Editorial   |
| `portfolio-3.jpg`  | **Cuero oxblood** — vestido rojo de piel, perfil              | Gallery 03 · Leather     |
| `portfolio-4.jpg`  | **Beauty** — muro de cantera + makeup artístico en cejas      | Gallery 04 · Beauty      |

> Sí, **`hero.jpg` y `portfolio-1.jpg` pueden ser la misma foto** (la de la
> pasarela). El hero la usa a full-bleed con overlay; la gallery la usa con
> caption. Igualmente `about.jpg` y `portfolio-2.jpg` pueden ser la foto del
> linen verde. Si prefieres no repetir, puedes elegir crops distintos.

## Recomendaciones técnicas

- Formato **JPG** comprimido a 80–85% (o **WebP** si prefieres).
- Peso ideal por imagen: **200–500 KB**. Usa [squoosh.app](https://squoosh.app)
  o [tinypng.com](https://tinypng.com).
- Resolución mínima **1200 px** en el lado corto, **2400 px** para el hero.
- Color: las fotos ya tienen una paleta increíble (magenta, oliva, oxblood,
  cantera) — el sitio fue diseñado alrededor de esos tonos.

## Cómo guardarlas (paso a paso, desde tu computadora)

1. Renombra cada foto exactamente como dice la tabla (`hero.jpg`,
   `portfolio-1.jpg`, etc.).
2. Arrástralas a esta carpeta `images/`.
3. Refresca el navegador. Listo.

## Si quieres agregar más fotos en el futuro

Edita `index.html` en la sección `<!-- ============ PORTFOLIO ============ -->`.
Cada `<figure class="g-item">` es una foto. Clases disponibles:

- `tall` → ocupa 2 filas (recomendado para fotos verticales muy fuertes)
- `wide` → ocupa 2 columnas (para horizontales)
- (sin clase) → tamaño normal

Para añadir una 5ª foto: copia un bloque `<figure>` existente, súbela como
`portfolio-5.jpg` y ajusta el `alt` y el `figcaption`.
