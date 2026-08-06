/* ==========================================================================
   vw-gui :: Electron main process
   --------------------------------------------------------------------------
   Owns everything the renderer is not allowed to touch: the filesystem, the
   PowerShell child processes, and the vw-commands.ps1 registry.
   ========================================================================== */

const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const pty = require("node-pty");

// --- Configuration ---------------------------------------------------------

// The live CLI source. The copy under Desktop\pwsh\VaultWares CLI is a stale
// install target and is deliberately NOT driven by this GUI.
const VW_ROOT = path.join(os.homedir(), "Desktop", "vw-cli");
const REGISTRY_PATH = path.join(VW_ROOT, "vw-commands.ps1");

const SCRIPTS_DIR = path.join(__dirname, "scripts");
const READ_REGISTRY = path.join(SCRIPTS_DIR, "vwg-read-registry.ps1");
const WRITE_REGISTRY = path.join(SCRIPTS_DIR, "vwg-write-registry.ps1");
const PARSE_PARAMS = path.join(SCRIPTS_DIR, "vwg-parse-params.ps1");
const RUNNER = path.join(SCRIPTS_DIR, "vwg-run.ps1");

const STORE_DIR = path.join(app.getPath("userData"), "store");
const HISTORY_FILE = path.join(STORE_DIR, "history.json");
const PREFS_FILE = path.join(STORE_DIR, "prefs.json");
const HISTORY_LIMIT = 300;

let mainWindow = null;
let tray = null;
let quitting = false;

// Mirrors the renderer's tray preferences so window events can consult them
// without a round trip.
let trayPrefs = { enabled: false, minimizeToTray: false };

// --- PowerShell helpers ----------------------------------------------------

function pwshArgs(scriptPath, extra = []) {
  return ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath, ...extra];
}

/** Run a helper script to completion and return its stdout. */
function pwshCapture(scriptPath, extra = [], cwd = VW_ROOT) {
  return new Promise((resolve, reject) => {
    const child = spawn("pwsh", pwshArgs(scriptPath, extra), {
      cwd,
      windowsHide: true,
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || stdout.trim() || `pwsh exited with code ${code}`));
    });
  });
}

function toB64(obj) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
}

// --- Local store -----------------------------------------------------------

