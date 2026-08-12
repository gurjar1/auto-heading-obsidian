import assert from 'node:assert/strict'
import { EditorState } from '@codemirror/state'
import {
  getDecorationSettingsEffect,
  getEditorExtensions,
  headingNumberField,
} from '../src/decorations/editorExtension'
import { HeadingNumberWidget } from '../src/decorations/widgets'
import {
  AutoHeadingSettings,
  DEFAULT_SETTINGS,
} from '../src/settings/settingsTypes'

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

function configure(
  state: EditorState,
  settings: AutoHeadingSettings,
  enabled: boolean,
): EditorState {
  const effect = getDecorationSettingsEffect(state, settings, enabled)
  return effect ? state.update({ effects: effect }).state : state
}

function getLabels(state: EditorState): string[] {
  const labels: string[] = []
  const decorations = state.field(headingNumberField).decorations
  decorations.between(0, state.doc.length, (_from, _to, value) => {
    const widget = value.spec.widget
    if (widget instanceof HeadingNumberWidget) labels.push(widget.displayText)
  })
  return labels
}

const extensions = getEditorExtensions()
let pinnedState = EditorState.create({
  doc: 'intro\n## Pinned section\n### Pinned detail',
  extensions,
})
let activeState = EditorState.create({
  doc: 'intro\n## Active section\n### Active detail',
  extensions,
})

pinnedState = configure(
  pinnedState,
  makeSettings({ mode: 'decoration', enabled: true }),
  true,
)
activeState = configure(
  activeState,
  makeSettings({
    mode: 'decoration',
    enabled: true,
    startAt: '5',
    separator: ')',
  }),
  true,
)

assert.deepEqual(getLabels(pinnedState), ['1. ', '1.1. '])
assert.deepEqual(getLabels(activeState), ['5) ', '5.1) '])
assert.equal(
  getDecorationSettingsEffect(
    pinnedState,
    makeSettings({ mode: 'decoration', enabled: true }),
    true,
  ),
  null,
  'unchanged pane settings should not dispatch or rebuild decorations',
)

// A focus/config refresh for one pane must not alter a pinned sibling pane.
activeState = configure(activeState, makeSettings({ mode: 'decoration' }), false)
assert.deepEqual(getLabels(activeState), [])
assert.deepEqual(getLabels(pinnedState), ['1. ', '1.1. '])

// YAML delimiters must not create a phantom Setext H2 or offset the first H1.
let frontMatterState = EditorState.create({
  doc: '---\nauto-heading: auto\n---\n\n# Heading 1',
  extensions,
})
frontMatterState = configure(
  frontMatterState,
  makeSettings({
    mode: 'decoration',
    enabled: true,
    skipH1: false,
    firstLevel: 1,
  }),
  true,
)
assert.deepEqual(getLabels(frontMatterState), ['1. '])

console.log('editor view isolation tests passed')
