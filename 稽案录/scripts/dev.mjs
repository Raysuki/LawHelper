import { spawn } from "node:child_process";

const commands = [
  ["api", "node", ["server.js"]],
  ["vite", "vite", ["--port=3000", "--host=0.0.0.0"]]
];

const children = commands.map(([name, command, args]) => {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env }
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`${name} exited with code ${code}`);
      process.exitCode = code;
    }
  });

  return child;
});

function shutdown() {
  for (const child of children) {
    child.kill();
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
