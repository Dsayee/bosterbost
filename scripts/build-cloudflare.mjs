import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const cwd = process.cwd();
const envPath = resolve(cwd, ".env.local");
const backupPath = resolve(cwd, ".env.local.codex-secret-backup");
let movedEnv = false;

const patchOpenNextWindowsSymlinks = () => {
  if (process.platform !== "win32") return;

  const filePath = resolve(cwd, "node_modules/@opennextjs/cloudflare/dist/cli/build/bundle-server.js");
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  if (content.includes("materializeWindowsPackageSymlinks")) return;

  const marker = `/**
 * Bundle the Open Next server.
 */`;
  const helper = `const materializeWindowsPackageSymlinks = (packageRoot) => {
    if (process.platform !== "win32")
        return;
    const pnpmRoot = path.join(packageRoot, "node_modules", ".pnpm");
    if (!fs.existsSync(pnpmRoot))
        return;
    const packages = ["client-only", "react", "react-dom", "styled-jsx"];
    const sourceForPackage = (packageName) => {
        const packageEntry = fs
            .readdirSync(pnpmRoot, { withFileTypes: true })
            .find((entry) => entry.isDirectory() && entry.name.startsWith(\`\${packageName}@\`));
        if (!packageEntry)
            return null;
        const source = path.join(pnpmRoot, packageEntry.name, "node_modules", packageName);
        return fs.existsSync(source) ? source : null;
    };
    for (const entry of fs.readdirSync(pnpmRoot, { withFileTypes: true })) {
        if (!entry.isDirectory())
            continue;
        const nodeModulesRoot = path.join(pnpmRoot, entry.name, "node_modules");
        if (!fs.existsSync(nodeModulesRoot))
            continue;
        for (const packageName of packages) {
            const candidate = path.join(nodeModulesRoot, packageName);
            let stats;
            try {
                stats = fs.lstatSync(candidate);
            }
            catch {
                const source = sourceForPackage(packageName);
                if (source) {
                    fs.cpSync(source, candidate, { recursive: true, dereference: true });
                }
                continue;
            }
            if (!stats.isSymbolicLink())
                continue;
            const target = path.resolve(path.dirname(candidate), fs.readlinkSync(candidate));
            fs.rmSync(candidate, { recursive: true, force: true });
            fs.cpSync(target, candidate, { recursive: true, dereference: true });
        }
    }
};
`;

  let nextContent = content.replace(marker, `${helper}${marker}`);
  nextContent = nextContent.replace(
    "const openNextServer = path.join(outputPath, packagePath, `index.mjs`);",
    "materializeWindowsPackageSymlinks(path.join(outputPath, packagePath));\n    const openNextServer = path.join(outputPath, packagePath, `index.mjs`);"
  );
  writeFileSync(filePath, nextContent);
};

const run = (command, args, env) => {
  const result = spawnSync(command, args, {
    cwd,
    env,
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    throw new Error(`${command} ${args.join(" ")} failed.`);
  }
};

const removeLegacyStaticAssets = () => {
  const legacyAssets = [
    "admin.html",
    "app-core.js",
    "dashboard.css",
    "dashboard.html",
    "dashboard.js",
    "index.html",
    "script.js",
    "styles.css",
  ];
  const assetsRoot = resolve(cwd, ".open-next", "assets");

  for (const asset of legacyAssets) {
    const target = resolve(assetsRoot, asset);
    if (!target.startsWith(assetsRoot)) {
      throw new Error(`Refusing to remove unexpected asset path: ${target}`);
    }
    if (existsSync(target)) {
      rmSync(target, { force: true });
    }
  }
};

try {
  patchOpenNextWindowsSymlinks();

  if (existsSync(backupPath)) {
    throw new Error("Refusing to overwrite .env.local.codex-secret-backup.");
  }

  if (existsSync(envPath)) {
    renameSync(envPath, backupPath);
    movedEnv = true;
  }

  if (existsSync(resolve(cwd, ".open-next"))) {
    rmSync(resolve(cwd, ".open-next"), { recursive: true, force: true });
  }

  const env = {
    ...process.env,
    DATABASE_PROVIDER: "cloudflare-d1",
    NEXT_PUBLIC_APP_URL: "https://bosterbost.darlingtonsayee.com",
    CLOUDFLARE_ACCOUNT_ID: "a42b60a6c5b64ba1571e6d185906a761",
    CLOUDFLARE_D1_DATABASE_ID: "80a3a3d7-9584-42f6-8482-46f5fceaa2aa",
    PATH: `${resolve(cwd, "scripts")};${process.env.PATH || ""}`,
  };

  delete env.BREVO_API_KEY;
  delete env.CLOUDFLARE_D1_API_TOKEN;
  delete env.PAWAPAY_API_TOKEN;
  delete env.PAWAPAY_CALLBACK_SECRET;
  delete env.SMTP_PASSWORD;
  delete env.SMTP_USER;

  run("corepack", ["pnpm", "exec", "opennextjs-cloudflare", "build"], env);
  removeLegacyStaticAssets();
} finally {
  if (movedEnv && existsSync(backupPath)) {
    renameSync(backupPath, envPath);
  }
}
