import { readFileSync } from "node:fs";

const file = "d:/Code/OptiWallet/scripts/scrapers/out/banco-chile.import.json";
const data = JSON.parse(readFileSync(file, "utf-8"));
const piwen = data.clean.filter(x => x.merchant_name.toLowerCase().includes("piw"));
console.log(JSON.stringify(piwen, null, 2));
