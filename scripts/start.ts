import { spawn } from "bun";
import { join } from "node:path";

const port = process.env.PORT ?? "3333";
const reactRouterServeBin = join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "react-router-serve.exe" : "react-router-serve"
);

const child = spawn([
  reactRouterServeBin,
  "./build/server/index.js"
], {
  stdio: ["inherit", "inherit", "inherit"],
  env: {
    ...process.env,
    PORT: port,
  }
});

const terminate = () => child.kill();
process.on("SIGINT", terminate);
process.on("SIGTERM", terminate);

const code = await child.exited;
process.exit(code);
