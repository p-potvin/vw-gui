/* ==========================================================================
   vw-gui :: icon generation
   --------------------------------------------------------------------------
   Renders build/logo.svg and build/tray.svg into the raster assets Windows
   and Electron need. Requires ImageMagick 7 (`magick`) on PATH.

       node scripts/make-icon.js

   Outputs
     build/icon.png    512  app icon; electron-builder derives the .ico
     build/icon.ico    multi-size, for shortcut IconLocation
     build/tray-16.png tray at 100% scaling
     build/tray-32.png tray at 200% scaling

   The two SVGs are deliberately different drawings rather than one scaled
   asset: the card and gradients that make the app icon read at 256px average
   into a smudge at 16px.
   ========================================================================== */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BUILD = path.join(__dirname, "..", "build");
const LOGO = path.join(BUILD, "logo.svg");
const TRAY = path.join(BUILD, "tray.svg");

function magick(args) {
  execFileSync("magick", args, { stdio: ["ignore", "pipe", "pipe"] });
}

function ensure(file) {
  if (!fs.existsSync(file)) throw new Error(`missing source: ${file}`);
}

try {
  execFileSync("magick", ["-version"], { stdio: "ignore" });
} catch {
  console.error("ImageMagick 7 ('magick') is not on PATH — cannot generate icons.");
  process.exit(1);
}

ensure(LOGO);
ensure(TRAY);

// App icon.
const iconPng = path.join(BUILD, "icon.png");
magick(["-background", "none", LOGO, "-resize", "512x512", iconPng]);

// Multi-resolution .ico. Windows picks the nearest size per context — the
// shortcut in the Start menu and the one in a 16px list are not the same job.
const iconIco = path.join(BUILD, "icon.ico");
magick([
  "-background", "none", LOGO,
  "-define", "icon:auto-resize=256,128,64,48,32,16",
  iconIco,
]);

// Tray, from the simplified drawing.
for (const size of [16, 32]) {
  const out = path.join(BUILD, `tray-${size}.png`);
  magick(["-background", "none", TRAY, "-resize", `${size}x${size}`, out]);
}

for (const f of ["icon.png", "icon.ico", "tray-16.png", "tray-32.png"]) {
  const p = path.join(BUILD, f);
  console.log(`  ${f.padEnd(14)} ${fs.statSync(p).size} bytes`);
}
