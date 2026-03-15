/**
 * Minimal test harness — zero dependencies.
 */

let currentSuite = "";
let passed = 0;
let failed = 0;
const errors: string[] = [];

interface TestEntry {
  suite: string;
  name: string;
  fn: () => void | Promise<void>;
}

const allTests: TestEntry[] = [];

export function describe(name: string, fn: () => void) {
  currentSuite = name;
  fn();
}

export function it(name: string, fn: () => void | Promise<void>) {
  allTests.push({ suite: currentSuite, name, fn });
}

export function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

export async function runAsyncTests() {
  let lastSuite = "";
  for (const test of allTests) {
    if (test.suite !== lastSuite) {
      console.log(`\n  ${test.suite}`);
      lastSuite = test.suite;
    }
    try {
      const result = test.fn();
      if (result instanceof Promise) await result;
      passed++;
      console.log(`    ✓ ${test.name}`);
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`    ✗ ${test.name}: ${msg}`);
      errors.push(`${test.suite} > ${test.name}: ${msg}`);
    }
  }
}

export function summary(): number {
  console.log(`\n  ${passed} passing, ${failed} failing\n`);
  if (errors.length > 0) {
    console.log("  Failures:");
    for (const e of errors) console.log(`    ${e}`);
    console.log();
  }
  return failed;
}
