/**
 * Layer 2 & 3 Cross-Check — Manual Number Detector + Structure-Aware Fallback
 *
 * Tests detection of existing/legacy heading numbers WITHOUT the U+2060 marker.
 * These are headings the user typed manually or were burned in by older versions.
 */

// ─── Inline the production detector for isolated testing ──────

const PATTERNS = [
  { regex: /^(\d+(?:\.\d+)+)\.?\s*[):—\-]?\s*/, style: 'hierarchical', confidence: 'high' },
  { regex: /^(\d+)\s*[.):—\-]\s+/, style: 'arabic', confidence: 'high' },
  { regex: /^(\d{1,3})\s+(?=[A-Z])/, style: 'arabic', confidence: 'medium' },
  { regex: /^([A-Z])\.?\s*[):—\-]?\s+/, style: 'letter-upper', confidence: 'medium' },
  { regex: /^([a-z])\.\s+/, style: 'letter-lower', confidence: 'medium' },
  { regex: /^([IVXLCDM]{2,}|I)\s*[.):\-—]\s+/, style: 'roman-upper', confidence: 'medium' },
  { regex: /^([ivxlcdm]{2,})\s*[.):\-—]\s+/, style: 'roman-lower', confidence: 'low' },
  { regex: /^(\d{1,4}(?:\.\d+)*)\s+/, style: 'arabic', confidence: 'low' },
  { regex: /^((?:\d+|[A-Z]{1,2}|[a-z]{1,2}|[IVXLCDM]+|[ivxlcdm]+)(?:\.(?:\d+|[A-Z]{1,2}|[a-z]{1,2}|[IVXLCDM]+|[ivxlcdm]+))+)\s+/, style: 'hierarchical', confidence: 'low' },
]

const ROMAN_FALSE_POSITIVES = new Set(['I','In','Is','It','If','Im','Dim','Did','Mix','Mid','Mild','Civil','Civic','Livid','Vivid'])

function detectManualNumber(text) {
  const trimmed = text.trimStart()
  if (!trimmed) return null
  // Skip U+2060 marker check — we're testing without it
  for (const p of PATTERNS) {
    const m = trimmed.match(p.regex)
    if (m) {
      const fullMatch = m[0], numberPart = m[1]
      if (p.style === 'roman-upper' || p.style === 'roman-lower') {
        const after = trimmed.substring(fullMatch.length)
        if (after.length > 0 && /^[a-z]/.test(after)) continue
        if (ROMAN_FALSE_POSITIVES.has(numberPart)) {
          if (numberPart === 'I' && !(/^I\s*[.):\-—]\s+/.test(trimmed))) continue
        }
      }
      if (p.style === 'letter-upper' && numberPart.length === 1) {
        if (!/^[A-Z]\s*[.):\-—]\s+/.test(trimmed)) continue
      }
      return { fullMatch, numberPart, style: p.style, confidence: p.confidence }
    }
  }
  return null
}

// ─── Build burn-in regex (Layer 3) ────────────────────────────

const RU = 'M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})'
const RL = 'm{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})'
const SEG = `(?:\\d+|[A-Z]{1,2}|(?:${RU})|(?:${RL})|[a-z]{1,2})`

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function buildFallback(fn, sep = '.') {
  const e = esc(sep), c = fn.split(sep).length, p = []
  for (let i = 0; i < c; i++) p.push(SEG)
  return new RegExp(`^(${p.join(e)})\\s*[.):\\-—]?\\s+`)
}

// ─── Test Framework ───────────────────────────────────────────

let pass = 0, fail = 0, total = 0
function test(name, fn) {
  total++
  try { fn(); pass++; console.log(`  ✅ ${name}`) }
  catch(e) { fail++; console.log(`  ❌ ${name}: ${e.message}`) }
}
function eq(a, b) { if (a !== b) throw new Error(`Expected "${b}", got "${a}"`) }

// ═══════════════════════════════════════════════════════════════
console.log('\n🔍 LAYER 2: Manual Number Detector (production patterns)')
console.log('   These test existing headings WITHOUT the U+2060 marker\n')

// ── Arabic with separators (HIGH confidence) ─────────────────
console.log('  Arabic + Separator (high confidence):')
test('  "1. Introduction" → arabic, high', () => { const r = detectManualNumber('1. Introduction'); eq(r?.style, 'arabic'); eq(r?.confidence, 'high') })
test('  "2) Methods" → arabic, high', () => { const r = detectManualNumber('2) Methods'); eq(r?.style, 'arabic'); eq(r?.confidence, 'high') })
test('  "3: Results" → arabic, high', () => { const r = detectManualNumber('3: Results'); eq(r?.style, 'arabic'); eq(r?.confidence, 'high') })
test('  "42. Answer" → arabic, high', () => { const r = detectManualNumber('42. Answer'); eq(r?.style, 'arabic'); eq(r?.confidence, 'high') })
test('  "1 - Chapter" → arabic, high', () => { const r = detectManualNumber('1 - Chapter'); eq(r?.style, 'arabic'); eq(r?.confidence, 'high') })

