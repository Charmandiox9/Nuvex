# AGENTS.md · Nuvex

## Contexto del producto

Nuvex es un drive personal autoalojado en Ubuntu Server. La persona propietaria accede con contraseña y TOTP. Los invitados solo ven los elementos autorizados por su enlace y código. Conservamos los originales y generamos derivados para navegación y reproducción. Las primeras instalaciones funcionan en red local. El servidor accede a los archivos para procesarlos y los datos persistentes viven en un volumen cifrado.

- En el código usa inglés para identificadores. Mantén textos de interfaz y error en español claro. Usa las palabras de producto «archivo», «carpeta», «papelera», «vista previa» y «canje».
- Trata el repositorio, logs, documentación y ejemplos como públicos. Usa datos sintéticos. Conserva credenciales, claves y archivos personales fuera del repositorio.
- Lee [arquitectura](backend/docs/architecture.md) antes de cambiar límites entre procesos. Lee [contratos API](backend/docs/api.md) al modificar endpoints. Lee [operación](backend/docs/operations.md) al tocar despliegue, contenedores, copias o privilegios.

## Mapa y dependencias

| Área | Responsabilidad |
|---|---|
| `frontend` | Next.js, composición de vistas, estados del usuario, formularios y consumo de contratos. |
| `backend/src` | Punto de entrada de NestJS y módulos por dominio. |
| `backend/src/worker` | Ejecución de trabajos BullMQ, procesamiento aislado de contenido, limpieza e integraciones externas. |
| `backend/prisma` | Configuración, esquema, migraciones y cliente de Prisma para PostgreSQL. |
| `backend/src/database`, `backend/src/storage` y `backend/src/queue` | Proveedores compartidos de PostgreSQL, S3 y BullMQ. |
| `backend/infra` y Compose | Proxy, publicación de versiones y procedimientos de despliegue y respaldo. |

Las dependencias van de los puntos de entrada hacia servicios y adaptadores. Un controlador convierte HTTP en una llamada de aplicación. Un resolver hace lo mismo para GraphQL. Ambos deben aplicar las mismas políticas de acceso. El worker usa los contratos de cola y persistencia compartidos. La web usa DTO serializados por la API. Prisma y los clientes S3 viven en el servidor.

## Módulos NestJS

- Agrupa cada dominio en `backend/src/<módulo>`. Registra sus controladores y proveedores en `<módulo>.module.ts`. Define DTO, servicios y resolvers junto a su módulo cuando correspondan.
- Declara las dependencias de Nest con `imports` y exporta los proveedores que consumen otros módulos. Los controladores y resolvers verifican identidad y validan el transporte. Los servicios aplican permisos de dominio y operan sobre los adaptadores inyectados.
- Usa `app.module.ts` para componer los módulos y `http/setup.ts` para la configuración HTTP y Swagger. El worker arranca por separado y comparte adaptadores sin depender del módulo HTTP.

## SOLID y diseño de interfaces

- **Responsabilidad única.** Separa cambios que responden a razones distintas. Si cambia una política, ajusta el servicio de dominio. Si cambia HTTP, ajusta el controlador y el DTO. Si cambia un proveedor, limita el cambio al adaptador.
- **Abierto a extensión.** Añade una integración mediante el punto de extensión existente. Extrae un contrato al aparecer dos implementaciones o un límite externo que necesite un reemplazo comprobable.
- **Sustitución.** Un adaptador alternativo debe respetar entradas válidas, permisos, errores, límites y garantías del que reemplaza. Prueba ambos contra el mismo contrato cuando exista más de uno.
- **Segregación.** Da a cada consumidor las operaciones que necesita. Prefiere, por ejemplo, un contrato pequeño de lectura de objetos para el visor y uno de escritura para la ingesta.
- **Inversión de dependencias.** Usa inyección de Nest en los servicios de aplicación. Configura clientes externos en el arranque o adaptador correspondiente. Usa puertos pequeños en fronteras reales. Mantén las funciones de cálculo y normalización puras cuando sea posible.
- Modela capacidades extensibles u objetos públicos mediante `interface` cuando corresponda. Usa `type` para uniones discriminadas, alias y resultados cerrados. Los DTO REST son clases con validadores que funcionan en runtime. Serializa modelos Prisma a DTO explícitos y convierte `bigint` a cadena decimal antes de enviarlo.

