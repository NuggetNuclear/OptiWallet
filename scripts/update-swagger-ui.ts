// scripts/update-swagger-ui.ts
// Descarga la última versión de swagger-ui-dist desde npm y copia los
// 3 archivos necesarios a public/swagger/. No instala dependencias.
//
//   npm run swagger:update
//

import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

// En Windows, npm.ps1 puede estar bloqueado por execution policy.
// Usar cmd /c npm asegura compatibilidad.
const NPM = process.platform === "win32" ? "cmd /c npm" : "npm";

const DEST = join(import.meta.dirname, "..", "public", "swagger");
const TMP = join(import.meta.dirname, "..", "swagger-update-tmp");

const FILES = [
  { src: "swagger-ui-bundle.js", dest: "swagger-ui-bundle.js" },
  { src: "swagger-ui.css", dest: "swagger-ui.css" },
  { src: "LICENSE", dest: "LICENSE.swagger-ui.txt" },
];

async function main() {
  // 1. Crear directorio temporal
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
  mkdirSync(TMP, { recursive: true });

  try {
    // 2. Instalar swagger-ui-dist en el tmp (sin tocar el proyecto)
    console.log("📦 Descargando swagger-ui-dist@latest...");
    writeFileSync(join(TMP, "package.json"), '{"name":"tmp","private":true}');
    execSync(`${NPM} install swagger-ui-dist@latest --save-exact`, {
      cwd: TMP,
      stdio: "pipe",
    });

    // 3. Leer la versión instalada
    const pkgPath = join(TMP, "node_modules", "swagger-ui-dist", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const version = pkg.version;
    console.log(`✅ swagger-ui-dist@${version}`);

    // 4. Copiar los 3 archivos
    mkdirSync(DEST, { recursive: true });
    const distDir = join(TMP, "node_modules", "swagger-ui-dist");

    for (const f of FILES) {
      const srcPath = join(distDir, f.src);
      const destPath = join(DEST, f.dest);
      const content = readFileSync(srcPath);
      writeFileSync(destPath, content);
      const sizeKB = Math.round(content.length / 1024);
      console.log(`  → ${f.dest} (${sizeKB} KB)`);
    }

    console.log(`\n🎉 Swagger UI actualizado a v${version} en public/swagger/`);
  } finally {
    // 5. Limpiar
    rmSync(TMP, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("❌ Error actualizando Swagger UI:", err);
  // Limpiar en caso de error
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  process.exit(1);
});
