# enermast-agente-prospeccion

Agente de IA (para Claude Code / Claude, y compatible con Codex y Gemini vía `AGENTS.md` y `GEMINI.md`) que automatiza la **prospección de clientes B2B en Colombia para Enermast**, una empresa de Barranquilla dedicada al mantenimiento, diagnóstico, rehabilitación y suministro de equipos industriales (calderas, chillers, torres de enfriamiento, intercambiadores de calor, válvulas, herramientas hidráulicas, sistemas de izaje, etc.).

El agente descubre empresas colombianas con instalaciones industriales, extrae su información **100% por web scraping** (sin usar APIs de pago tipo Apollo), la puntúa según el ICP (perfil de cliente ideal) de Enermast y entrega un Excel accionable listo para que el equipo comercial haga outreach.

## Qué hace

1. **Pregunta antes de actuar.** Nunca prospecta a ciegas: siempre pide al usuario el sector, la(s) ciudad(es) de Colombia y la línea de negocio de Enermast a enfocar antes de arrancar.
2. **Descubre empresas reales por búsqueda web** (nunca inventa nombres con "conocimiento" del modelo) y arma una lista semilla de candidatos colombianos del sector indicado.
3. **Extrae evidencia de cada sitio web** (equipos mencionados, ciudad, contacto, cargos, idioma) usando un navegador real (Playwright/Chromium) con Firecrawl como respaldo para sitios difíciles (SPA, JS-only).
4. **Puntúa cada prospecto** con una fórmula transparente basada en el ICP de Enermast (sector, evidencia de equipos térmicos/vapor, proximidad a la región Caribe, contacto directo publicado, etc.).
5. **Genera un Excel final** (máximo 50 empresas, las de mayor score) con hojas de Prospectos, Contactos objetivo, Explicación de columnas/score, Diagnóstico y Descartados — totalmente auditable, sin datos inventados y con todo el texto en español.

## Cómo funciona (arquitectura de 3 capas)

Este proyecto sigue una arquitectura de 3 capas que separa la intención (qué hacer) de la ejecución (cómo hacerlo), pensada para que un agente de IA orqueste con confiabilidad:

| Capa | Qué es | Dónde vive |
|---|---|---|
| **1. Directiva** | SOPs en Markdown: qué hacer, reglas fijas del usuario, formato de salida | [directives/](directives/) — especialmente [prospectar_clientes.md](directives/prospectar_clientes.md) (el flujo) y [contexto_enermast.md](directives/contexto_enermast.md) (el ICP y las líneas de negocio) |
| **2. Orquestación** | El agente de IA (Claude Code, Codex, Gemini) lee las directivas, decide qué script correr, maneja errores y actualiza el aprendizaje | Definida en [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md) / [GEMINI.md](GEMINI.md) (los tres archivos deben mantenerse idénticos) |
| **3. Ejecución** | Scripts Node.js deterministas que hacen el trabajo pesado (scraping, scoring, generación del Excel) | [execution/](execution/) |

El flujo real de ejecución tiene 3 pasos:

1. **Descubrimiento** — `execution/descubrir_empresas.mjs` busca empresas reales por sector × ciudad y guarda las semillas en `execution/semillas_prospectos.json`.
2. **Extracción** — `execution/scrapear_sitios.mjs` visita cada sitio con Playwright (con Firecrawl de respaldo) y guarda la evidencia en `.tmp/evidencia_web.json`.
3. **Scoring y entregable** — `execution/generar_excel.mjs` calcula el score, aplica traducciones y genera el Excel final en `entregables/`.

Los archivos intermedios (`.tmp/`) nunca se suben al repositorio y siempre son reproducibles corriendo el flujo de nuevo.

## Requisitos

