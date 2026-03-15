import { runAsyncTests, summary } from "./harness.js";

// Import all test suites — they register tests on import
import "./robots.test.js";
import "./metadata.test.js";
import "./links.test.js";
import "./cursor.test.js";
import "./sitemap.test.js";
import "./integration.test.js";

// Run async tests then print summary
runAsyncTests().then(() => {
  const failures = summary();
  process.exit(failures > 0 ? 1 : 0);
});