async function ensureStore() {
  await fsp.mkdir(STORE_DIR, { recursive: true });
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fsp.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await ensureStore();
  await fsp.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

// --- Running jobs ----------------------------------------------------------

/**
 * Terminal sessions. Every command runs inside a real pwsh PTY, so anything
 * that prompts -- Read-Host, credential requests, ffmpeg's overwrite question,
 * a Ctrl+C -- behaves exactly as it does in a terminal.
 *
 * The foreground session is persistent and serial. Each background job gets
 * its own session so a long pipeline never blocks the next quick command.
 */
const sessions = new Map();
let sessionCounter = 0;

// A run in progress, keyed by session id -> job metadata awaiting its sentinel.
const activeRuns = new Map();

const SENTINEL = /<<VWG:EXIT:([A-Za-z0-9-]+):(-?\d+)>>\r?\n?/;

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

/** Quote a value for a PowerShell single-quoted string literal. */
function psQuote(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function createSession({ id, cwd, cols, rows }) {
  const term = pty.spawn("pwsh.exe", ["-NoLogo", "-NoProfile"], {
    name: "xterm-256color",
    cols: cols || 120,
    rows: rows || 30,
    cwd: cwd || VW_ROOT,
    env: { ...process.env },
    useConpty: true,
  });

  const session = {
    id,
    term,
    cwd: cwd || VW_ROOT,
    buffer: "",
    alive: true,
  };
  sessions.set(id, session);

  term.onData((data) => {
    let text = data;

    // Pull the completion sentinel out of the stream before it reaches the
    // terminal, so the user never sees the marker.
    const match = text.match(SENTINEL);
    if (match) {
      text = text.replace(SENTINEL, "");
      finishRun(id, match[1], parseInt(match[2], 10));
    }

    if (text) {
      session.buffer += text;
      if (session.buffer.length > 600000) {
        session.buffer = session.buffer.slice(-450000);
      }
      send("pty:data", { id, data: text });
    }
  });

  term.onExit(({ exitCode }) => {
    session.alive = false;
    // If the shell itself died mid-run, close out the job.
    const run = activeRuns.get(id);
    if (run) finishRun(id, run.jobId, exitCode == null ? 1 : exitCode);
    send("pty:closed", { id, exitCode });
  });

  return session;
}

function finishRun(sessionId, jobId, exitCode) {
  const run = activeRuns.get(sessionId);
  if (!run || run.jobId !== jobId) return;
  activeRuns.delete(sessionId);

  run.exitCode = exitCode;
  run.endedAt = Date.now();

  send("job:exit", {
    id: jobId,
    sessionId,
    exitCode,
    durationMs: run.endedAt - run.startedAt,
  });

  recordHistory(run).catch(() => {});
  refreshTray();
}

/**
 * Type a command into a session. Three statements on one line:
 * change directory, invoke the runner, and let the runner print the sentinel.
 */
function runInSession({ sessionId, scriptPath, params, cwd, commandName }) {
  const session = sessions.get(sessionId);
  if (!session || !session.alive) throw new Error(`Session ${sessionId} is not running`);

  const jobId = `job-${++sessionCounter}`;
  const argsB64 = toB64(params || {});

  activeRuns.set(sessionId, {
    jobId,
    sessionId,
    commandName,
    params: params || {},
    cwd,
    startedAt: Date.now(),
    exitCode: null,
    background: session.background,
  });

  const line =
    `Set-Location -LiteralPath ${psQuote(cwd)}; ` +
    `& ${psQuote(RUNNER)} -ScriptPath ${psQuote(scriptPath)} ` +
    `-ArgsB64 ${psQuote(argsB64)} -JobId ${psQuote(jobId)}\r`;

  session.term.write(line);
  session.cwd = cwd;

  return { jobId, sessionId, startedAt: Date.now() };
}

async function recordHistory(run) {
  const history = await readJson(HISTORY_FILE, []);
  history.unshift({
    id: run.jobId,
    commandName: run.commandName,
    params: run.params,
    cwd: run.cwd,
    background: !!run.background,
    exitCode: run.exitCode,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    durationMs: (run.endedAt || Date.now()) - run.startedAt,
  });
  await writeJson(HISTORY_FILE, history.slice(0, HISTORY_LIMIT));
}

/**
 * Kill a process tree. PowerShell scripts routinely spawn ffmpeg/python
 * grandchildren, so killing only the direct child orphans real work.
 *
 * node-pty's own term.kill() is avoided throughout: on Windows it loads
 * conpty_console_list_agent, which throws "AttachConsole failed" and takes
 * the process down with it.
 */
function killTree(pid) {
  return new Promise((resolve) => {
    const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
    killer.on("close", () => resolve(true));
    killer.on("error", () => resolve(false));
  });
}

/** Kill everything below a pid, leaving the pid itself running. */
function killChildrenOf(pid) {
  return new Promise((resolve) => {
    const script =
      `Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" | ` +
      `ForEach-Object { taskkill /PID $($_.ProcessId) /T /F 2>$null }`;
    const killer = spawn("pwsh", ["-NoProfile", "-NonInteractive", "-Command", script], {
      windowsHide: true,
    });
    killer.on("close", () => resolve(true));
    killer.on("error", () => resolve(false));
  });
}

async function killSession(session) {
  if (!session) return;
  session.alive = false;
  try {
    await killTree(session.term.pid);
  } catch { /* already gone */ }
}

// --- IPC: registry ---------------------------------------------------------

ipcMain.handle("registry:load", async () => {
  const json = await pwshCapture(READ_REGISTRY, ["-RegistryPath", REGISTRY_PATH]);
  return { commands: JSON.parse(json), registryPath: REGISTRY_PATH, vwRoot: VW_ROOT };
});

ipcMain.handle("registry:write", async (_e, { action, name, entry, newName }) => {
  const extra = ["-Action", action, "-RegistryPath", REGISTRY_PATH, "-Name", name];
  if (entry) extra.push("-EntryB64", toB64(entry));
  if (newName) extra.push("-NewName", newName);
  const json = await pwshCapture(WRITE_REGISTRY, extra);
  return JSON.parse(json);
});

ipcMain.handle("script:parseParams", async (_e, { scriptPath }) => {
  const json = await pwshCapture(PARSE_PARAMS, ["-Path", scriptPath]);
  return JSON.parse(json);
});

/** Copy an uploaded .ps1 next to the other command scripts. */
ipcMain.handle("script:import", async (_e, { sourcePath, overwrite }) => {
  const base = path.basename(sourcePath);
  const dest = path.join(VW_ROOT, base);

  if (fs.existsSync(dest) && !overwrite) {
    const sameFile = path.resolve(sourcePath).toLowerCase() === dest.toLowerCase();
    if (!sameFile) return { ok: false, reason: "exists", dest };
  }
  if (path.resolve(sourcePath).toLowerCase() !== dest.toLowerCase()) {
    await fsp.copyFile(sourcePath, dest);
  }
  return { ok: true, dest };
});

ipcMain.handle("script:delete", async (_e, { scriptPath }) => {
  // Guard against deleting outside the CLI root.
  const resolved = path.resolve(scriptPath);
  if (!resolved.toLowerCase().startsWith(path.resolve(VW_ROOT).toLowerCase())) {
    throw new Error(`Refusing to delete outside ${VW_ROOT}: ${resolved}`);
  }
  if (fs.existsSync(resolved)) await fsp.unlink(resolved);
  return { ok: true };
});

// --- IPC: execution --------------------------------------------------------

ipcMain.handle("pty:create", async (_e, { id, cwd, cols, rows, background }) => {
  if (sessions.has(id)) return { ok: true, existing: true };
  const session = createSession({ id, cwd, cols, rows });
  session.background = !!background;
  return { ok: true, pid: session.term.pid };
});

ipcMain.handle("pty:input", async (_e, { id, data }) => {
  const session = sessions.get(id);
  if (!session || !session.alive) return { ok: false };
  session.term.write(data);
  return { ok: true };
});

ipcMain.handle("pty:resize", async (_e, { id, cols, rows }) => {
  const session = sessions.get(id);
  if (!session || !session.alive) return { ok: false };
  try {
    session.term.resize(Math.max(2, cols), Math.max(2, rows));
  } catch { /* a dying pty can reject resize; harmless */ }
  return { ok: true };
});

ipcMain.handle("pty:buffer", async (_e, { id }) => {
  const session = sessions.get(id);
  return { buffer: session ? session.buffer : "" };
});

ipcMain.handle("pty:dispose", async (_e, { id }) => {
  const session = sessions.get(id);
  if (!session) return { ok: false };
  await killSession(session);
  sessions.delete(id);
  return { ok: true };
});

ipcMain.handle("job:start", async (_e, payload) => runInSession(payload));

/**
 * Ctrl+C first: a PowerShell script often cleans up on cancellation, and
 * killing the shell outright would also destroy the session. Only if the run
 * is still active shortly after do we take down the process tree.
 */
ipcMain.handle("job:stop", async (_e, { sessionId }) => {
  const session = sessions.get(sessionId);
  if (!session || !session.alive) return { ok: false };

  session.term.write("\x03");

  await new Promise((r) => setTimeout(r, 1200));
  if (!activeRuns.has(sessionId)) return { ok: true, method: "sigint" };

  // Still running: kill the children but leave the shell itself alive.
  await killChildrenOf(session.term.pid);
  return { ok: true, method: "kill" };
});

/** Administrator check, mirroring vw.ps1's destructive gate. */
ipcMain.handle("system:isAdmin", async () => {
  try {
    const out = await pwshCapture(
      path.join(SCRIPTS_DIR, "vwg-is-admin.ps1"),
      [],
      VW_ROOT
    );
    return out.trim() === "True";
  } catch {
    return false;
  }
});

/** The AI-assistant refusal from the global gating policy, preserved. */
ipcMain.handle("system:agentEnv", async () => {
  const flags = {
    ANTIGRAVITY_AGENT: process.env.ANTIGRAVITY_AGENT === "1",
    AGENT_NAME: !!process.env.AGENT_NAME,
    DEVIN: !!process.env.DEVIN,
  };
  return { blocked: Object.values(flags).some(Boolean), flags };
});

// --- IPC: dialogs and shell ------------------------------------------------

ipcMain.handle("dialog:pickFolder", async (_e, { defaultPath } = {}) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    defaultPath: defaultPath || VW_ROOT,
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle("dialog:pickFile", async (_e, { defaultPath, filters } = {}) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    defaultPath: defaultPath || VW_ROOT,
    filters: filters || [{ name: "All files", extensions: ["*"] }],
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle("shell:openPath", async (_e, { target }) => {
  const err = await shell.openPath(target);
  return { ok: !err, error: err };
});

ipcMain.handle("shell:showInFolder", async (_e, { target }) => {
  shell.showItemInFolder(target);
  return { ok: true };
});

// --- IPC: store ------------------------------------------------------------

ipcMain.handle("history:list", async () => readJson(HISTORY_FILE, []));
ipcMain.handle("history:clear", async () => {
  await writeJson(HISTORY_FILE, []);
  return { ok: true };
});

ipcMain.handle("prefs:get", async () => readJson(PREFS_FILE, {}));
ipcMain.handle("prefs:set", async (_e, prefs) => {
  await writeJson(PREFS_FILE, prefs);
  return { ok: true };
});

// --- Tray ------------------------------------------------------------------

function trayIcon() {
  const file = path.join(__dirname, "build", "tray-32.png");
  const img = nativeImage.createFromPath(file);
  return img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 });
}

function showWindow() {
  if (!mainWindow) return createWindow();
  if (!mainWindow.isVisible()) mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function runningCount() {
  let n = 0;
  for (const s of sessions.values()) if (s.background) n++;
  return activeRuns.size;
}

function buildTrayMenu() {
  const busy = runningCount();
  return Menu.buildFromTemplate([
    { label: busy ? `vw-gui — ${busy} running` : "vw-gui", enabled: false },
    { type: "separator" },
    { label: "Open", click: showWindow },
    {
      label: "Quit",
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
}

function enableTray(on) {
  if (on && !tray) {
    tray = new Tray(trayIcon());
    tray.setToolTip("vw-gui");
    tray.setContextMenu(buildTrayMenu());
    tray.on("click", showWindow);
    tray.on("double-click", showWindow);
  } else if (!on && tray) {
    tray.destroy();
    tray = null;
  }
}

function refreshTray() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

ipcMain.handle("tray:apply", async (_e, prefs) => {
  trayPrefs = {
    enabled: !!(prefs && prefs.enabled),
    // Minimising to tray without a tray icon would strand the window.
    minimizeToTray: !!(prefs && prefs.enabled && prefs.minimizeToTray),
  };
  enableTray(trayPrefs.enabled);
  return { ok: true, ...trayPrefs };
});

// --- Window ----------------------------------------------------------------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#0a0c11",
    show: false,
    titleBarStyle: "hidden",
    titleBarOverlay: false,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile("index.html");
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => (mainWindow = null));

  // With the tray enabled, closing and minimising hide rather than exit, so
  // background jobs keep running. Quit explicitly from the tray menu.
  mainWindow.on("close", (e) => {
    if (!quitting && trayPrefs.enabled && trayPrefs.minimizeToTray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("minimize", (e) => {
    if (trayPrefs.enabled && trayPrefs.minimizeToTray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // Surface renderer failures on the terminal instead of a blank window.
  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    console.error("[renderer gone]", JSON.stringify(details));
  });
  mainWindow.webContents.on("preload-error", (_e, preloadPath, error) => {
    console.error("[preload error]", preloadPath, error && error.message);
  });
  mainWindow.webContents.on("did-fail-load", (_e, code, desc) => {
    console.error("[load failed]", code, desc);
  });
  if (process.argv.includes("--vwg-debug")) {
    mainWindow.webContents.on("console-message", (_e, level, message, line, source) => {
      console.log(`[renderer:${level}] ${source}:${line} ${message}`);
    });
  }

  // QA hook: --vwg-shot <file> [--vwg-shot-delay ms] renders the window's own
  // contents (not the screen) to a PNG and quits. Used for visual checks.
  const shotIdx = process.argv.indexOf("--vwg-shot");
  if (shotIdx !== -1 && process.argv[shotIdx + 1]) {
    const shotPath = process.argv[shotIdx + 1];
    const delayIdx = process.argv.indexOf("--vwg-shot-delay");
    const delay = delayIdx !== -1 ? parseInt(process.argv[delayIdx + 1], 10) || 2500 : 2500;

    mainWindow.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        try {
          const image = await mainWindow.webContents.capturePage();
          await fsp.writeFile(shotPath, image.toPNG());
          console.log("[shot]", shotPath);
        } catch (err) {
          console.error("[shot failed]", err.message);
        }
        app.quit();
      }, delay);
    });
  }
}

// Window chrome controls (frameless shell).
ipcMain.handle("win:minimize", () => mainWindow && mainWindow.minimize());
ipcMain.handle("win:maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle("win:close", () => mainWindow && mainWindow.close());

app.whenReady().then(() => {
  ensureStore().catch(() => {});
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  quitting = true;
});

app.on("window-all-closed", () => {
  // Terminal sessions must not outlive the UI that owns them.
  for (const session of sessions.values()) killSession(session);
  sessions.clear();
  if (tray) {
    tray.destroy();
    tray = null;
  }
  if (process.platform !== "darwin") app.quit();
});
