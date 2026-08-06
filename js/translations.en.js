/* ==========================================================================
   vw-gui :: English copy
   Every user-facing string lives here. Adding QC later means adding a sibling
   translations.qc.js with the same keys — no markup changes required.
   ========================================================================== */

window.VWG_STRINGS_EN = {
  "app.subtitle": "command runner",

  "rail.filterPlaceholder": "Filter commands…",
  "rail.newCommand": "Add command",
  "rail.history": "History",
  "rail.noMatches": "No commands match that filter.",
  "rail.commandCount": "{n} commands",

  "jobs.title": "Background",
  "jobs.watching": "watching",
  "jobs.stop": "Stop this job",

  "empty.title": "No command selected",
  "empty.body": "Pick a command from the rail to build its parameters and run it.",

  "cmd.destructive": "destructive",
  "cmd.missing": "script missing",
  "cmd.edit": "Edit this command",
  "cmd.more": "More actions",

  "ctx.openEditor": "Open in editor",
  "ctx.showInFolder": "Show in File Explorer",
  "ctx.copyPath": "Copy as path",
  "ctx.edit": "Edit command",
  "ctx.delete": "Delete command",

  "targetdir.label": "Working directory",
  "targetdir.placeholder": "Choose the folder to run in…",
  "targetdir.browse": "Browse",
  "targetdir.hint":
    "The command runs here, exactly as if you had opened a shell in this folder.",
  "targetdir.required": "Pick a working directory before running.",

  "params.title": "Parameters",
  "params.none": "This command takes no registered parameters.",
  "params.required": "required",
  "params.usesCwd": "uses the working directory above",
  "params.tagHint": "Type and press Enter",

  "examples.title": "Examples",

  "run.run": "Run",
  "run.stop": "Stop",
  "run.background": "Run in background",
  "run.busy": "Running…",
  "run.queuedBackground": "Sent to background",
  "run.done": "Exit 0",
  "run.failed": "Exit {code}",
  "run.stopped": "Stopped",
  "run.missingRequired": "Check these parameters first: {names}",
  "run.alreadyRunning":
    "A command is already running. Stop it, or tick “Run in background”.",
  "run.scriptMissing": "This command's script file does not exist on disk.",

  "console.title": "Output",
  "console.live": "live pwsh",
  "console.copy": "Copy output",
  "console.clear": "Clear output",
  "console.copied": "Output copied to clipboard.",

  "validate.extWarning": "‘.{ext}’ is unusual here — expected {list}…",
  "validate.required": "Required.",
  "validate.blocked": "Fix the highlighted parameters first.",

  "fmt.path": "Windows or Unix path. Relative paths resolve against the working directory.",
  "fmt.pathBadChars": "A path cannot contain < > \" or |.",
  "fmt.timestamp": "HH:mm:ss or plain seconds.",
  "fmt.timestampBad": "Use HH:mm:ss, mm:ss, or a number of seconds.",
  "fmt.lang": "Language code, e.g. fr, qc, es, ja.",
  "fmt.langBad": "Doesn’t look like a language code (fr, es, pt-BR…).",
  "fmt.extension": "File extension, with or without the dot.",
  "fmt.extensionBad": "Use a bare extension like .mp4 or mkv.",
  "fmt.url": "Stream URL — https, rtmp, rtsp or srt.",
  "fmt.urlBad": "Needs a scheme, e.g. https:// or rtmp://.",
  "fmt.port": "TCP port, 1–65535.",
  "fmt.portBad": "Port must be a whole number from 1 to 65535.",
  "fmt.keyvalue": "key: value pairs, comma separated.",
  "fmt.keyvalueBad": "Expected key: value pairs, e.g. files: 12, retries: 2.",
  "fmt.csv": "Comma-separated list.",
  "fmt.dockerRepo": "Docker Hub path, e.g. user/image.",
  "fmt.dockerRepoBad": "Expected user/image.",
  "fmt.numberBad": "Must be a number.",
  "fmt.integerBad": "Must be a whole number.",
  "fmt.min": "Must be at least {min}.",
  "fmt.max": "Must be at most {max}.",

  "field.browseFolder": "Choose folder",
  "field.browseFile": "Choose file",
  "field.clickToBrowse": "Click to browse…",

  "destructive.title": "Destructive command",
  "destructive.warn":
    "<strong>{name}</strong> is marked destructive. It can delete or overwrite data that is not recoverable from this app.",
  "destructive.typeToConfirm": "Type <strong>{name}</strong> to confirm",
  "destructive.confirm": "Run it",
  "destructive.needAdmin":
    "Destructive commands require Administrator privileges. Relaunch vw-gui as Administrator.",
  "destructive.agentBlocked":
    "An AI-agent environment variable is set ({flags}). Destructive commands are blocked by policy.",

  "editor.titleNew": "Add command",
  "editor.titleEdit": "Edit command",
  "editor.script": "PowerShell script",
  "editor.pickScript": "Choose .ps1",
  "editor.name": "Command name",
  "editor.namePlaceholder": "kebab-case, e.g. trim-video",
  "editor.description": "Description",
  "editor.category": "Category",
  "editor.categoryNew": "＋ New category…",
  "editor.categoryPlaceholder": "New category name",
  "editor.destructive": "Mark as destructive",
  "editor.examples": "Examples (one per line)",
  "editor.params": "Parameters",
  "editor.paramsDetected": "{n} detected from the script's param() block",
  "editor.paramName": "Name",
  "editor.paramType": "Type",
  "editor.paramReq": "Req",
  "editor.paramDesc": "Description",
  "editor.addParam": "Add parameter",
  "editor.save": "Save",
  "editor.cancel": "Cancel",
  "editor.reparse": "Re-scan script",
  "editor.savedNew": "Added “{name}” to the registry.",
  "editor.savedEdit": "Updated “{name}”.",
  "editor.needScript": "Choose a .ps1 file first.",
  "editor.needName": "Give the command a name.",
  "editor.nameTaken": "“{name}” already exists in the registry.",
  "editor.nameInvalid": "Use letters, digits and dashes only.",
  "editor.needCategory": "Choose or name a category.",
  "editor.parseFailed": "Could not read the script's parameters: {err}",
  "editor.parseErrors": "The script has syntax errors: {errs}",
  "editor.imported": "Copied into the CLI folder.",
  "editor.overwritePrompt":
    "A script named {name} already exists in the CLI folder. Overwrite it?",

  "delete.title": "Delete command",
  "delete.warn":
    "This removes <strong>{name}</strong> from the registry <em>and deletes</em> its script file:",
  "delete.irreversible":
    "The registry is backed up first. The script file is not — it is gone from disk.",
  "delete.confirm": "Delete",
  "delete.wait": "Wait…",
  "delete.done": "Deleted “{name}”.",

  "history.title": "Run history",
  "history.empty": "No runs recorded yet.",
  "history.clear": "Clear history",
  "history.cleared": "History cleared.",
  "history.reuse": "Load these parameters",
  "history.close": "Close",

  "rail.settings": "Settings",

  "settings.trayGroup": "System tray",
  "settings.trayEnabled": "Show a tray icon",
  "settings.trayEnabledHint": "Puts vw-gui in the notification area, with running job count.",
  "settings.trayMinimize": "Minimise to tray",
  "settings.trayMinimizeHint":
    "Closing and minimising hide the window instead of quitting, so background jobs keep running. Quit from the tray menu.",

  "settings.defaultsGroup": "Default values",
  "settings.defaultsNone": "None",
  "settings.defaultsNoneHint": "Every field starts empty.",
  "settings.defaultsLastDir": "Remember last directory",
  "settings.defaultsLastDirHint": "Restores the working directory per command. Parameters start empty.",
  "settings.defaultsAll": "Remember all",
  "settings.defaultsAllHint": "Restores the working directory and every parameter, per command.",
  "settings.forget": "Forget remembered values ({n})",
  "settings.forgot": "Remembered values cleared.",
  "settings.reorder": "Reorder categories",

  "reorder.hint": "Drag categories to reorder",
  "reorder.done": "Done",
  "reorder.saved": "Category order saved.",

  "common.close": "Close",
  "common.cancel": "Cancel",
  "common.copied": "Copied.",
  "common.error": "Something went wrong: {err}",
  "common.loadFailed": "Could not read the command registry: {err}",
};
