# Imágenes del sitio

Pon aquí las fotos de Mariana con estos nombres exactos. Mientras no estén, el
sitio renderiza placeholders elegantes en gradiente — no rompe nada.

## Archivos esperados

| Archivo            | Uso                                  | Proporción sugerida | Tamaño mínimo |
|--------------------|--------------------------------------|---------------------|---------------|
| `hero.jpg`         | Imagen full-screen del Hero          | 16:9 / 3:4 vertical | 2400 × 1600   |
| `about.jpg`        | Retrato editorial en sección Sobre   | 4:5 vertical        | 1200 × 1500   |
| `portfolio-1.jpg`  | Editorial (tall)                     | 4:5 vertical        | 1200 × 1500   |
| `portfolio-2.jpg`  | Campaña Adidas / Fitness             | 1:1 ó 4:5           | 1200 × 1500   |
| `portfolio-3.jpg`  | Lifestyle                            | 1:1 ó 4:5           | 1200 × 1500   |
| `portfolio-4.jpg`  | Beauty (wide)                        | 16:9 horizontal     | 2000 × 1200   |
| `portfolio-5.jpg`  | Pilates en acción                    | 1:1 ó 4:5           | 1200 × 1500   |
| `portfolio-6.jpg`  | Strength / Training (tall)           | 4:5 vertical        | 1200 × 1500   |

## Recomendaciones técnicas

- Formato **JPG** comprimido a 80–85% de calidad (o **WebP** si prefieres).
- Peso ideal por imagen: **200–400 KB**. Usa [squoosh.app](https://squoosh.app)
  o [tinypng.com](https://tinypng.com).
- Color: edita las fotos con paleta cálida (beige, rosa empolvado, marrón) para
  que dialoguen con la identidad visual del sitio.
- Resolución mínima **1200 px** en el lado corto para que se vean nítidas en
  pantallas retina.

## Cómo cambiar el orden o agregar más fotos

Edita `index.html` en la sección `<!-- ============ PORTFOLIO ============ -->`.
Cada `<figure class="g-item">` es una foto. Las clases:

- `tall` → ocupa 2 filas
- `wide` → ocupa 2 columnas
- (sin clase) → tamaño normal

Si añades más fotos, súbelas como `portfolio-7.jpg`, `portfolio-8.jpg`, etc., y
añade el `<figure>` correspondiente.
