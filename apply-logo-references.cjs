const fs = require("node:fs");
for (const file of ["src/components/reports.tsx", "src/server/email-templates.ts"]) {
  if (!fs.existsSync(file)) continue;
  const source = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, source.replaceAll("/brand/logo.jpg", "/brand/logo-light.png"));
}
console.log("Light-background email and print report logo references updated.");
