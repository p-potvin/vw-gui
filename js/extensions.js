/* ==========================================================================
   vw-gui :: file-type hints
   --------------------------------------------------------------------------
   Drives two things:
     1. The filters offered by the native file picker.
     2. Soft validation — a warning, never a block. The vw CLI does the real
        checking; this only catches inattention.

   Note: .ts is deliberately absent from VIDEO. It is a legitimate MPEG
   transport stream extension, but in this workspace it collides with
   TypeScript and caused more friction than it prevented.
   ========================================================================== */

(function () {
  const VIDEO = [
    "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v",
    "mpg", "mpeg", "m2ts", "mts", "vob", "ogv", "3gp", "divx",
  ];

  const IMAGE = [
    "jpg", "jpeg", "png", "gif", "bmp", "webp", "tif", "tiff",
    "avif", "heic", "heif", "svg", "ico",
  ];

  const AUDIO = ["mp3", "wav", "flac", "aac", "ogg", "opus", "m4a", "wma", "aiff"];

  const ARCHIVE = ["zip", "rar", "7z", "tar", "gz", "bz2", "xz"];

  const SUBTITLE = ["srt", "vtt", "ass", "ssa", "sub"];

  const SCRIPT = ["ps1"];

  const DATA = ["json", "csv", "txt", "md", "yml", "yaml", "xml"];

  /**
   * Guess the accepted extensions for a parameter, using the command it
   * belongs to as context. Order matters — first match wins.
   */
  function forParam(paramName, command) {
    const p = String(paramName || "").toLowerCase();
    const cmd = String((command && command.Name) || "").toLowerCase();
    const cat = String((command && command.Category) || "").toLowerCase();
    const desc = String((command && command.Description) || "").toLowerCase();
    const haystack = `${cmd} ${cat} ${desc}`;

    if (/\.ps1|script/.test(p)) return SCRIPT;
    if (/subtitle|srt|caption/.test(p) || /subtitle/.test(haystack)) return SUBTITLE;
    if (/archive|zip/.test(p) || /archive|unzip|7-zip|czkawka/.test(haystack)) return ARCHIVE;

    if (/audio|track/.test(p) || /audio|normaliz|transcri|asr|whisper/.test(haystack)) {
      return AUDIO;
    }

    if (/image|picture|photo|thumb/.test(p) || /image|picture|photo|thumbnail|magick|esrgan|realesrgan/.test(haystack)) {
      return IMAGE;
    }

    if (/video|clip|movie/.test(p) || /video|ffmpeg|trim|convert|upscale|vsr|preview|trickplay/.test(haystack)) {
      return VIDEO;
    }

    if (/json|metric|state/.test(p)) return DATA;

    return null; // unknown -> no filter, no warning
  }

  /** Native-dialog filter list for a parameter. */
  function filtersFor(paramName, command) {
    const exts = forParam(paramName, command);
    if (!exts) return [{ name: "All files", extensions: ["*"] }];

    const label =
      exts === VIDEO ? "Video" :
      exts === IMAGE ? "Images" :
      exts === AUDIO ? "Audio" :
      exts === ARCHIVE ? "Archives" :
      exts === SUBTITLE ? "Subtitles" :
      exts === SCRIPT ? "PowerShell" : "Data";

    return [
      { name: label, extensions: exts },
      { name: "All files", extensions: ["*"] },
    ];
  }

  /**
   * Soft check. Returns a warning string, or null when fine.
   * A value with no extension (a folder, a glob) never warns.
   */
  function warnFor(value, paramName, command) {
    const v = String(value || "").trim();
    if (!v) return null;

    const exts = forParam(paramName, command);
    if (!exts) return null;

    const match = v.match(/\.([A-Za-z0-9]+)$/);
    if (!match) return null;

    const ext = match[1].toLowerCase();
    if (exts.includes(ext)) return null;

    return i18n.t("validate.extWarning", { ext, list: exts.slice(0, 6).join(", ") });
  }

  window.EXT = { VIDEO, IMAGE, AUDIO, ARCHIVE, SUBTITLE, SCRIPT, DATA, forParam, filtersFor, warnFor };
})();
