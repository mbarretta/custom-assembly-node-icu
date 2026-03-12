"use strict";

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DIVIDER = "─".repeat(62);
let totalPass = 0;
let totalFail = 0;

function header(title) {
  console.log(`\n${DIVIDER}`);
  console.log(`  ${title}`);
  console.log(DIVIDER);
}

function pass(label, detail) {
  totalPass++;
  console.log(`  ✅ ${label}`);
  if (detail) console.log(`     ${detail}`);
}

function fail(label, detail) {
  totalFail++;
  console.log(`  ❌ ${label}`);
  if (detail) console.log(`     ${detail}`);
}

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function shellOk(cmd) {
  try { execSync(cmd, { stdio: "pipe" }); return true; } catch { return false; }
}

function shellOutput(cmd) {
  try { return execSync(cmd, { stdio: "pipe" }).toString().trim(); } catch { return null; }
}

// ── 1. ICU Runtime (present in stock image) ────────────────────────────────

function checkRuntime() {
  header("ICU Runtime Libraries (bundled in stock image)");

  const libs = [
    "/usr/lib/libicuuc.so.78",
    "/usr/lib/libicui18n.so.78",
    "/usr/lib/libicudata.so.78",
    "/usr/lib/libicuio.so.78",
  ];

  for (const lib of libs) {
    if (exists(lib)) {
      pass(`Found ${path.basename(lib)}`);
    } else {
      fail(`Missing ${path.basename(lib)}`);
    }
  }

  const locales = ["en", "ja", "de", "ar", "zh", "fr", "ko", "th", "sv"];
  const supported = Intl.DateTimeFormat.supportedLocalesOf(locales, {
    localeMatcher: "lookup",
  });
  if (supported.length === locales.length) {
    pass(`Intl locale support: ${supported.length}/${locales.length} locales`);
  } else {
    fail(`Intl locale support: only ${supported.length}/${locales.length}`);
  }
}

// ── 2. ICU Dev Artifacts (missing without icu-dev) ─────────────────────────

function checkDevHeaders() {
  header("ICU Development Headers (/usr/include/unicode/)");

  const headerDir = "/usr/include/unicode";
  if (!exists(headerDir)) {
    fail("Header directory missing: /usr/include/unicode/");
    fail("Cannot compile native addons that depend on ICU");
    return;
  }

  const key_headers = [
    "unistr.h",   // UnicodeString
    "ucnv.h",     // converter API
    "ucol.h",     // collation
    "udat.h",     // date formatting
    "unum.h",     // number formatting
    "utypes.h",   // base types
  ];

  for (const h of key_headers) {
    const full = path.join(headerDir, h);
    if (exists(full)) {
      pass(`Found ${h}`);
    } else {
      fail(`Missing ${h}`);
    }
  }
}

function checkDevLinkerSymlinks() {
  header("ICU Linker Symlinks (libicu*.so)");

  const symlinks = [
    "/usr/lib/libicuuc.so",
    "/usr/lib/libicui18n.so",
    "/usr/lib/libicudata.so",
    "/usr/lib/libicuio.so",
  ];

  for (const s of symlinks) {
    if (exists(s)) {
      pass(`Found ${path.basename(s)}`);
    } else {
      fail(`Missing ${path.basename(s)} — linker cannot find ICU`);
    }
  }
}

function checkPkgConfig() {
  header("pkg-config & icu-config");

  const pcFiles = [
    "/usr/lib/pkgconfig/icu-uc.pc",
    "/usr/lib/pkgconfig/icu-i18n.pc",
    "/usr/lib/pkgconfig/icu-io.pc",
  ];

  for (const pc of pcFiles) {
    if (exists(pc)) {
      pass(`Found ${path.basename(pc)}`);
    } else {
      fail(`Missing ${path.basename(pc)}`);
    }
  }

  if (shellOk("icu-config --version")) {
    const ver = shellOutput("icu-config --version");
    pass(`icu-config works (ICU ${ver})`);
  } else {
    fail("icu-config not available");
  }

  if (shellOk("which pkg-config")) {
    if (shellOk("pkg-config --cflags icu-uc")) {
      const flags = shellOutput("pkg-config --cflags icu-uc");
      pass(`pkg-config icu-uc: ${flags}`);
    } else {
      fail("pkg-config cannot locate icu-uc");
    }
  } else {
    pass("pkg-config not installed (optional — icu-config and .pc files are present)");
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

console.log("\n🔍 Chainguard Custom Assembly — ICU Dev Package Probe");
console.log("   Checking what's present and what's missing\n");

checkRuntime();
checkDevHeaders();
checkDevLinkerSymlinks();
checkPkgConfig();

header("Summary");
console.log(`  Passed: ${totalPass}   Failed: ${totalFail}`);
console.log();

if (totalFail === 0) {
  console.log("  🎉 All checks passed — icu-dev is fully installed!");
  console.log("     Native addons can compile against ICU.\n");
  process.exit(0);
} else {
  console.log("  ⚠️  Some dev artifacts are missing.");
  console.log("     The ICU runtime works, but native addons that need to");
  console.log("     compile against ICU headers/libraries will fail.");
  console.log();
  console.log("  ➡  Use Chainguard Custom Assembly to add the icu-dev package.\n");
  process.exit(1);
}
