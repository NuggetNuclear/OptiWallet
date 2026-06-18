import { readFileSync } from "node:fs";

const file = "d:/Code/OptiWallet/scripts/scrapers/out/banco-chile.import.json";
const data = JSON.parse(readFileSync(file, "utf-8"));
const withCodes = data.clean.filter(x => x.code !== null);
console.log(`Encontrados ${withCodes.length} registros con código parseado.`);
console.log("Muestra de códigos:");
console.log(JSON.stringify(withCodes.slice(0, 10).map(x => ({
  merchant_name: x.merchant_name,
  code: x.code,
  excerpt: x.conditions.substring(0, 120) + "..."
})), null, 2));