- **Node.js 20 o superior** (probado con Node v24) y npm.
- **Git.**
- **Windows, macOS o Linux** (el proyecto se desarrolló y probó en Windows con PowerShell/Git Bash).
- **Claude Code** instalado ([claude.com/claude-code](https://claude.com/claude-code)) — u opcionalmente Codex CLI / Gemini CLI, ya que el agente está documentado en los tres formatos.
- **Playwright con Chromium** (se instala en un paso aparte, ver abajo).
- Opcional pero recomendado: una cuenta de **Firecrawl** (para el fallback de scraping en sitios JS-only) y de **Composio** (para diagnósticos de conexiones). Ninguna de las dos es obligatoria para que el flujo funcione — sin ellas, el scraping usa solo `fetch` simple.

## Guía paso a paso para descargar y ejecutar en Claude Code

### 1. Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd enermast-agente-prospeccion
```

### 2. Instalar dependencias de Node

```bash
npm install
```

### 3. Instalar el navegador de Playwright (Chromium)

Playwright es el motor principal de scraping y necesita descargar el binario de Chromium la primera vez (no viene incluido con el paquete npm):

```bash
npx playwright install chromium
```

### 4. Configurar las variables de entorno

Crea un archivo `.env` en la raíz del proyecto (no se sube al repo, está en `.gitignore`) con las siguientes claves. Todas son opcionales excepto que, si no las configuras, algunas funciones de respaldo quedan desactivadas:

```bash
# Opcional — fallback de scraping para sitios SPA/JS-only (SharePoint, Angular, React sin SSR)
FIRECRAWL_API_KEY=

# Opcional — solo para el script de diagnóstico execution/list_composio_connections.mjs
COMPOSIO_API_KEY=
COMPOSIO_TEST_USER_ID=

# Deprecado — no se usa en el flujo activo (ver "Nunca usar Apollo" abajo)
APOLLO_USER_ID=
```

### 5. Abrir el proyecto en Claude Code

```bash
claude
```

Claude Code carga automáticamente [CLAUDE.md](CLAUDE.md), que contiene todas las instrucciones operativas del agente (reglas fijas, aprendizajes acumulados y la arquitectura de 3 capas).

### 6. Pedirle al agente que prospecte

Simplemente escribe algo como:

> "Quiero prospectar clientes para Enermast"

El agente **siempre preguntará primero** (nunca asume):
- ¿Qué sector quieres prospectar? (energético, oil & gas, manufactura, institucional, etc.)
- ¿En qué ciudad(es) de Colombia?
- ¿Qué línea de negocio de Enermast enfocar? (Energía y eficiencia / Herramientas / Componentes)
- Cualquier otra aclaración (tamaño de empresa, urgencia, alcance).

Con esas respuestas, el agente ejecuta el flujo de 3 pasos (descubrimiento → extracción → scoring/Excel) y entrega el archivo final en `entregables/prospectos_enermast_<sector>_<fecha>.xlsx`.

### 7. Revisar el resultado

Abre el Excel generado en `entregables/`. Incluye:
- **Prospectos** — las empresas puntuadas, con evidencia y contacto.
- **Contactos objetivo** — personas/cargos a buscar (nunca enlaces de búsqueda genéricos).
- **Explicación de columnas** — qué significa cada columna y la fórmula exacta del score.
- **Diagnóstico** — cobertura de la corrida y limitaciones conocidas.
- **Descartados** — qué se filtró y por qué (para poder auditar o rescatar un caso a mano).

## Reglas fijas del proceso (no negociables)

- **100% web scraping. Nunca usar la API de Apollo** ni ninguna otra API de pago para prospectar (`execution/enriquecer_prospectos.mjs` está deprecado).
- **Solo empresas de Colombia.**
- **Máximo 50 empresas** en el Excel final, las de mayor score.
- **Teléfono y Email nunca en blanco** salvo que de verdad no existan (y en ese caso se dice explícitamente en la celda).
- **Todo texto en inglés se traduce al español.**
- El detalle completo de estas reglas, el flujo, el scoring y todos los aprendizajes acumulados de sesiones anteriores viven en [CLAUDE.md](CLAUDE.md) (idéntico a [AGENTS.md](AGENTS.md) y [GEMINI.md](GEMINI.md)) y en [directives/prospectar_clientes.md](directives/prospectar_clientes.md).

## Estructura del proyecto

```
.
├── CLAUDE.md / AGENTS.md / GEMINI.md   # Instrucciones del agente (deben mantenerse idénticos)
├── directives/                          # Capa 1: SOPs en Markdown
│   ├── prospectar_clientes.md           # El flujo operativo completo
│   └── contexto_enermast.md             # ICP, líneas de negocio y scoring de Enermast
├── execution/                           # Capa 3: scripts deterministas (Node.js/.mjs)
│   ├── descubrir_empresas.mjs           # Paso 1 — descubrimiento por búsqueda real
│   ├── scrapear_sitios.mjs              # Paso 2 — extracción con Playwright + Firecrawl
│   ├── generar_excel.mjs                # Paso 3 — scoring y entregable
│   ├── lib/extraccion.mjs               # Funciones de extracción compartidas
│   ├── buscar_linkedin.mjs              # Confirmación best-effort de perfiles de LinkedIn
│   └── list_composio_connections.mjs    # Utilidad de diagnóstico de Composio
├── .tmp/                                # Intermedios regenerables (no se sube al repo)
├── entregables/                         # Excels finales generados
└── .env                                 # Variables de entorno y API keys (no se sube al repo)
```

## Notas

- El agente actualiza sus propias directivas y el registro de aprendizajes de `CLAUDE.md`/`AGENTS.md`/`GEMINI.md` a medida que descubre restricciones de APIs, límites de tasa o mejores enfoques — son documentos vivos, no estáticos.
- Antes de prospectar un sector/ciudad distinto al de la última corrida del mismo día, el agente archiva los intermedios del sector anterior en `.tmp/` para no mezclar corridas.
