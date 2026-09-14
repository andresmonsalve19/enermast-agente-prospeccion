# Directiva — Prospección de clientes para Enermast

> SOP operativo (Capa 1). El conocimiento de negocio (ICP, servicios, scoring, reglas) vive en [contexto_enermast.md](contexto_enermast.md); esta directiva define el FLUJO.

## Objetivo

Identificar empresas colombianas con instalaciones industriales cuyas operaciones se relacionen con las capacidades técnicas de Enermast, extraer su información directamente de la web, puntuarlas según el scoring del ICP y entregar un Excel accionable para el equipo comercial.

## Reglas fijas del proceso (preferencias explícitas del usuario, 2026-09-01)

1. **100% web scraping. Nunca usar la API de Apollo.** `execution/enriquecer_prospectos.mjs` queda DEPRECADO — no forma parte del flujo activo, se conserva solo como referencia histórica. (Excepción explícita aceptada por el usuario el 2026-09-01: Firecrawl, ver sección siguiente — es un servicio de scraping/renderizado, no una base de datos de leads como Apollo).
2. **Solo empresas de Colombia.** Nunca incluir empresas de otros países, aunque tengan operación regional o el HQ aparezca en el sitio. Si una semilla resulta ser una empresa extranjera sin planta/filial confirmada en Colombia, se descarta.
3. **Máximo 50 resultados** en el Excel final, siempre los de mayor score.
4. **Antes de ejecutar cualquier prospección nueva, preguntar siempre al usuario, en este orden**, usando preguntas de aclaración (no asumir):
   - ¿Qué **sector** desea prospectar? (usar como referencia las industrias de `contexto_enermast.md` §3, pero aceptar cualquier sector que el usuario indique)
   - ¿En qué **ciudad o ciudades** de Colombia? (si no tiene preferencia, priorizar Caribe — Barranquilla, Cartagena, Santa Marta — por cercanía operativa a Enermast, y aclararlo)
   - ¿Qué **tipo de industria/línea de negocio** de Enermast le interesa enfocar? (Energía y eficiencia / Herramientas / Componentes / todas)
   - Cualquier otra aclaración que mejore la búsqueda: tamaño de empresa, si ya tienen clientes en esa zona/sector, si buscan un cliente específico o un barrido amplio, urgencia, etc. Nunca asumir estas respuestas — preguntar.
5. Con las respuestas, construir o ampliar la lista semilla (`execution/semillas_prospectos.json`) con empresas colombianas reales del sector/ciudad indicados antes de correr el resto del flujo.

## Formato del Excel (obligatorio, fijado por el usuario)

**Hoja "Prospectos"** — columnas exactas, en este orden: Nivel de oportunidad, Score, Empresa, Sitio web, País, Ciudad, Sector / Industria, Descripción, Equipos relevantes identificados, Posible necesidad, Servicio Enermast recomendado, Línea de negocio, Cargos objetivo a buscar, LinkedIn empresa, Teléfono, Email, Justificación del score, Ángulo de contacto recomendado.

**Explícitamente PROHIBIDAS** (el usuario pidió quitarlas y no deben volver a añadirse sin que lo pida de nuevo): Ingresos, Evidencia encontrada, Fuente (URL evidencia), Vacantes técnicas abiertas, Origen del dato. (Se retiró además la columna duplicada "Nivel de oportunidad" que existía junto a "Nivel" — ahora hay una sola.)

**Traducción:** cualquier texto (título, descripción) que provenga de un sitio en inglés debe traducirse al español. La detección de idioma se hace sobre el texto puntual a mostrar (no sobre el idioma dominante del sitio completo, para no marcar como inglés una empresa cuya home sí está en español). Las traducciones confirmadas viven en `execution/traducciones.json` (dominio → `{titulo_es, descripcion_es}`); si un dominio nuevo aparece en inglés y no tiene traducción ahí, el Excel lo marca `[Pendiente de traducción]` en vez de mostrar el inglés sin avisar — hay que traducirlo manualmente y agregarlo a ese archivo antes de entregar el reporte final.

