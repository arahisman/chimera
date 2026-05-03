#!/usr/bin/env bun
import { chmod, mkdir, access, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { existsSync, readFileSync } from "node:fs"

const root = process.cwd()
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))

await rm(join(root, "dist"), { recursive: true, force: true })

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function canResolveSourceModule(spec, importer) {
  const base =
    spec.startsWith("src/")
      ? join(root, spec)
      : spec.startsWith(".") && importer
        ? resolve(dirname(importer), spec)
        : undefined
  if (!base) return true
  const noJs = base.endsWith(".js") ? base.slice(0, -3) : base
  const candidates = [
    base,
    `${noJs}.ts`,
    `${noJs}.tsx`,
    `${noJs}.js`,
    `${noJs}.jsx`,
    join(noJs, "index.ts"),
    join(noJs, "index.tsx"),
    join(noJs, "index.js"),
  ]
  for (const candidate of candidates) {
    if (await exists(candidate)) return true
  }
  return false
}

const result = await Bun.build({
  entrypoints: [join(root, "src/entrypoints/cli.tsx")],
  outdir: join(root, "dist"),
  target: "bun",
  format: "esm",
  external: ["sharp"],
  sourcemap: process.env.CHIMERA_BUILD_SOURCEMAP === "1" ? "external" : "none",
  naming: "chimera.js",
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "development"),
    "process.env.USER_TYPE": JSON.stringify(process.env.USER_TYPE ?? "external"),
    "MACRO": JSON.stringify({
      VERSION: packageJson.version,
      BUILD_TIME: process.env.CHIMERA_BUILD_TIME ?? process.env.CODEX_CODE_BUILD_TIME ?? "",
      PACKAGE_URL: "chimera",
      NATIVE_PACKAGE_URL: "chimera",
      FEEDBACK_CHANNEL: "local issue tracker",
      ISSUES_EXPLAINER: "use /feedback or open an issue in this repository",
      VERSION_CHANGELOG: "",
    }),
  },
  plugins: [
    {
      name: "chimera-build-resolver",
      setup(build) {
        build.onResolve({ filter: /^(bun:)?bundle$/ }, () => ({
          path: join(root, "src/build-shims/bun-bundle.ts"),
        }))
        build.onLoad({ filter: /\.(md|txt)$/ }, async (args) => ({
          contents: await Bun.file(args.path).text(),
          loader: "text",
        }))
        build.onResolve({ filter: /^(\.|\.\.|src\/)/ }, async (args) => {
          if (await canResolveSourceModule(args.path, args.importer)) return
          const from = args.importer ? args.importer.replace(`${root}/`, "") : "<entry>"
          throw new Error(`Missing source module: ${args.path} from ${from}`)
        })
      },
    },
  ],
})

await mkdir(join(root, "dist"), { recursive: true })

if (!result.success) {
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

await postprocessBundle()
await ensureExecutableBin()

console.log(`Built ${result.outputs.length} artifact(s) into dist/`)

async function ensureExecutableBin() {
  const binPath = join(root, "dist", "chimera.js")
  if (!existsSync(binPath)) return
  const text = await readFile(binPath, "utf8")
  const withShebang = text.startsWith("#!")
    ? text
    : `#!/usr/bin/env bun\n${text}`
  if (withShebang !== text) await writeFile(binPath, withShebang)
  await chmod(binPath, 0o755)
}

async function postprocessBundle() {
  const binPath = join(root, "dist", "chimera.js")
  if (!existsSync(binPath)) return

  const text = await readFile(binPath, "utf8")
  const sanitized = text
    .replaceAll("https://api.anthropic.com", "https://chatgpt.com/backend-api")
    .replaceAll("com.anthropic.", "com.chimera.")

  if (sanitized !== text) {
    await writeFile(binPath, sanitized)
  }
}
