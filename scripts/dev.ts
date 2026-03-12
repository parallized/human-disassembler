import { spawn } from "bun";
import { join } from "node:path";

const port = process.env.PORT ?? "3333";
const reactRouterBin = join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "react-router.exe" : "react-router"
);

const child = spawn([
  reactRouterBin,
  "dev",
  "--host",
  "0.0.0.0",
  "--port",
  port,
], {
  stdio: ["inherit", "inherit", "inherit"],
  env: process.env
});

const terminate = () => child.kill();
process.on("SIGINT", terminate);
process.on("SIGTERM", terminate);

const code = await child.exited;
process.exit(code);
