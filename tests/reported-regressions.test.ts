import assert from 'node:assert/strict'
import { analyzeHeadings } from '../src/core/headingAnalyzer'
import { stripLeadingManualNumber } from '../src/decorations/postProcessor'
import { AutoHeadingSettings, DEFAULT_SETTINGS } from '../src/settings/settingsTypes'

function makeSettings(
  overrides: Partial<AutoHeadingSettings> = {},
): AutoHeadingSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...overrides,
    levelStyles: [...DEFAULT_SETTINGS.levelStyles],
    scopePaths: [],
  }
}

const lines = ['---', 'auto-heading: auto', '---', '', '# Heading 1']
const position = (line: number) => ({
  start: { line, col: 0, offset: 0 },
  end: { line, col: 0, offset: 0 },
})
const analysis = analyzeHeadings(
  [
    { heading: 'auto-heading: auto', level: 2, position: position(1) },
    { heading: 'Heading 1', level: 1, position: position(4) },
  ],
  line => lines[line] || '',
  makeSettings({ skipH1: false, firstLevel: 1, startAt: '1' }),
)

assert.equal(analysis.headings.length, 1)
assert.equal(analysis.headings[0].line, 4)
assert.equal(analysis.headings[0].formattedNumber, '1')

const textNodes = [
  { textContent: '' },
  { textContent: '\u20601. ' },
  { textContent: 'Project ' },
  { textContent: 'Overview' },
]
assert.equal(stripLeadingManualNumber(textNodes, '\u20601. '), true)
assert.deepEqual(
  textNodes.map(node => node.textContent),
  ['', '', 'Project ', 'Overview'],
)

const splitPrefixNodes = [
  { textContent: '\u20601' },
  { textContent: '. ' },
  { textContent: 'Project Overview' },
]
assert.equal(stripLeadingManualNumber(splitPrefixNodes, '\u20601. '), true)
assert.deepEqual(
  splitPrefixNodes.map(node => node.textContent),
  ['', '', 'Project Overview'],
)

console.log('reported issue regression tests passed')