**Teléfono y Email:** nunca deben quedar en blanco a menos que de verdad no se encuentren. Orden de búsqueda en `execution/scrapear_sitios.mjs`: (1) `mailto:`/`href="tel:"` en el home y en las páginas internas relevantes ya rastreadas, (2) si no hay nada, se intenta directamente con rutas de contacto comunes (`/contacto`, `/contactenos`, `/contact`, etc.) aunque no estén enlazadas desde el menú. Si con todo eso no aparece nada, la celda dice explícitamente "No publicado en el sitio — validar por directorio o llamada telefónica" (nunca una celda vacía sin explicación). Páginas Amarillas Colombia y Google Maps se probaron como fuente adicional: Páginas Amarillas renderiza por JS y no es scrapeable con fetch simple; Google Maps requeriría una API key que no está conectada (ver "Conexiones recomendadas").

**Hoja "Contactos objetivo":** el usuario pidió explícitamente NO devolver enlaces de búsqueda genéricos ("una búsqueda de listas"), sino perfiles reales de personas. Política implementada:
- Primero se extraen nombres y cargos desde el propio sitio (`quienes somos`, `organigrama`, `junta directiva`, `liderazgo`) con una heurística de texto capitalizado, filtrada contra una lista de palabras de cargo/organización para no confundir "Desarrollo Directivo" o "Aceros Industriales" con un nombre de persona. Sigue siendo heurística: todo nombre encontrado debe verificarse antes de usarse.
- Después se intenta confirmar un perfil real de LinkedIn (`execution/buscar_linkedin.mjs`, vía DuckDuckGo HTML) cruzando el nombre/empresa. **Limitación medida el 2026-09-01: DuckDuckGo bloquea la búsqueda automatizada después de la PRIMERA consulta exitosa**, incluso con pausas de 12 segundos entre consultas — no es una fuente confiable a escala de 50 empresas. El script corta en cuanto detecta el bloqueo y conserva lo ya obtenido (mismo principio que con Apollo: nunca perder trabajo parcial).
- Cuando no hay nada confirmable, la fila dice explícitamente "Sin contacto público verificable en esta corrida" — nunca se rellena con una URL de búsqueda genérica por cargo. **Corregido en el código el 2026-09-01**: hasta esa fecha esta directiva describía la política pero `generar_excel.mjs` seguía escribiendo búsquedas genéricas de LinkedIn por cargo. Ahora la fila entrega la vía real de entrada (conmutador o correo comercial + el cargo a pedir).
- **Expectativa realista por sector (medido en Petróleo y Gas, 2026-09-01): 0 de 25 empresas** publican nombres de su jefatura de mantenimiento, confiabilidad o compras. Publican junta directiva y alta gerencia, que no son los cargos que decide Enermast. No prometer contactos nominales en este sector sin una fuente de pago.

**Hoja "Explicación de columnas":** obligatoria en cada entrega. Explica qué significa cada columna de cada hoja y detalla la fórmula completa del score (todas las reglas +N y los umbrales de Alto/Medio/Bajo), para que el usuario nunca tenga que preguntar cómo se calculó.

**Hoja "Diagnóstico":** cobertura de la corrida (cuántas empresas con evidencia, con contacto, excluidas por el límite de 50) y limitaciones conocidas de las fuentes.

**Hoja "Descartados"** (añadida el 2026-09-01): todo dominio que salió del descubrimiento pero no llegó al reporte, con el **motivo explícito** de cada descarte (prensa, academia, gobierno, gremio, directorio, empresa extranjera sin operación en Colombia, sitio bloqueado). El filtro vive en `DOMINIOS_DESCARTADOS` dentro de `generar_excel.mjs` (dominio → motivo). Nunca descartar en silencio: el usuario debe poder auditar el filtro y rescatar a mano cualquier caso que considere válido.

**Selección del dato de contacto que se muestra:** el scraping recoge todo lo que parece un teléfono o un correo; `generar_excel.mjs` elige cuál mostrar con `mejorTelefono()` (descarta pares de años tipo "2025 2024", exige 7-13 dígitos, prioriza +57 / móvil 3XXXXXXXXX / fijo 60X) y `mejorEmail()` (prioriza comercial/ventas/contacto/info y penaliza notificaciones judiciales, legal, RRHH y PQR; si lo único publicado es un buzón institucional, **lo dice en la propia celda**). El scoring de contacto usa estos mismos selectores, para no premiar un dato que el reporte va a descartar.

