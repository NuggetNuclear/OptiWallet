# OptiWallet — Beta Web App

> Versión beta con datos estáticos. Sin backend. Funciona como PWA.
> Stack: Next.js 14 (App Router) + React 18 + Tailwind CSS + TypeScript.

## Arrancar localmente

```bash
npm install
npm run dev
```

Abre http://localhost:3000.

## Estructura

```
optiwallet/
├── app/
│   ├── layout.tsx          # fuentes, meta PWA, viewport
│   ├── page.tsx            # home que orquesta las vistas
│   ├── globals.css         # paleta, grain, utilidades base
│   └── icon.svg            # favicon
├── components/
│   ├── Header.tsx          # logo + acceso a wallet
│   ├── DayPicker.tsx       # selector horizontal de día
│   ├── TodaysFeed.tsx      # feed de promos del día
│   ├── MerchantSearch.tsx  # búsqueda + chips de categoría
│   ├── MerchantDetail.tsx  # vista detalle de un comercio
│   ├── RecommendationCard.tsx  # card ganadora + alternativa
│   └── WalletSetup.tsx     # onboarding / gestión de tarjetas
├── lib/
│   ├── types.ts            # contratos de dominio
│   ├── format.ts           # fechas y CLP en español
│   ├── use-wallet.ts       # hook con localStorage
│   ├── recommendation-engine.ts  # motor puro
│   └── data/
│       ├── banks.ts        # 14 bancos (solo BCI activo)
│       ├── cards.ts        # productos BCI
│       ├── categories.ts   # categorías de comercios
│       ├── merchants.ts    # ~25 comercios del documento BCI
│       └── promotions.ts   # 25 promos de abril 2026 verificadas
├── public/
│   ├── manifest.json
│   └── icon.svg
└── ...
```

## Notas de producto y arquitectura

### El motor es una función pura

`lib/recommendation-engine.ts` expone `getRecommendations({ cardIds, merchantId?, date, amount? })` que devuelve recomendaciones ordenadas. La función no toca DOM, fetch ni storage: son entradas → salidas. Cuando llegue la Fase 1.3 del roadmap y montemos el backend, este mismo archivo se copia al servidor sin un solo cambio y se envuelve detrás de un endpoint `GET /recomendaciones`.

### La capa de datos se mapea 1:1 al esquema Postgres futuro

Los tipos en `lib/types.ts` están escritos pensando en lo que van a ser tablas SQL. Campos clave ya considerados:

- `Promotion.daysOfWeek: number[]` → en Postgres será un `smallint[]` o un bitmap (decidir en Fase 1.1).
- `Promotion.cap: number | null` → `integer NULL` (sin tope).
- `Promotion.startDate / endDate: string?` → `date NULL`.
- `Promotion.verifiedAt: string` → requerido, mapea al campo `verificada_at` del roadmap.
- `Promotion.source: string` → mapea a `url_fuente` / `verificada_por`.

Cuando llegue el momento de migrar, el seed de Postgres puede generarse directamente desde `lib/data/promotions.ts` con un script corto.

### Wallet del usuario

Vive en `localStorage` bajo la key `optiwallet:cards` como un array de `cardId`. El hook `useWallet` expone `hydrated` para evitar hydration mismatches en SSR. Cuando exista backend y cuentas opcionales (Fase 4.1), agregamos un sync en el mismo hook sin cambiar la API.

### Datos cargados

Todas las promos vienen del documento de beneficios BCI, abril 2026 (página 6). Hay 25 promos estructuradas cubriendo 25 comercios en 11 categorías. Los otros 13 bancos del landing aparecen como "próximamente" — es honesto y evita mentirle al usuario hasta que agreguemos data real.

### Consideraciones PWA

- El `layout.tsx` declara `appleWebApp: { capable: true }` y `viewport-fit: cover` para que funcione bien con "Añadir a pantalla de inicio" en iOS.
- CSS variables `--safe-top` / `--safe-bottom` aplican `env(safe-area-inset-*)` para respetar notch y home indicator.
- El `manifest.json` incluye referencias a `icon-192.png`, `icon-512.png` y un ícono maskable. Hay que generarlos desde `public/icon.svg` antes de deploy — cualquier tool tipo `pwa-asset-generator` lo hace en un comando.

### Lo que falta antes de deploy a beta cerrada

Como dice el roadmap en Fase 2:

1. **Íconos PNG de la PWA** (192, 512, maskable) — generar desde el SVG y poner en `/public`.
2. **Service worker** para offline básico — se puede agregar con `next-pwa` o configurarlo a mano cuando el contenido esté estable.
3. **Analytics sin Google** — instalar Plausible, Umami o PostHog. Ya está prometido en el landing que no usamos GA.
4. **Error tracking** — Sentry o similar.
5. **Página por comercio con ruta real** (Fase 4.5 para SEO) — hoy todo vive en `/`. Cuando convenga, mover `MerchantDetail` a `app/comercio/[id]/page.tsx`.
6. **Feedback "reportar promo caducada"** — UI del roadmap Fase 2.4, falta el botón y el endpoint de cola.

### Lo que está explícitamente fuera de alcance en esta beta

Siguiendo el roadmap:

- No hay cuentas, login ni sync entre dispositivos.
- No pedimos número de tarjeta, clave ni RUT.
- No scrapeamos bancos en tiempo real — toda la data es estática y curada.
- No hay logos de bancos ni de comercios hasta que el análisis legal de Fase 6 apruebe.

## Stack cuando aterricemos el backend

De acuerdo al roadmap:

- **DB**: PostgreSQL. El JSONB sirve para `conditions_texto` y otros campos que van a crecer orgánicamente.
- **API**: Node.js + FastAPI o Express detrás de un monorepo. Endpoints iniciales: `GET /comercios?q=`, `GET /recomendaciones`, `GET /promociones/:id`.
- **Cache**: Redis con TTL corto para `comercios` y `promociones vigentes`.
- **Hosting**: Vercel (frontend) + Railway/Fly.io (backend) + Supabase o Neon (DB).

## Licencia y disclaimer legal

Esta es una beta de desarrollo. No usar en producción sin completar la Fase 6 (términos, privacidad, análisis legal) del roadmap.

---

v0.1.0-beta · hecho en Santiago 🇨🇱
