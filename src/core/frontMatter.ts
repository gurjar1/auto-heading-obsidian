/**
 * Return the zero-based line number of a YAML front matter closing delimiter.
 * A missing or unclosed front matter block returns -1.
 */
export function findFrontMatterEndLine(
  getLine: (line: number) => string,
  lastLine: number,
): number {
  const firstLine = getLine(0).replace(/^\uFEFF/, '')
  if (!/^---\s*$/.test(firstLine)) return -1

  for (let line = 1; line <= lastLine; line++) {
    if (/^(?:---|\.\.\.)\s*$/.test(getLine(line))) return line
  }

  return -1
}
