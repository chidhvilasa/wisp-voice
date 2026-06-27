import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export interface UpdateInfo {
  available: boolean
  version?: string
  body?: string
  date?: string
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  try {
    const update = await check()
    if (!update) return { available: false }
    return {
      available: true,
      version: update.version,
      body: update.body ?? undefined,
      date: update.date ?? undefined,
    }
  } catch {
    return { available: false }
  }
}

export async function installUpdate(
  onProgress?: (downloaded: number, total: number | null) => void,
): Promise<void> {
  const update = await check()
  if (!update) return

  let total: number | null = null
  let downloaded = 0

  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? null
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength
      onProgress?.(downloaded, total)
    }
  })

  await relaunch()
}
