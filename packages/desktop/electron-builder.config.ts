import { execFile } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import type { Configuration } from "electron-builder"

const execFileAsync = promisify(execFile)
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const signScript = path.join(rootDir, "script", "sign-windows.ps1")

async function signWindows(configuration: { path: string }) {
  if (process.platform !== "win32") return
  if (process.env.GITHUB_ACTIONS !== "true") return

  await execFileAsync(
    "pwsh",
    ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", signScript, configuration.path],
    { cwd: rootDir },
  )
}

const channel = (() => {
  const raw = process.env.OPENCODE_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
})()

// Stable, Gloam-specific NSIS uninstall GUIDs. electron-builder derives this
// GUID from appId by default; we pin explicit values so the Windows uninstall
// registry entry and installer identity can NEVER collide with a separately
// installed OpenCode (ai.opencode.desktop*). Installing or uninstalling one app
// must never remove the other, and both must be installable side by side.
const NSIS_GUIDS: Record<string, string> = {
  dev: "4c8a1e73-6b22-4d9f-8e1a-5b3c2d6f7a01",
  beta: "2d9b6c41-3a55-4f1e-b2c3-7e8d9a0b1c2d",
  prod: "7f3e2a10-9c44-4b8e-a1d2-3f5c6b7a8e90",
}

const getBase = (): Configuration => ({
  artifactName: "gloam-desktop-${os}-${arch}.${ext}",
  directories: {
    output: "dist",
    buildResources: "resources",
  },
  files: ["out/**/*", "resources/**/*"],
  extraResources: [
    {
      from: "native/",
      to: "native/",
      filter: ["index.js", "index.d.ts", "build/Release/mac_window.node", "swift-build/**"],
    },
  ],
  mac: {
    category: "public.app-category.developer-tools",
    icon: `resources/icons/icon.icns`,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "resources/entitlements.plist",
    entitlementsInherit: "resources/entitlements.plist",
    notarize: true,
    target: ["dmg", "zip"],
  },
  dmg: {
    sign: true,
  },
  protocols: {
    name: "Gloam",
    schemes: ["opencode"],
  },
  win: {
    icon: `resources/icons/icon.ico`,
    signtoolOptions: {
      publisherName: "Gloam",
      sign: signWindows,
    },
    target: ["nsis"],
    verifyUpdateCodeSignature: false,
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    installerIcon: `resources/icons/icon.ico`,
    installerHeaderIcon: `resources/icons/icon.ico`,
  },
  linux: {
    icon: `resources/icons`,
    category: "Development",
    target: ["AppImage", "deb", "rpm"],
  },
})

function getConfig() {
  const base = getBase()

  switch (channel) {
    case "dev": {
      return {
        ...base,
        appId: "ai.gloam.desktop.dev",
        productName: "Gloam Desktop",
        nsis: { ...base.nsis, guid: NSIS_GUIDS.dev },
        rpm: { packageName: "gloam-desktop-dev" },
      }
    }
    case "beta": {
      return {
        ...base,
        appId: "ai.gloam.desktop.beta",
        productName: "Gloam Desktop Beta",
        protocols: { name: "Gloam Beta", schemes: ["opencode"] },
        nsis: { ...base.nsis, guid: NSIS_GUIDS.beta },
        publish: { provider: "github", owner: "anomalyco", repo: "opencode-beta", channel: "latest" },
        rpm: { packageName: "gloam-desktop-beta" },
      }
    }
    case "prod": {
      return {
        ...base,
        appId: "ai.gloam.desktop",
        productName: "Gloam Desktop",
        protocols: { name: "Gloam", schemes: ["opencode"] },
        nsis: { ...base.nsis, guid: NSIS_GUIDS.prod },
        publish: { provider: "github", owner: "anomalyco", repo: "opencode", channel: "latest" },
        rpm: { packageName: "gloam-desktop" },
      }
    }
  }
}

export default getConfig()
