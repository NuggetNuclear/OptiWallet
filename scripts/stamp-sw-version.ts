// scripts/stamp-sw-version.ts
// Estampa una versión única (el commit SHA del deploy) en `public/sw.js`.
// Corre como `prebuild`, así que npm lo invoca automáticamente antes de
// `next build` — local y en Vercel.
//
// ¿Por qué existe? El browser solo detecta una nueva versión del Service Worker
// cuando cambian los BYTES de /sw.js. El bundle de la app cambia en cada deploy,
// pero /sw.js es estático y, sin esto, nunca cambiaría → el banner "nueva
// versión disponible" jamás aparecería. Reescribir SW_VERSION con el SHA del
// deploy garantiza que /sw.js cambie en cada deploy.
//
// Nota: tras un `npm run build` local, public/sw.js quedará con el SHA estampado
// (git lo marca como modificado). No lo commitees con ese valor: el placeholder
// versionado es "dev". Restaurar con: git checkout public/sw.js

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const SW_PATH = new URL("../public/sw.js", import.meta.url);

function resolveVersion(): string {
  // En Vercel el SHA del commit viene en el entorno de build.
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromVercel) return fromVercel.slice(0, 8);

  // Build local: usamos el HEAD de git si está disponible.
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    // Último recurso: timestamp (siempre único).
    return `t${Date.now()}`;
  }
}

const version = resolveVersion();
const source = readFileSync(SW_PATH, "utf8");
const next = source.replace(
  /const SW_VERSION = "[^"]*";/,
  `const SW_VERSION = "${version}";`,
);

if (next === source && !/const SW_VERSION = "/.test(source)) {
  console.error(
    "[stamp-sw-version] No se encontró `const SW_VERSION = \"...\";` en public/sw.js",
  );
  process.exit(1);
}

writeFileSync(SW_PATH, next);
console.log(`[stamp-sw-version] public/sw.js → SW_VERSION = "${version}"`);
