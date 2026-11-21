# DESIGN.md · Nuvex

Fuente de verdad para tokens, tipografía, componentes y movimiento del frontend. Antes de introducir un color, un tamaño, una tipografía o un patrón de animación nuevo, comprueba que no exista ya aquí. Los cambios en este documento se reflejan en `src/app/globals.css`.

## Principios

1. **Calmado en ambos temas.** Claro y oscuro comparten una paleta verde neutra, superficies de bajo contraste y sin sombras pesadas. La luz la pone el acento; el oscuro es la firma visual por defecto.
2. **Un solo acento.** El lima `--accent` es el único color de acción y énfasis. No inventes colores de estado nuevos: usa el acento, `--text`, `--muted` o `--danger`.
3. **Tipografía apretada.** Tracking negativo en títulos y marca, pesos altos, jerarquía por tamaño y peso, no por color.
4. **Movimiento con propósito.** Transiciones cortas y coordinadas. Nada rebota ni llama la atención. `prefers-reduced-motion` apaga todo.
5. **Técnico, no decorativo.** Los detalles (rejilla, órbita, wireframe del login) evocan precisión de sistema, no ornamento.

## Tema

Soporta modo claro y oscuro. Por defecto sigue la preferencia del sistema mediante `light-dark()`; el usuario puede fijar Claro, Oscuro o Sistema en Ajustes. La preferencia se guarda en `localStorage` (`nuvex-theme`) y se aplica como `data-theme` en `<html>` antes del primer pintado.

## Color

Definidos con `light-dark(claro, oscuro)` en `:root` (`globals.css`). Usa siempre la variable, nunca el valor hexadecimal.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--canvas` | `#f6f4ee` | `#101311` | Fondo principal |
| `--sidebar` | `#fdfcf8` | `#151a16` | Barra lateral, filas de listado |
| `--surface` | `#efece3` | `#1a211b` | Botones secundarios, hover, tarjetas |
| `--raised` | `#e6e2d7` | `#232d25` | Hover de superficie |
| `--line` | `#ddd8cb` | `#2e3a30` | Bordes y separadores |
| `--text` | `#21261c` | `#eef3eb` | Texto principal |
| `--muted` | `#666b5d` | `#a8b4a7` | Texto secundario, metadatos |
| `--accent` | `#3c7d24` | `#b7f582` | Acción primaria, foco, énfasis |
| `--accent-ink` | `#ffffff` | `#172611` | Texto sobre `--accent` |
| `--danger` | `#c0392b` | `#ff9b97` | Errores y acciones destructivas |

- Tokens derivados (también `light-dark()`): `--accent-hover`, `--placeholder`, `--danger-bg`, `--danger-border`, `--danger-text`, `--nav-active-bg`, `--file-icon-color`, `--file-icon-bg`, `--folder-icon-bg`, `--empty-icon-bg`, `--login-icon-border`, `--login-icon-bg`.
- El panel de arte del login (`.login-art`) adapta su paleta al tema: verde claro de día y verde profundo de noche. Su wireframe 3D cambia de color según el tema. El menú de preferencias del login (`.prefs-menu`) usa `--surface` con sombra suave.

## Tipografía

- Familia: `"Aptos", "Segoe UI", system-ui, sans-serif`. No añadas fuentes web.
- Base: `15px` / `1.5`.

| Elemento | Tamaño | Peso | Interlineado | Tracking |
|---|---|---|---|---|
| `h1` | `clamp(2rem, 4vw, 3rem)` | 690 | 1.09 | `-.055em` |
| `h2` | `1.15rem` | 660 | 1.3 | `-.02em` |
| Marca (`.brand`) | `27px` | 760 | 1 | `-.075em` |
| Título del arte (`.art-title`) | `clamp(2.3rem, 5.2vw, 5.7rem)` | 670 | 0.96 | `-.075em` |
| Metadatos (`.art-meta`) | `11px` | 400 | 1.4 | `.1em`, monoespaciada |
| Metadatos de listado (`time`) | `12px` | 400 | — | — |
| Códigos de recuperación | `12px` | 400 | 1.6 | monoespaciada |

- El cuerpo usa `--text`; `p`, `small` y `time` usan `--muted`.
- El nombre de archivo en el listado se trunca con `text-overflow: ellipsis`, nunca con recorte duro.

## Espaciado y radio

- Radio de botones e inputs: `9px`. De tarjetas (`panel`): `13px`. De diálogo: `15px`. De miniaturas/iconos de archivo: `7px`. De iconos de estado vacío: `14px`.
- Altura mínima de botones: `40px` (móvil `42px`). De inputs: `42px`.
- Separación base entre elementos de acción: `8px` (`.actions`, `gap: 8px`).
- Padding de botones: `8px 13px`. De inputs: `8px 12px`. De paneles: `clamp(14px, 3vw, 25px)`.

