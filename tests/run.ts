// run-tests.ts
import { execa } from 'execa';
import { addChain } from "../scripts/add-chain.ts";

// Get the directory where the script was started. This is our project root.
const projectRoot = Deno.cwd();
console.log(`Running all commands in: ${projectRoot}`);

async function teardown() {
  console.log("Tearing down test database...");
  try {
    // Explicitly set the CWD for the teardown command.
    await execa('docker', ['compose', 'down'], { 
      cwd: projectRoot, 
      stdio: 'inherit' 
    });
    console.log("✅ Test database torn down.");
  } catch (error) {
    console.error("❌ Failed to tear down database:", error);
  }
}

let scriptFailed = false;

try {
  // Start up the test database.
  console.log("🚀 Starting test database...");
  await execa('docker', ['compose', 'up', '-d', 'db_test', '--wait'], { 
    cwd: projectRoot, 
    stdio: 'inherit' 
  });
  console.log("✅ Test database started.");

  // Run database migrations.
  console.log("🔄 Migrating test database...");
  await execa('deno', ['task', 'test:db:migrate'], { 
    cwd: projectRoot, 
    stdio: 'inherit' 
  });
  console.log("✅ Test database migrated.");

  // configure mock chain
  console.log("🔧 Configuring mock chain...");

  await addChain(
    1,
    "mockchain",
    "http://localhost:8545",
    false,
  );
  console.log("✅ Mock chain configured.");

  // Run the tests.
  console.log("🧪 Running tests...");
  await execa('deno', [
    'test',
    '--node-modules-dir',
    '--allow-import',
    '--allow-net',
    '--allow-env',
    '--env-file=.env.test',
    '--allow-read',
    '--trace-leaks',
    './tests/integration/customDataset.test.ts'
  ], { 
    cwd: projectRoot, 
    stdio: 'inherit' 
  });
  console.log("🎉 Tests passed!");

} catch (error) {
  console.error("\n❌ A command failed:", error);
  scriptFailed = true;
} finally {
  await teardown();
}

if (scriptFailed) {
  console.log("\nScript finished with errors.");
  Deno.exit(1);
} else {
  console.log("\nScript finished successfully.");
}
