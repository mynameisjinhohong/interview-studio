import { existsSync } from 'node:fs'

export const resolveBundledExecutable = (
  executablePath: string | null,
  fileExists: (path: string) => boolean = existsSync
): string | null => {
  if (!executablePath) return null
  const unpackedPath = executablePath.replace(
    /([\\/])app\.asar([\\/])/,
    '$1app.asar.unpacked$2'
  )
  if (unpackedPath !== executablePath) return fileExists(unpackedPath) ? unpackedPath : null
  return fileExists(executablePath) ? executablePath : null
}
