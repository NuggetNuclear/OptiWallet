# TODO — Placeholders y pendientes

> Inventario de todo el contenido placeholder y las tareas operativas pendientes.
> Generado en Sprint 2 (junio 2026). Marcar con `[x]` al resolver.

## 🔴 Contenido placeholder visible en producción

### Landing (`app/page.tsx`)
- [ ] **Testimonio falso** — sección quote: "— Nombre Apellido / Usuaria beta · Providencia" con cita inventada ("ahorré $94.000 en un mes"). Reemplazar por un testimonio real de la beta o eliminar la sección antes de difundir.
- [ ] **Avatar del testimonio** — `.quote-avatar` es un círculo vacío sin foto.
- [ ] **Cifra "$180k de ahorro promedio anual"** — proyección sin metodología real (el footer admite "*Estimaciones con placeholder"). Calcular con datos reales o re-redactar.
- [ ] **Cifra "+40% de los chilenos tiene más de 2 tarjetas"** — sin fuente citada. Buscar fuente (CMF/SBIF) o eliminar.
- [ ] **Cifra "14 bancos al lanzamiento"** — hardcodeada; el resto de stats viene de `/api/stats`. Unificar o verificar.
- [ ] **Footer: "v0.1.0-beta · \*Estimaciones con placeholder"** — quitar el asterisco cuando las cifras sean reales.
- [ ] **Sección "Instalar" (#instalar)** — los 4 pasos son solo iOS/Safari. Ahora existe el popup con tabs Android/iOS (`InstallModal`); considerar unificar esta sección o agregarle un botón que abra el popup.

### Páginas "Coming Soon" (componente `ComingSoon`)
- [ ] **/sobre-nosotros** — solo un párrafo genérico ("equipo de estudiantes de la UDP"). Escribir la historia real, fotos/nombres del equipo.
- [ ] **/blog** — sin artículos. Escribir los primeros posts (ideas: guía promos por banco, cómo funciona el motor de recomendaciones).
- [ ] **/roadmap** — sin contenido. Publicar roadmap real (puede salir del backlog de sprints).
- [ ] **/prensa** — "Kit de prensa en preparación". Crear kit: logos (SVG/PNG), capturas, ficha de datos, boilerplate.

### Email de contacto
- [ ] **hola@optiwallet.cl** — usado en contacto, prensa, privacidad y ComingSoon. Verificar que el dominio optiwallet.cl esté registrado y la casilla exista; si no, cambiar a una casilla real en todos los puntos (grep `hola@optiwallet.cl`).

## 🟡 Operativo Sprint 2 (para activar lo implementado)

- [ ] **Sentry**: crear proyecto en sentry.io y setear `NEXT_PUBLIC_SENTRY_DSN` en Vercel (sin la variable, el SDK queda apagado). Ver `.env.example`.
- [ ] **Sentry sourcemaps** (opcional): agregar `withSentryConfig` en `next.config.mjs` + `SENTRY_AUTH_TOKEN` para stack traces legibles en producción.
- [ ] **Plausible**: agregar el sitio `optiwallet.vercel.app` en plausible.io y setear `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` en Vercel.
- [ ] **Plausible goals**: registrar los eventos custom como Goals para verlos en el dashboard: `Onboarding Started`, `Onboarding Completed`, `Wallet Updated`, `CTA Click`, `Install Modal Opened`, `Install Instructions Viewed`, `Merchant Viewed`.
- [ ] **npm install local**: tras este sprint hay una dependencia nueva (`@sentry/nextjs`). Correr `npm install` en la máquina local (el `node_modules` quedó incompleto).

## 🟢 Deuda menor / mejoras

- [ ] Banner de "nueva versión disponible" cuando el Service Worker detecta update (hoy solo `console.info` — ver `lib/hooks/use-service-worker.ts`, anotado para Sprint 3).
- [ ] Swagger UI (`/api-docs`): los assets en `public/swagger/` son swagger-ui-dist@5.32.6 copiados a mano; documentar/automatizar el bump de versión.
- [ ] Favoritos + alertas e Historial de ahorro: marcados "Próximamente" en la landing — alinear con el roadmap publicado.
- [ ] Página 404 personalizada (`app/not-found.tsx`) con el branding de la app.