**Nombre de la empresa:** ni el título del resultado de búsqueda ni el `<title>` de la home son la razón social. La cascada es: (1) segmentos del `<title>` partidos por `| - – — : ·`, filtrados contra etiquetas de página y basura de plantilla, **priorizando el candidato cuya raíz coincida con el dominio**; (2) el título del resultado de búsqueda; (3) el dominio limpio. El chequeo contra el dominio es obligatorio: sin él se cuela el nombre real de OTRA empresa (`transmetano.co` titula "Promigas 50 años", su casa matriz).

**Verificación de país (regla #2):** el idioma y el TLD no bastan. Empresas venezolanas y panameñas aparecen con sitio en español y dominio `.com`, y `cartagena.repsol.es` es la refinería de Cartagena **de España** — el detector de ciudad la marca como "Cartagena" sin más. Verificar con el indicativo del teléfono publicado (+58, +507, +1) y contando menciones geográficas en la home antes de dar por colombiana a una empresa.

## Firecrawl como fallback de scraping (2026-09-01)

`execution/scrapear_sitios.mjs` intenta primero `fetch` simple (gratis, sin límite) para cada página. Solo cuando esa página falla o devuelve una cáscara vacía de SPA (<600 caracteres de texto limpio — sitios con contenido cargado por JS, típicamente SharePoint/Angular/React sin SSR) cae a la API de Firecrawl (`FIRECRAWL_API_KEY` en `.env`, `POST /scrape` con `formats: ["html","links"]`). Firecrawl devuelve HTML ya renderizado (mismo formato que procesan `extraerContacto`/`analizarEquipos`/`extraerMeta`, sin cambios) más una lista de enlaces internos ya resueltos a absolutos (mejor que el regex de `<a href>` sobre HTML crudo).

**Manejo de errores de Firecrawl** (medido el 2026-09-01):
- `401` (key inválida) o `402` (sin créditos): son permanentes para la corrida — se deshabilita Firecrawl y se sigue solo con `fetch` simple para el resto de empresas, conservando lo ya obtenido.
- `429` (límite de tasa/concurrencia): es transitorio, NO se debe deshabilitar Firecrawl por esto — solo falla esa página puntual. (Aprendizaje: la primera versión trataba 429 igual que 402 y apagaba Firecrawl de por vida en la corrida por un simple pico de concurrencia, perdiendo rescate de páginas innecesariamente).
- Sin `FIRECRAWL_API_KEY` en `.env`, el flujo sigue funcionando igual, solo sin este fallback (ver principio de "nunca depender de una sola fuente").

**Costo:** cada llamada a Firecrawl consume 1 crédito de la cuenta del usuario. No usarlo como método primario (saldría carísimo en llamadas); es estrictamente el último recurso por página. `.tmp/evidencia_web.json` guarda `firecrawl: {usos, errores, deshabilitado}` a nivel de corrida y `uso_firecrawl: true/false` por empresa para auditar el consumo.

## Flujo de 3 pasos (definido por el usuario el 2026-09-01)

**Paso 1 — Descubrimiento por búsqueda real en internet.** `execution/descubrir_empresas.mjs`. Prohibido armar la lista de empresas con el conocimiento del modelo: se descubren con búsquedas reales (Firecrawl `/search`) por subsector × ciudad, más consultas de noticias para captar señales de inversión, ampliación y obra nueva. Cada empresa queda con su `fuente_descubrimiento` (consulta + URL). Se filtran directorios, agregadores, prensa y redes sociales. **El endpoint `/search` tiene un límite de tasa más estricto que `/scrape`: con 1,5 s entre consultas devuelve 429 desde la consulta ~11.** Usar 8 s entre consultas y reintento con espera de 45 s. El script es reanudable: no repite consultas ya resueltas (cada búsqueda cuesta un crédito).

**Paso 2 — Extracción con navegador real.** `execution/scrapear_sitios.mjs` con **Playwright (Chromium headless)** como motor principal: renderiza JS, hace scroll hasta el fondo (el pie de página suele cargarse en lazy loading) y entrega el HTML completo. Firecrawl queda solo como respaldo cuando Playwright no puede cargar el sitio. En la prueba inicial Playwright resolvió sitios que antes requerían Firecrawl, sin consumir créditos.

**Paso 3 — Scoring y entregable.** `execution/generar_excel.mjs`.

La lógica de extracción (equipos, contactos, directivos, ciudad, idioma) vive en `execution/lib/extraccion.mjs`, compartida por ambos motores para no duplicarla.

### Ciudad: nunca heredarla de la consulta

El buscador devuelve resultados nacionales aunque la consulta diga "Barranquilla" (aparecieron hospitales de Bogotá, Cali y Bucaramanga). La ciudad **no** se asigna por la consulta que descubrió la empresa: se detecta en el propio sitio (junto a un indicador de dirección) y, en el Excel, las empresas cuya ciudad confirmada esté fuera de la Costa Caribe se excluyen del reporte y se contabilizan en Diagnóstico como "fuera de alcance".

### Sector institucional: inferencia declarada, no invención

En clínicas, universidades, centros comerciales y hoteles casi nunca se menciona el equipamiento técnico en la web (hablan de servicios médicos o comerciales, no de sus chillers). Por eso el scoring asigna un puntaje base por tipo de instalación (clínica +5, hotel +4, centro comercial +4, universidad +3) y la columna de equipos separa **siempre** en dos bloques: `CONFIRMADO en su sitio` (con menciones y URL) e `INFERENCIA por tipo de instalación (no confirmado, validar en visita)`. Esto cumple la regla del ICP de diferenciar hecho de inferencia sin dejar el reporte vacío.

## Herramientas de ejecución

| Script | Función | Estado |
|---|---|---|
| `execution/descubrir_empresas.mjs` | **Paso 1.** Descubre empresas por búsqueda real en internet (subsector × ciudad + noticias) y escribe `execution/semillas_prospectos.json` con la fuente de cada hallazgo | **Activo** |
| `execution/lib/extraccion.mjs` | Funciones puras de extracción (equipos, contactos, directivos, ciudad, idioma, enlaces) compartidas por los motores | **Activo** |
| `execution/scrapear_sitios.mjs` | **Paso 2.** Playwright (Chromium) como motor principal + Firecrawl de respaldo. Guarda en `.tmp/evidencia_web.json` | **Activo — fuente única de datos** |
| `execution/buscar_linkedin.mjs` | Mejor esfuerzo para confirmar perfiles de LinkedIn por empresa. Guarda en `.tmp/contactos_linkedin.json` | Activo, best-effort (ver limitación de DuckDuckGo arriba) |
| `execution/generar_excel.mjs` | Calcula score, aplica traducciones, arma las 4 hojas y genera el Excel en `entregables/` | **Activo** |
| `execution/list_composio_connections.mjs` | Diagnóstico: lista conexiones de Composio y su estado | Activo (utilidad general, no específica de prospección) |
| `execution/enriquecer_prospectos.mjs` | Enriquecía vía Apollo | **Deprecado, no usar** |

## Flujo

1. **Preguntar al usuario** sector, ciudad(es), línea de negocio y aclaraciones (ver reglas fijas arriba). No arrancar el scraping sin esto.
2. **Preparar/ampliar semillas** — `execution/semillas_prospectos.json`, solo empresas colombianas reales del sector/ciudad indicados.
3. **Extraer de la web** — `node execution/scrapear_sitios.mjs`.
4. **Intentar confirmar contactos de LinkedIn (opcional, best-effort)** — `node execution/buscar_linkedin.mjs`.
5. **Traducir lo que haga falta** — revisar `.tmp/evidencia_web.json` por `idioma_detectado: "en"`, añadir las traducciones confirmadas a `execution/traducciones.json`.
6. **Generar Excel** — `node execution/generar_excel.mjs`.
7. **Revisar** — validar manualmente los prospectos de Alta prioridad y cualquier contacto antes de escribirle. Los emails genéricos (legal, RRHH, notificaciones judiciales) son evidencia de dominio de correo, no contacto directo de venta.

## Salidas

- `.tmp/evidencia_web.json`, `.tmp/contactos_linkedin.json` — intermedios regenerables. **Antes de prospectar un sector/ciudad distinto al de la última corrida del mismo día, archivar estos JSON y `execution/semillas_prospectos.json` en `.tmp/archivo_<sector>_<fecha>/` y resetear `semillas_prospectos.json` a `[]`** — si no, `descubrir_empresas.mjs` reanuda y mezcla las semillas del sector anterior con las nuevas.
- `entregables/prospectos_enermast_<sector>_<fecha>.xlsx` — entregable final (4 hojas, ver especificación arriba). El nombre incluye un slug del sector (derivado de los propios datos) y `generar_excel.mjs` nunca sobrescribe: si el archivo ya existe agrega `_v2`, `_v3`... (aprendizaje 2026-09-01, ver abajo).

## Manejo de errores (obligatorio)

- **Nunca perder trabajo parcial.** Todo script escribe su JSON de resultados incluso si aborta a mitad de camino (bloque `finally`).
- **Bloqueo de motor de búsqueda (DuckDuckGo u otro):** no es transitorio a esta escala — no reintentar en bucle. Cortar, conservar lo obtenido, y que quede registrado en Diagnóstico.
- **Sitio web caído, sin contenido HTML o con bloqueo anti-bot:** registrar el motivo y continuar; nunca abortar la corrida completa por un sitio.
- **Dato de contacto no encontrado:** resultado válido, no error. Nunca se inventa — se marca explícitamente como no encontrado.

## Scoring implementado

Sobre el scoring base del ICP (`contexto_enermast.md` §12), `generar_excel.mjs` aplica:

- **+3** sector objetivo del ICP · **+3** evidencia de procesos térmicos/vapor/refrigeración · **+2** menciona mantenimiento/confiabilidad/paradas de planta.
- **+2 por línea de negocio con equipos confirmados** (tope +4): la evidencia real pesa más que el tamaño de la empresa.
- **+2** proximidad operativa a la región Caribe (sede de Enermast en Barranquilla).
- **+1** comunica eficiencia energética · **+1** tiene email/teléfono directo publicado · **+1** se identificó al menos un cargo de mantenimiento/planta/operaciones en el sitio.
- **Techo "Medio" sin evidencia:** sin ningún equipo confirmado, el nivel nunca es "Alto" así el score sea alto por otras razones (regla del ICP: la industria sola no basta).

Umbrales vigentes (2026-09-01, tras quitar los componentes basados en datos de Apollo que ya no se usan): **Alto ≥12 · Medio 7-11 · Bajo <7**.

## Casos extremos y reglas de calidad

- Toda afirmación sobre equipos debe estar respaldada por una URL, visible en la hoja Prospectos junto al equipo. Sin evidencia, se marca **inferencia sectorial**, nunca como hecho.
- El scraping respeta el sitio: una sola pasada, concurrencia moderada, `User-Agent` identificable, timeout corto.
- Nunca fabricar un nombre de persona, un perfil de LinkedIn o un dato de contacto. Es preferible una celda que diga "no encontrado" a un dato inventado o mal atribuido a una persona real.

## Conexiones recomendadas (pendientes de decisión del usuario)

- **Hunter.io** (disponible en Composio): búsqueda de emails corporativos verificados sin depender de que estén publicados en el sitio. Resolvería directamente el punto débil de "Email" cuando el scraping no encuentra nada.
- **Tavily / SerpAPI / Exa** (disponibles en Composio): búsqueda web sin el bloqueo agresivo que sí tiene DuckDuckGo ante consultas automatizadas repetidas — desbloquearía la confirmación de perfiles de LinkedIn a escala y el descubrimiento automático de empresas (hoy la lista semilla es curada manualmente).
- **Google Maps / Places** (disponible en Composio): teléfonos y direcciones verificados por directorio cuando el sitio no los publica.
- Ninguna de estas conexiones está activa hoy; requieren que el usuario las autorice explícitamente en Composio antes de usarlas.