## TypeScript estricto y código limpio

- Mantén `strict` activado en todos los paquetes. Recibe datos externos como `unknown`, valídalos y estrecha tipos antes de operar. Evita `any`, aserciones dobles, `@ts-ignore` y aserciones no nulas sin una invariante comprobada.
- Usa nombres de negocio y unidades explícitas en constantes y parámetros. Ejemplos: `ownerId`, `expiresAt`, `sessionDurationMs`, `expectedSizeBytes`. Nombra acciones y estados por su intención.
- Declara los retornos de contratos públicos cuando la inferencia permita una forma accidental. Modela estados incompatibles con uniones discriminadas. Distingue entre un campo ausente, `null` y una cadena vacía según el contrato.
- Valida pronto y retorna en casos inválidos. Mantén el camino normal legible. Extrae funciones para reglas que se usan en varios flujos o que necesitan pruebas propias. Explica con comentarios las invariantes y decisiones que el código no puede expresar.
- Maneja promesas rechazadas. Si una tarea de mejor esfuerzo falla, conserva un estado desde el que pueda recuperarse y registra el fallo cuando sea útil. Usa `finally` para liberar recursos. Propaga errores inesperados sin incluir datos privados.
- Reduce el alcance de cada cambio. Reutiliza servicios existentes, conserva los contratos que usan otros módulos y añade dependencias solo si resuelven un requisito concreto. Comprueba soporte de Linux, versión, licencias y costo de ejecución. Actualiza `pnpm-lock.yaml` junto con el manifiesto.
- Aplica el criterio de «cambio mínimo completo» (Ponytail). En este orden: si algo ya existe en el repo, en la biblioteca estándar o en una dependencia instalada, úsalo; no añadas dependencias para unas pocas líneas; no crees abstracciones, opciones, config o código «para más adelante» que nadie pidió. Sé perezoso con la solución, nunca con el cambio: termina los llamadores, pruebas y fixtures que tu cambio rompe. Nunca recortes validación en fronteras de confianza, manejo de errores que evite pérdida de datos, seguridad ni accesibilidad.

## Seguridad y datos

- Verifica la sesión y limita cada consulta al propietario o a la sesión de invitado. Para invitados comprueba vencimiento, revocación, pertenencia al árbol compartido y permiso de descarga en cada solicitud de contenido.
- Separa las credenciales de primer paso de las sesiones verificadas. Consume TOTP, códigos de recuperación y canjes de forma atómica. Los logs pueden incluir identificadores operativos, pero deben omitir contraseñas, cookies, códigos en claro, claves y URLs privadas.
- Los nombres, MIME, formatos, URLs y respuestas de integraciones se consideran datos externos. Usa claves de objeto generadas en el servidor. Sirve originales arbitrarios como adjuntos y valida el formato antes de servir una vista previa.
- En importaciones, valida el destino y cada salto, usa el destino ya comprobado al conectar y aplica límites de tiempo y tamaño. Ofrece revisión antes del acceso a URLs o del envío a DeepSeek.
- Los efectos distribuidos entre PostgreSQL, S3 y Redis requieren reintentos idempotentes o compensación. Conserva un identificador estable por operación. Marca un elemento visible solo después de verificar el objeto y usa estados que permitan reanudar o limpiar un resultado parcial.
- Las tareas de cola reciben identificadores, revalidan su contexto y toleran reintentos y borrado concurrente. Mantén acotados CPU, memoria, concurrencia y tiempo. Clasifica los errores recuperables y registra el estado final.

## Migraciones Prisma