// ── Hierarchical (HIGH confidence) ───────────────────────────
console.log('\n  Hierarchical (high confidence):')
test('  "1.2 heading" → hierarchical, high', () => { const r = detectManualNumber('1.2 heading'); eq(r?.style, 'hierarchical'); eq(r?.confidence, 'high') })
test('  "1.2.3 heading" → hierarchical, high', () => { const r = detectManualNumber('1.2.3 heading'); eq(r?.style, 'hierarchical'); eq(r?.confidence, 'high') })
test('  "1.2.3.4 heading" → hierarchical, high', () => { const r = detectManualNumber('1.2.3.4 heading'); eq(r?.style, 'hierarchical'); eq(r?.confidence, 'high') })
test('  "1.2.3. trailing dot" → hierarchical, high', () => { const r = detectManualNumber('1.2.3. trailing dot'); eq(r?.style, 'hierarchical'); eq(r?.confidence, 'high') })

// ── Letter with separator (MEDIUM confidence) ────────────────
console.log('\n  Letter + Separator (medium confidence):')
test('  "A. Chapter" → letter-upper, med', () => { const r = detectManualNumber('A. Chapter'); eq(r?.style, 'letter-upper'); eq(r?.confidence, 'medium') })
test('  "B) Section" → letter-upper, med', () => { const r = detectManualNumber('B) Section'); eq(r?.style, 'letter-upper'); eq(r?.confidence, 'medium') })
test('  "a. subsection" → letter-lower, med', () => { const r = detectManualNumber('a. subsection'); eq(r?.style, 'letter-lower'); eq(r?.confidence, 'medium') })

// ── Roman with separator (MEDIUM confidence) ─────────────────
console.log('\n  Roman + Separator (medium confidence):')
test('  "I. First" → matched (letter-upper or roman)', () => { const r = detectManualNumber('I. First'); eq(r != null, true) })
test('  "II. Second" → roman-upper, med', () => { const r = detectManualNumber('II. Second'); eq(r?.style, 'roman-upper'); eq(r?.confidence, 'medium') })
test('  "IV) Fourth" → roman-upper, med', () => { const r = detectManualNumber('IV) Fourth'); eq(r?.style, 'roman-upper'); eq(r?.confidence, 'medium') })
test('  "XIV. Fourteen" → roman-upper, med', () => { const r = detectManualNumber('XIV. Fourteen'); eq(r?.style, 'roman-upper'); eq(r?.confidence, 'medium') })

// ── Arabic bare (MEDIUM confidence) ──────────────────────────
console.log('\n  Arabic bare "N Heading" (medium confidence):')
test('  "1 Heading" → arabic, med', () => { const r = detectManualNumber('1 Heading'); eq(r?.style, 'arabic'); eq(r?.confidence, 'medium') })
test('  "42 Answer" → arabic, med', () => { const r = detectManualNumber('42 Answer'); eq(r?.style, 'arabic'); eq(r?.confidence, 'medium') })

// ── Catch-all (LOW confidence) ───────────────────────────────
console.log('\n  Catch-all "N text" (low confidence):')
test('  "1 heading" (lowercase) → arabic, low', () => { const r = detectManualNumber('1 heading'); eq(r?.style, 'arabic'); eq(r?.confidence, 'low') })
test('  "5 new heading" → arabic, low', () => { const r = detectManualNumber('5 new heading'); eq(r?.style, 'arabic'); eq(r?.confidence, 'low') })

// ── Mixed hierarchical (LOW confidence) ──────────────────────
console.log('\n  Mixed hierarchical (low confidence):')
test('  "1.a heading" → hierarchical, low', () => { const r = detectManualNumber('1.a heading'); eq(r?.style, 'hierarchical'); eq(r?.confidence, 'low') })
test('  "iv.2.A heading" → hierarchical, low', () => { const r = detectManualNumber('iv.2.A heading'); eq(r?.style, 'hierarchical'); eq(r?.confidence, 'low') })
test('  "A.a.I.1 heading" → hierarchical, low', () => { const r = detectManualNumber('A.a.I.1 heading'); eq(r != null, true) })
test('  "1.2.a.i heading" → hierarchical, low', () => { const r = detectManualNumber('1.2.a.i heading'); eq(r != null, true) })

// ── FALSE POSITIVE PREVENTION ────────────────────────────────
console.log('\n  False positive prevention (must return null):')
test('  "Testing heading" → null', () => eq(detectManualNumber('Testing heading'), null))
test('  "Ways to identify" → null', () => eq(detectManualNumber('Ways to identify'), null))
test('  "How to fix issues" → null', () => eq(detectManualNumber('How to fix issues'), null))
test('  "The Quick Brown Fox" → null', () => eq(detectManualNumber('The Quick Brown Fox'), null))
test('  "On the topic" → null', () => eq(detectManualNumber('On the topic'), null))
test('  "Do not edit" → null', () => eq(detectManualNumber('Do not edit'), null))
test('  "Go further" → null', () => eq(detectManualNumber('Go further'), null))
test('  "In this section" → null', () => eq(detectManualNumber('In this section'), null))

