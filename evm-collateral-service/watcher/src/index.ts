import 'dotenv/config';
import { buildChainConfigs } from './config.js';
import { startWatcher } from './watcher.js';

async function main() {
  console.log('PRISM Collateral Watcher starting…');

  let configs;
  try {
    configs = buildChainConfigs();
  } catch (err) {
    console.error('Config error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log(`Watching ${configs.length} chain(s): ${configs.map(c => c.name).join(', ')}`);

  // Start all chain watchers in parallel — each runs its own poll loop
  await Promise.all(configs.map(config => startWatcher(config)));
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
