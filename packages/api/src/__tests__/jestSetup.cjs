const os = require("os");
const path = require("path");
const fs = require("fs");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "magen-test-"));
process.env.MAGEN_DATA_DIR = tmpDir;

// Expose so tests can clean between runs
global.__MAGEN_TEST_DATA_DIR__ = tmpDir;