## Componentes

- **Botones** (`.primary`, `.secondary`, `.danger`, `.icon-button`, `.text-button`): `inline-flex`, `gap: 8px`, radio `9px`, peso `620`, transición `150ms` de fondo/color/borde.
  - `.primary`: fondo `--accent`, texto `--accent-ink`.
  - `.secondary` / `.icon-button`: fondo `--surface`, borde `--line`, texto `--text`.
  - `.icon-button`: `min-width: 38px`, `padding: 8px`.
  - `.text-button`: sin fondo, texto `--muted`, hover a `--accent`.
- **Inputs** (texto, textarea, select): borde `--line`, radio `9px`, fondo `--canvas`, `min-height: 42px`.
- **Panel** (`.panel`): borde `--line`, fondo `--sidebar`, radio `13px`, padding fluido. El título `h2` lleva icono `lucide` en `--accent`.
- **Diálogo** (`<dialog>`): fondo `--sidebar`, borde `--line`, radio `15px`, `max-height: 89svh`; `::backdrop` `#080d08b9`. Botón de cierre arriba a la derecha.
- **Listado** (`.entries`): filas con fondo `--sidebar`, borde `--line`; en vista lista las filas comparten un contenedor con radio `12px` y separador `--line`. En cuadrícula, `grid-template-columns: repeat(auto-fill, minmax(154px, 1fr))`.
- **Estado vacío** (`.empty`): borde discontinuo `--line`, radio `12px`, icono en caja `#283924` con `--accent`.
- **Progreso** (`<progress>`): altura `4px`, barra `--line`, valor `--accent`.
- **Visor (lightbox)** (`.lightbox`): overlay oscuro fijo con navegación ←/→, `Esc`, swipe, zoom y descarga. Es deliberadamente oscuro en ambos temas, como el panel de arte; el estado de procesado se muestra sobre el medio.

## Movimiento

- Transiciones CSS de microinteracción: `150ms` (fondo, color, borde de botones).
- Animaciones coordinadas con Anime.js: el listado entra con `opacity: [0.6, 1]` y `translateY: [5, 0]` en `230ms`, easing `outQuad`.
- La escena del login usa Three.js (icosaedro en wireframe, color `#adf377`) cargado de forma diferida y liberado al salir.
- `prefers-reduced-motion: reduce` desactiva toda animación y transición; la escena Three.js no se monta en ese caso.

## Layout y responsive

- **Login**: cuadrícula de dos columnas (formulario + arte). Por debajo de `850px` pasa a una columna y el panel de arte se oculta.
- **Drive**: barra lateral de `236px` + área de trabajo. Por debajo de `850px` la barra colapsa a `67px` solo-iconos.
- Breakpoints: `850px` y `530px`. En móvil (`530px`) la barra superior apila, la búsqueda ocupa el ancho y las tarjetas de candidatos pasan a una columna.
- Usa `clamp()` para tamaños fluidos; no añadas breakpoints nuevos si un `clamp()` resuelve el caso.
- **Gutters y densidad**: `.workspace-body` comparte el mismo padding horizontal que la barra superior, así el título y el breadcrumb quedan alineados. **Ajustes** usa `.settings-masonry` (dos columnas balanceadas, máx. ~1080 px) para aprovechar el ancho; Enlaces, Importaciones y Transferencias usan `.panel-column` (máx. ~880 px). Evita paneles a todo el ancho y formularios demasiado anchos (`.security-form` y `#sec-secret`, máx. 460 px). Los botones sueltos dentro de un panel se ajustan a su contenido (`justify-self: start`).

## Accesibilidad

- Foco visible: `outline: 2px solid var(--accent)` en `:focus-visible`.
- Todo control interactivo tiene nombre accesible (`aria-label`) y estado (`aria-pressed`, `aria-current`, `role`).
- El diálogo usa `aria-labelledby` y no se cierra mientras una operación está en curso.
- Respeta `prefers-reduced-motion` y conserva la operación completa por teclado.
- Los errores se muestran junto a la acción que falló con `role="alert"`.

## Iconografía

- Iconos de `lucide-react`, `strokeWidth` entre `1.65` y `1.7`. El acento (`.brand`, títulos de panel, iconos de estado) usa `--accent`.

## Reglas rápidas

- ¿Nuevo color? No: reutiliza un token existente o, si de verdad falta, añádelo aquí primero y luego en `globals.css`.
- ¿Nuevo componente? Comprueba `frontend/src/components` antes de crearlo; debe ser genérico y aceptar distintos datos.
- ¿Nueva animación? Debe tener propósito, respetar `prefers-reduced-motion` y usar los tiempos ya definidos.
