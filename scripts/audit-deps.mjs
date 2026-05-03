#!/usr/bin/env bun
import { builtinModules } from "node:module"
import { readFileSync } from "node:fs"
import { join, relative } from "node:path"

const root = process.cwd()
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const declared = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
  ...Object.keys(pkg.optionalDependencies ?? {}),
])
const builtin = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
])

const files = await Array.fromAsync(
  new Bun.Glob("src/**/*.{ts,tsx}").scan({ cwd: root, absolute: true }),
)
const importRe =
  /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g

const specs = new Map()
for (const file of files) {
  const text = readFileSync(file, "utf8")
  for (const match of text.matchAll(importRe)) {
    const spec = match[1] ?? match[2] ?? match[3]
    if (!spec) continue
    if (spec.startsWith(".") || spec.startsWith("src/") || builtin.has(spec)) continue
    if (spec.startsWith("bun:")) continue
    const typeOnly = /^\s*(?:import|export)\s+type\b/.test(match[0])
    const list = specs.get(spec) ?? []
    list.push({ file: relative(root, file), typeOnly })
    specs.set(spec, list)
  }
}

function packageName(spec) {
  if (spec.startsWith("@")) return spec.split("/").slice(0, 2).join("/")
  return spec.split("/")[0]
}

function looksLikePackageSpecifier(spec) {
  const name = packageName(spec)
  if (!name) return false
  if (/^[A-Z]$/.test(name)) return false
  if (name.includes("=")) return false
  return true
}

const rows = []
for (const [spec, locations] of [...specs].sort(([a], [b]) => a.localeCompare(b))) {
  if (!looksLikePackageSpecifier(spec)) continue
  const pkgName = packageName(spec)
  let resolved = false
  try {
    import.meta.resolve(spec)
    resolved = true
  } catch {
    resolved = false
  }
  rows.push({
    spec,
    package: pkgName,
    declared: declared.has(pkgName),
    resolved,
    typeOnly: locations.every((location) => location.typeOnly),
    examples: locations.slice(0, 3).map((location) => location.file),
  })
}

const unresolved = rows.filter((r) => !r.resolved)
const unresolvedRuntime = unresolved.filter((r) => !r.typeOnly)
const unresolvedTypeOnly = unresolved.filter((r) => r.typeOnly)
console.log(`External import specifiers: ${rows.length}`)
console.log(`Unresolved runtime after install/shims: ${unresolvedRuntime.length}`)
console.log(`Unresolved type-only after install/shims: ${unresolvedTypeOnly.length}`)
for (const row of unresolvedRuntime) {
  console.log(`- ${row.spec} (package: ${row.package}, declared: ${row.declared ? "yes" : "no"})`)
  for (const file of row.examples) console.log(`  ${file}`)
}
for (const row of unresolvedTypeOnly) {
  console.log(`- ${row.spec} (type-only, package: ${row.package}, declared: ${row.declared ? "yes" : "no"})`)
  for (const file of row.examples) console.log(`  ${file}`)
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ rows, unresolved, unresolvedRuntime, unresolvedTypeOnly }, null, 2))
}