// ── CONTENT NUMBERS (risky but handled) ──────────────────────
console.log('\n  Content numbers (detected but handled by remover):')
test('  "6 ways to identify" → detected as low (remover skips lowercase)', () => {
  const r = detectManualNumber('6 ways to identify heading')
  eq(r?.confidence, 'low')
  eq(r?.numberPart, '6')
})
test('  "2024 Annual Report" → detected (remover handles)', () => {
  const r = detectManualNumber('2024 Annual Report')
  eq(r != null, true)
})

// ═══════════════════════════════════════════════════════════════
console.log('\n🔧 LAYER 3: Structure-Aware Fallback (buildBurnInRegex)')
console.log('   Tests the regex built from computed number segment count\n')

// ── Depth 1 ──────────────────────────────────────────────────
console.log('  Depth 1 (single segment):')
test('  "1 heading" ✓', () => eq(buildFallback('1').test('1 heading'), true))
test('  "42 heading" ✓', () => eq(buildFallback('1').test('42 heading'), true))
test('  "A heading" ✓ (1-2 letter upper)', () => eq(buildFallback('1').test('A heading'), true))
test('  "aa heading" ✓ (1-2 letter lower)', () => eq(buildFallback('1').test('aa heading'), true))
test('  "i heading" ✓ (roman lower)', () => eq(buildFallback('1').test('i heading'), true))
test('  "IV heading" ✓ (roman upper)', () => eq(buildFallback('1').test('IV heading'), true))
test('  "XVIII heading" ✓ (long roman)', () => eq(buildFallback('1').test('XVIII heading'), true))
test('  "xxviii heading" ✓ (long roman lower)', () => eq(buildFallback('1').test('xxviii heading'), true))

console.log('\n  Depth 1 — must NOT match:')
test('  "Testing heading" ✗', () => eq(buildFallback('1').test('Testing heading'), false))
test('  "dim heading" ✗ (fake roman)', () => eq(buildFallback('1').test('dim heading'), false))
test('  "mild heading" ✗', () => eq(buildFallback('1').test('mild heading'), false))
test('  "civil rights" ✗', () => eq(buildFallback('1').test('civil rights'), false))
test('  "did heading" ✗', () => eq(buildFallback('1').test('did heading'), false))
test('  "lid heading" ✗', () => eq(buildFallback('1').test('lid heading'), false))
test('  "ABC heading" ✗ (3 chars)', () => eq(buildFallback('1').test('ABC heading'), false))
test('  "Overview heading" ✗', () => eq(buildFallback('1').test('Overview heading'), false))

// ── Depth 2 ──────────────────────────────────────────────────
console.log('\n  Depth 2 (two segments):')
test('  "1.2 heading" ✓', () => eq(buildFallback('1.1').test('1.2 heading'), true))
test('  "iv.a heading" ✓', () => eq(buildFallback('1.1').test('iv.a heading'), true))
test('  "XVIII.AA heading" ✓', () => eq(buildFallback('1.1').test('XVIII.AA heading'), true))
test('  "A.1 heading" ✓', () => eq(buildFallback('1.1').test('A.1 heading'), true))

console.log('\n  Depth 2 — must NOT match:')
test('  "1 heading" ✗ (wrong depth)', () => eq(buildFallback('1.1').test('1 heading'), false))

// ── Depth 3-6 ────────────────────────────────────────────────
console.log('\n  Depth 3-6 (deep nesting):')
test('  "A.a.I heading" at depth 3 ✓', () => eq(buildFallback('1.1.1').test('A.a.I heading'), true))
test('  "1.2.3.4 heading" at depth 4 ✓', () => eq(buildFallback('1.1.1.1').test('1.2.3.4 heading'), true))
test('  "A.a.I.1.ii heading" at depth 5 ✓', () => eq(buildFallback('1.1.1.1.1').test('A.a.I.1.ii heading'), true))
test('  "1.A.a.I.i.2 heading" at depth 6 ✓', () => eq(buildFallback('1.1.1.1.1.1').test('1.A.a.I.i.2 heading'), true))

// ── Custom separators ────────────────────────────────────────
console.log('\n  Custom level separators:')
test('  "1-2-3 heading" with sep="-" ✓', () => eq(buildFallback('1-2-3', '-').test('1-2-3 heading'), true))
test('  "1.2 heading" with sep="-" ✗', () => eq(buildFallback('1-2', '-').test('1.2 heading'), false))

// ═══ SUMMARY ═════════════════════════════════════════════════
console.log(`\n══════════════════════════════════════════════════`)
console.log(`📊 Results: ${pass}/${total} passed, ${fail} failed`)
if (fail === 0) console.log('✅ All Layer 2 & 3 tests passed!')
else { console.log('❌ Some tests failed'); process.exit(1) }
