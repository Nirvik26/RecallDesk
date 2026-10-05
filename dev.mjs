import { spawn, execSync } from "node:child_process";
import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isWin = process.platform === "win32";

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  red: "\x1b[31m",
};

const args = process.argv.slice(2);
const backendOnly = args.includes("--backend-only");
const frontendOnly = args.includes("--frontend-only");

const backendDir = path.join(__dirname, "backend");
const frontendDir = path.join(__dirname, "frontend");

function findPython() {
  const candidates = isWin
    ? [
        path.join(backendDir, "venv", "Scripts", "python.exe"),
        path.join(backendDir, ".venv", "Scripts", "python.exe"),
      ]
    : [
        path.join(backendDir, "venv", "bin", "python"),
        path.join(backendDir, ".venv", "bin", "python"),
      ];

  if (process.env.VIRTUAL_ENV) {
    candidates.unshift(
      isWin
        ? path.join(process.env.VIRTUAL_ENV, "Scripts", "python.exe")
        : path.join(process.env.VIRTUAL_ENV, "bin", "python")
    );
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return isWin ? "python" : "python3";
}

function findBun() {
  if (process.versions?.bun) {
    return process.execPath;
  }
  return "bun";
}

function attachPrefix(stream, prefix, color) {
  if (!stream) return;
  const rl = readline.createInterface({ input: stream });
  rl.on("line", (line) => {
    console.log(`${color}${prefix}${colors.reset} ${line}`);
  });
}

function killProcessTree(proc) {
  if (!proc || !proc.pid) return;
  const pid = proc.pid;
  if (isWin) {
    try {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
    } catch {
      try {
        proc.kill();
      } catch {}
    }
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        proc.kill("SIGTERM");
      } catch {}
    }
  }
}

let backendProc = null;
let frontendProc = null;
let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${colors.yellow}[dev] Stopping servers...${colors.reset}`);
  killProcessTree(backendProc);
  killProcessTree(frontendProc);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", () => {
  killProcessTree(backendProc);
  killProcessTree(frontendProc);
});

console.log(`${colors.bold}${colors.green}=== RecallDesk Development Environment ===${colors.reset}`);

// Check backend environment file
if (!frontendOnly) {
  const backendEnv = path.join(backendDir, ".env");
  if (!fs.existsSync(backendEnv)) {
    console.log(
      `${colors.yellow}[dev:notice] backend/.env not found. Using defaults. (Copy backend/.env.example if needed for MongoDB & Gemini API)${colors.reset}`
    );
  }
}

if (!frontendOnly) {
  const pythonPath = findPython();
  console.log(`${colors.cyan}[dev] Starting backend using:${colors.reset} ${pythonPath}`);

  backendProc = spawn(pythonPath, ["-u", "manage.py", "runserver", "127.0.0.1:8000"], {
    cwd: backendDir,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      PYTHONIOENCODING: "utf-8",
      FORCE_COLOR: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  attachPrefix(backendProc.stdout, "[backend]", colors.cyan);
  attachPrefix(backendProc.stderr, "[backend]", colors.cyan);

  backendProc.on("error", (err) => {
    console.error(`${colors.red}[backend:error] Failed to start backend: ${err.message}${colors.reset}`);
  });

  backendProc.on("exit", (code, signal) => {
    if (!shuttingDown) {
      console.log(`${colors.red}[backend] Exited with code ${code ?? signal}${colors.reset}`);
      if (code !== 0 && !frontendOnly) {
        shutdown();
      }
    }
  });
}

if (!backendOnly) {
  const bunPath = findBun();
  console.log(`${colors.magenta}[dev] Starting frontend using:${colors.reset} ${bunPath}`);

  frontendProc = spawn(bunPath, ["run", "dev"], {
    cwd: frontendDir,
    env: {
      ...process.env,
      FORCE_COLOR: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  attachPrefix(frontendProc.stdout, "[frontend]", colors.magenta);
  attachPrefix(frontendProc.stderr, "[frontend]", colors.magenta);

  frontendProc.on("error", (err) => {
    console.error(`${colors.red}[frontend:error] Failed to start frontend: ${err.message}${colors.reset}`);
  });

  frontendProc.on("exit", (code, signal) => {
    if (!shuttingDown) {
      console.log(`${colors.red}[frontend] Exited with code ${code ?? signal}${colors.reset}`);
      if (code !== 0 && !backendOnly) {
        shutdown();
      }
    }
  });
}

console.log(`${colors.dim}Backend:  http://127.0.0.1:8000${colors.reset}`);
console.log(`${colors.dim}Frontend: http://localhost:3000${colors.reset}`);
console.log(`${colors.dim}Press Ctrl+C to stop both.${colors.reset}\n`);
