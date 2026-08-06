/* ==========================================================================
   vw-gui :: format inference and field validation
   --------------------------------------------------------------------------
   This is convenience validation, not security. It catches typos and reminds
   you how a parameter wants to be written. The vw CLI does the real checking,
   so nothing here should ever be stricter than the script itself.

   Two severities:
     error — clearly wrong (a port of 900000, a blank required field). Blocks Run.
     warn  — probably wrong (an .mp3 where video is expected). Never blocks.

   Formats are inferred from the parameter name, its declared type and its
   registry description, which is where most of the real intent already lives.
   ========================================================================== */

(function () {
  const t = (k, v) => (window.i18n ? i18n.t(k, v) : k);

  /* ---- Primitives ------------------------------------------------------- */

  // Absolute on either platform: C:\x, C:/x, \\server\share, /mnt/x, ~/x
  const ABSOLUTE_RE = /^([A-Za-z]:[\\/]|\\\\|\/|~[\\/]?)/;

  // Characters Windows genuinely forbids in a path. * and ? are allowed
  // because several commands take globs.
  const BAD_PATH_CHARS = /[<>"|\x00-\x1f]/;

  const TIMESTAMP_RE = /^(\d+(\.\d+)?|(\d{1,2}:)?\d{1,2}:\d{1,2}(\.\d+)?)$/;
  const LANG_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
  const EXT_RE = /^\.?[A-Za-z0-9]{1,8}$/;
  const URL_RE = /^(https?|rtmps?|rtsp|srt|udp|hls):\/\/\S+$/i;
  const DOCKER_RE = /^[a-z0-9]+([._-][a-z0-9]+)*\/[a-z0-9]+([._-][a-z0-9]+)*$/i;
  const KV_RE = /^\s*[\w.-]+\s*[:=]\s*[^;,]*(\s*[;,]\s*[\w.-]+\s*[:=]\s*[^;,]*)*\s*$/;

  function isAbsolutePath(v) {
    return ABSOLUTE_RE.test(String(v || "").trim());
  }

  /**
   * Join a relative path onto the working directory. Absolute paths pass
   * through untouched. This is applied when parameters are collected, not
   * displayed, so the field keeps showing what was typed.
   */
  function resolveAgainstCwd(value, cwd) {
    const v = String(value || "").trim();
    if (!v || !cwd) return v;
    if (isAbsolutePath(v)) return v;

    const windows = /\\/.test(cwd) || /^[A-Za-z]:/.test(cwd);
    const sep = windows ? "\\" : "/";
    const tail = v.replace(/^[.][\\/]/, "");
    // Normalise the joined tail so the result does not end up with mixed
    // separators like C:\a\b\sub/file.mp4.
    const normalised = windows ? tail.replace(/\//g, "\\") : tail.replace(/\\/g, "/");
    return cwd.replace(/[\\/]+$/, "") + sep + normalised;
  }

  /* ---- Format catalogue ------------------------------------------------- */

  const FORMATS = {
    path: {
      id: "path",
      hintKey: "fmt.path",
      attrs: { spellcheck: "false", autocapitalize: "off", autocomplete: "off" },
      check(v) {
        if (BAD_PATH_CHARS.test(v)) return { level: "error", key: "fmt.pathBadChars" };
        return null;
      },
    },

    timestamp: {
      id: "timestamp",
      hintKey: "fmt.timestamp",
      attrs: { placeholder: "00:01:30 or 90", inputmode: "numeric", spellcheck: "false" },
      check(v) {
        if (!TIMESTAMP_RE.test(v)) return { level: "error", key: "fmt.timestampBad" };
        return null;
      },
    },

    lang: {
      id: "lang",
      hintKey: "fmt.lang",
      attrs: { placeholder: "fr", maxlength: "12", spellcheck: "false" },
      check(v) {
        if (!LANG_RE.test(v)) return { level: "warn", key: "fmt.langBad" };
        return null;
      },
    },

    extension: {
      id: "extension",
      hintKey: "fmt.extension",
      attrs: { placeholder: ".mp4", maxlength: "9", spellcheck: "false" },
      check(v) {
        if (!EXT_RE.test(v)) return { level: "error", key: "fmt.extensionBad" };
        return null;
      },
    },

    url: {
      id: "url",
      hintKey: "fmt.url",
      attrs: { placeholder: "https://…", spellcheck: "false", inputmode: "url" },
      check(v) {
        if (!URL_RE.test(v)) return { level: "error", key: "fmt.urlBad" };
        return null;
      },
    },

    port: {
      id: "port",
      hintKey: "fmt.port",
      attrs: { type: "number", min: "1", max: "65535", step: "1", inputmode: "numeric" },
      check(v) {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > 65535) {
          return { level: "error", key: "fmt.portBad" };
        }
        return null;
      },
    },

    keyvalue: {
      id: "keyvalue",
      hintKey: "fmt.keyvalue",
      attrs: { placeholder: "key: value, key2: value2", spellcheck: "false" },
      check(v) {
        if (!KV_RE.test(v)) return { level: "warn", key: "fmt.keyvalueBad" };
        return null;
      },
    },

    csv: {
      id: "csv",
      hintKey: "fmt.csv",
      attrs: { placeholder: "one, two, three", spellcheck: "false" },
      check: () => null,
    },

    dockerRepo: {
      id: "dockerRepo",
      hintKey: "fmt.dockerRepo",
      attrs: { placeholder: "user/image", spellcheck: "false" },
      check(v) {
        if (!DOCKER_RE.test(v)) return { level: "warn", key: "fmt.dockerRepoBad" };
        return null;
      },
    },

    /* Feeds ffmpeg's volume filter (volume=$BgVolume), so it takes either a
       dB expression or a linear multiplier. */
    ffVolume: {
      id: "ffVolume",
      hintKey: "fmt.ffVolume",
      attrs: { placeholder: "-20dB", spellcheck: "false" },
      check(v) {
        if (!/^-?\d+(\.\d+)?(dB)?$/i.test(v)) return { level: "error", key: "fmt.ffVolumeBad" };
        return null;
      },
    },

    free: { id: "free", hintKey: null, attrs: {}, check: () => null },
  };

  /** Numeric format built on the fly so each param keeps its own range. */
  function numberFormat({ integer, min, max, step }) {
    return {
      id: integer ? "integer" : "number",
      hintKey: null,
      attrs: {
        type: "number",
        inputmode: integer ? "numeric" : "decimal",
        step: step != null ? String(step) : integer ? "1" : "any",
        ...(min != null ? { min: String(min) } : {}),
        ...(max != null ? { max: String(max) } : {}),
      },
      check(v) {
        const n = Number(v);
        if (Number.isNaN(n)) return { level: "error", key: "fmt.numberBad" };
        if (integer && !Number.isInteger(n)) return { level: "error", key: "fmt.integerBad" };
        if (min != null && n < min) return { level: "error", key: "fmt.min", vars: { min } };
        if (max != null && n > max) return { level: "error", key: "fmt.max", vars: { max } };
        return null;
      },
    };
  }

  /* ---- Inference -------------------------------------------------------- */

  /** Pull a numeric range out of a description like "(0.1-1.0)" or "1.0-2.5". */
  function rangeFromDescription(desc) {
    const m = String(desc || "").match(/\(?(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)\)?/);
    if (!m) return null;
    const min = parseFloat(m[1]);
    const max = parseFloat(m[2]);
    if (Number.isNaN(min) || Number.isNaN(max) || max <= min) return null;
    return { min, max };
  }

  /**
   * Decide how a parameter should be typed, validated and hinted.
   * Order matters: the most specific signal wins.
   */
  function inferFormat(param, command) {
    const name = String(param.Name || "");
    const n = name.toLowerCase();
    const type = String(param.Type || "string").toLowerCase();
    const desc = String(param.Description || "");
    const d = desc.toLowerCase();

    // An explicit "path" type from the command editor beats every heuristic:
    // it exists precisely for path parameters whose name does not look like one.
    if (type === "path") return FORMATS.path;

    // A ValidateSet is already a closed list; the select widget enforces it.
    if (param.ValidSet && param.ValidSet.length) return FORMATS.free;

    if (type === "switch" || type === "bool") return FORMATS.free;

    // Explicit signals from the description first.
    if (/timestamp|hh:mm:ss/.test(d)) return FORMATS.timestamp;
    if (/stream url|rtmp|https? url/.test(d) || /url$/.test(n)) return FORMATS.url;
    if (/json string/.test(d)) return FORMATS.keyvalue;
    if (/comma-separated/.test(d) && type === "string") return FORMATS.csv;
    if (/docker hub repo/.test(d)) return FORMATS.dockerRepo;

    if (/volume/.test(n) && type === "string") return FORMATS.ffVolume;
    if (/^(metrics|flags)$/.test(n)) return FORMATS.keyvalue;
    if (/^(starttime|stoptime|duration)$/.test(n)) return FORMATS.timestamp;
    if (/port$/.test(n)) return FORMATS.port;

    if (/^(lang|language|translateto)$/.test(n) || /language code|target language/.test(d)) {
      return FORMATS.lang;
    }

    if (/^(extension|targetextension)$/.test(n) || (type === "string[]" && /extension/.test(n))) {
      return FORMATS.extension;
    }

    if (type === "int" || type === "double") {
      const range = rangeFromDescription(desc);
      return numberFormat({
        integer: type === "int",
        min: range ? range.min : /volume|opacity|threshold|scale|width/.test(n) ? 0 : null,
        max: range ? range.max : null,
      });
    }

    // Path-ish names, but never the ones that are really a list of names.
    if (U.isPathParam(name) && type !== "string[]") return FORMATS.path;

    return FORMATS.free;
  }

  /* ---- Field validation ------------------------------------------------- */

  /**
   * Validate one value. Returns null when fine, otherwise
   * { level: "error"|"warn", message }.
   */
  function validateValue(value, param, command, format) {
    const fmt = format || inferFormat(param, command);
    const raw = Array.isArray(value) ? value : String(value == null ? "" : value);

    // Empty is only an error when the parameter is mandatory.
    const empty = Array.isArray(raw) ? raw.length === 0 : raw.trim() === "";
    if (empty) {
      return param.Mandatory
        ? { level: "error", message: t("validate.required") }
        : null;
    }

    const values = Array.isArray(raw) ? raw : [raw.trim()];

    for (const v of values) {
      const failed = fmt.check ? fmt.check(v) : null;
      if (failed) {
        return {
          level: failed.level,
          message: t(failed.key, failed.vars || {}),
        };
      }

      // Extension plausibility is always a soft warning.
      if (fmt.id === "path" && window.EXT) {
        const warn = EXT.warnFor(v, param.Name, command);
        if (warn) return { level: "warn", message: warn };
      }
    }

    return null;
  }

  window.validate = {
    inferFormat,
    validateValue,
    resolveAgainstCwd,
    isAbsolutePath,
    FORMATS,
  };
})();
