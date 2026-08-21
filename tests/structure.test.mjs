/**
 * Static structural checks for the ozempskills package itself.
 *
 * ozempskills has no executable logic to unit-test in the conventional sense —
 * its "behavior" is a markdown procedure a model follows. What CAN be checked
 * mechanically is that the package is well-formed and internally consistent:
 * frontmatter parses, manifests agree with each other, every step the doc
 * refers to actually exists, and the doc's own stated invariants hold (e.g.
 * frontmatter block is never mutated by the numbered steps).
 *
 * Run with: node --test tests/structure.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const skillMd = readFileSync(join(ROOT, 'skill', 'SKILL.md'), 'utf8');
const pluginJson = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
const marketplaceJson = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));

function splitFrontmatter(md) {
  const match = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.ok(match, 'SKILL.md must start with a --- fenced frontmatter block');
  return { frontmatter: match[1], body: match[2] };
}

function frontmatterField(frontmatter, key) {
  const line = frontmatter.split('\n').find((l) => l.startsWith(`${key}:`));
  return line ? line.slice(key.length + 1).trim() : undefined;
}

describe('SKILL.md frontmatter', () => {
  const { frontmatter, body } = splitFrontmatter(skillMd);

  it('declares the expected name', () => {
    assert.equal(frontmatterField(frontmatter, 'name'), 'ozempskills');
  });

  it('is marked non-user-invocable', () => {
    assert.equal(frontmatterField(frontmatter, 'user-invocable'), 'false');
  });

  it('declares a license matching the package manifests', () => {
    const skillLicense = frontmatterField(frontmatter, 'license');
    assert.equal(skillLicense, pluginJson.license);
    assert.equal(skillLicense, 'Apache-2.0');
  });

  it('scopes its Write permission to its own cache directory only', () => {
    const writeLines = frontmatter
      .split('\n')
      .filter((l) => l.trim().startsWith('- Write('));
    assert.ok(writeLines.length > 0, 'expected at least one scoped Write() entry');
    for (const line of writeLines) {
      assert.match(
        line,
        /Write\(~\/\.claude\/skills\/ozempskills\/cache\/\*\)/,
        `Write permission must be scoped to the ozempskills cache dir, got: ${line}`
      );
    }
  });

  it('does not grant an unscoped Write', () => {
    assert.doesNotMatch(frontmatter, /\n\s*-\s*Write\s*\n/);
    assert.doesNotMatch(frontmatter, /-\s*Write\(\*\)/);
  });

  it('has a non-empty body', () => {
    assert.ok(body.trim().length > 100, 'body should contain the actual procedure');
  });
});

describe('Numbered step consistency', () => {
  const { body } = splitFrontmatter(skillMd);

  // Matches "## Step N — <title>"
  const stepHeadings = [...body.matchAll(/^## Step (\d+) — (.+)$/gm)].map((m) => ({
    n: Number(m[1]),
    title: m[2].trim(),
  }));

  it('finds at least one numbered step', () => {
    assert.ok(stepHeadings.length > 0);
  });

  it('numbers steps contiguously starting at 1, with no gaps or duplicates', () => {
    const numbers = stepHeadings.map((s) => s.n);
    const expected = Array.from({ length: numbers.length }, (_, i) => i + 1);
    assert.deepEqual(numbers, expected, `step numbers were ${numbers.join(', ')}`);
  });

  it('every in-body cross-reference to "Step N" points at a step that exists', () => {
    const maxStep = stepHeadings.length;
    const refs = [...body.matchAll(/\bStep (\d+)\b/g)].map((m) => Number(m[1]));
    const outOfRange = refs.filter((n) => n < 1 || n > maxStep);
    assert.deepEqual(outOfRange, [], `found references to nonexistent steps: ${outOfRange.join(', ')}`);
  });
});

describe('Never-alter list stability', () => {
  const { body } = splitFrontmatter(skillMd);

  const mustMention = [
    'frontmatter',
    'template_var',
    '{{template_var}}',
    'code block',
  ];

  it('the compression step still names every structurally load-bearing exclusion', () => {
    const compressStep = body.split(/## Step \d+ —/).find((section) => /Never alter/i.test(section));
    assert.ok(compressStep, 'expected a step containing a "Never alter" list');
    for (const term of mustMention) {
      assert.ok(
        compressStep.includes(term),
        `expected the never-alter list to still mention "${term}"`
      );
    }
  });

  it('explicitly excludes executable/script files from the referenced-file extension', () => {
    const refStep = body.split(/## Step \d+ —/).find((section) => /Referenced prose files/i.test(section));
    assert.ok(refStep, 'expected the referenced-prose-files step to exist');
    assert.match(refStep, /Never in scope/i);
    assert.match(refStep, /\.mjs/);
  });
});

describe('Cache entry schema in the doc', () => {
  const { body } = splitFrontmatter(skillMd);
  const jsonBlockMatch = body.match(/```json\n(\{[\s\S]*?\})\n```/);

  it('contains a parseable example cache entry', () => {
    assert.ok(jsonBlockMatch, 'expected a fenced ```json cache entry example');
  });

  it('the example cache entry has every field the procedure text refers to', () => {
    const raw = jsonBlockMatch[1];
    // The example uses placeholder tokens like <int> which aren't valid JSON —
    // normalize just enough to parse structurally.
    const normalized = raw
      .replace(/<[^>]*>/g, '0')
      .replace(/:\s*0(\w)/g, ': "0$1"'); // guard against `<hex>` etc leaving bad numerics
    let parsed;
    assert.doesNotThrow(() => {
      parsed = JSON.parse(normalized);
    }, 'example cache entry must be valid JSON once placeholders are normalized');

    for (const field of [
      'cache_format_version',
      'skill_name',
      'source_path',
      'source_hash',
      'resolved_via',
      'frontmatter_raw',
      'license_basis',
      'compressed_body',
      'compression_skipped',
      'skip_reason',
      'original_body_chars',
      'compressed_body_chars',
    ]) {
      assert.ok(field in parsed, `cache entry example is missing documented field "${field}"`);
    }
  });
});

describe('Package manifests agree with each other', () => {
  it('plugin.json and marketplace.json declare the same name', () => {
    assert.equal(pluginJson.name, marketplaceJson.plugins[0].name);
    assert.equal(pluginJson.name, marketplaceJson.name);
  });

  it('plugin.json and marketplace.json declare the same version', () => {
    assert.equal(pluginJson.version, marketplaceJson.plugins[0].version);
  });

  it('plugin.json points at the real skill directory', () => {
    assert.equal(pluginJson.skills, './skill/');
  });

  it('marketplace entry license matches plugin.json (if declared)', () => {
    if (marketplaceJson.plugins[0].license) {
      assert.equal(marketplaceJson.plugins[0].license, pluginJson.license);
    }
  });
});