1. Cambia `backend/prisma/schema.prisma` y genera una migración con `pnpm -C backend exec prisma migrate dev --name <cambio>` sobre una base local de desarrollo.
2. Revisa el SQL. Verifica restricciones, índices, efectos sobre datos existentes y bloqueos previsibles. Para un cambio incompatible, añade primero la estructura compatible, rellena los datos y elimina columnas antiguas en una entrega posterior.
3. Ejecuta `pnpm generate`, aplica todas las migraciones en PostgreSQL limpio y prueba la actualización desde la versión anterior con datos representativos. Únicamente versiona el esquema, la migración y su código consumidor. El cliente generado se reconstruye.
4. Una migración aplicada queda inmutable. Crea otra para corregirla. En Ubuntu ejecuta `pnpm migrate` después del respaldo. `migrate reset` corresponde a bases de prueba desechables. Coordina la reversión del código y la compatibilidad del esquema.

## Contratos e interfaz web

- REST vive bajo `/api/v1`. Documenta DTO, códigos de estado, cookies, encabezados y errores mediante Swagger. Para binarios documenta tipo, tamaño y rangos. Actualiza pruebas y ejemplos al cambiar un contrato. Mantén GraphQL privado y limita sus consultas a lectura.
- Conserva un único origen de autenticación en el backend. La UI puede ocultar acciones, y el servicio comprueba los permisos antes de ejecutarlas.
- Usa CSS para estados directos y Anime.js para transiciones coordinadas. Three.js se carga de forma diferida en el login y libera sus recursos al salir. Respeta `prefers-reduced-motion`, conserva el acceso por teclado y muestra errores persistentes junto a la acción que falló. Sileo sirve para confirmaciones breves.
- Los textos de interfaz se escriben mediante i18n con soporte en español e inglés; el español es el idioma por defecto. Extrae las cadenas a los catálogos de traducción en lugar de dejar literales hardcodeados en JSX.
- Prioriza la reutilización: crea componentes genéricos que acepten distintos tipos de datos y evita tener varios componentes que hagan lo mismo. Antes de crear uno, comprueba si ya existe algo equivalente en `frontend/src/components`.
- Para decisiones visuales y de componentes usa las skills de diseño instaladas: `impeccable`, `ui-ux-pro-max`, `design-taste-frontend`, `emil-design-eng`, `apple-design`, `vercel-react-best-practices`, `vercel-composition-patterns`, `web-design-guidelines` y `modern-web-guidance`. El sistema de diseño vive en `frontend/DESIGN.md` y es la fuente de verdad para tokens, tipografía y componentes.
- Prueba en móvil y escritorio. Las cargas y consultas deben estar paginadas o procesarse por partes cuando el tamaño pueda crecer.

## Verificación y entrega

- En desarrollo levanta PostgreSQL, Redis y SeaweedFS con `pnpm dev:infra`. Ejecuta Next.js con `pnpm dev` y NestJS con `pnpm start:dev` en el host. Usa `pnpm start:worker:dev` para probar trabajos de cola.

- Ejecuta `pnpm generate`, `pnpm lint`, `pnpm typecheck`, `pnpm build` y `pnpm test`. Usa `pnpm test:e2e` con servicios locales activos para cambios de flujos de usuario.
- Prueba autenticación en dos pasos, permisos, recursos vencidos, fallos parciales, concurrencia y reintentos cuando cambien esas rutas. Las pruebas de integración usan PostgreSQL, S3 y Redis de prueba. Usa fixtures sin contenido personal ni llamadas pagadas.
- Comprueba el diff antes de entregar. Declara qué verificaste y qué quedó pendiente por infraestructura. Mantén las reglas de este archivo al día cuando cambie una decisión transversal.
- Tras completar una funcionalidad importante, crea commits separados y explicados: un cambio lógico por commit (feature, refactor, documentación), con un mensaje claro que describa el qué y el porqué. No acumules varias funcionalidades en un mismo commit ni mezcles refactors con features.

## Graphify

Al recibir `/graphify`, lee el SKILL.md de Graphify instalado y sigue sus instrucciones antes de avanzar.
