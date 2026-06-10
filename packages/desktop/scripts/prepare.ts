#!/usr/bin/env bun
import { Script } from "@opencode-ai/script"

await import("./prebuild")

const pkg = await Bun.file("./package.json").json()
pkg.version = (Script.version ?? "0.0.0").replace(/-gloam$/i, "")
await Bun.write("./package.json", JSON.stringify(pkg, null, 2) + "\n")
console.log(`Updated package.json version to ${pkg.version}`)
