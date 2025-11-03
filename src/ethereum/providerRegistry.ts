import { JsonRpcProvider } from "ethers";
import type { InferSelectModel } from "drizzle-orm";
import { chains } from "$app/db/schema.ts";
import { getChains } from "$app/services/chainService.ts";
import { log, LogLevel } from "$app/services/loggingService.ts";

const providersByChainDbId = new Map<number, JsonRpcProvider>();
let initializationPromise: Promise<void> | null = null;

// Chain record type used across the provider registry
export type ChainRecord = InferSelectModel<typeof chains>;

function createProvider(chain: ChainRecord): JsonRpcProvider {
  log(LogLevel.Info, "Creating JsonRpcProvider", {
    chainId: chain.id,
    rpcUrl: chain.rpcUrl,
  });
  return new JsonRpcProvider(chain.rpcUrl);
}

function registerProvider(chain: ChainRecord): JsonRpcProvider {
  let provider = providersByChainDbId.get(chain.id);
  if (!provider) {
    provider = createProvider(chain);
    providersByChainDbId.set(chain.id, provider);
    log(LogLevel.Info, "Cached JsonRpcProvider", { chainId: chain.id });
  }
  return provider;
}

async function initializeProviders(): Promise<void> {
  log(LogLevel.Info, "Initializing chain providers");
  const configuredChains = await getChains();
  for (const chain of configuredChains) {
    registerProvider(chain);
  }
  log(LogLevel.Info, "Finished initializing chain providers", {
    total: configuredChains.length,
  });
}

async function ensureInitialized(): Promise<void> {
  if (!initializationPromise) {
    log(LogLevel.Info, "Starting provider registry warm-up");
    initializationPromise = initializeProviders().catch((error) => {
      log(LogLevel.Error, "Provider registry warm-up failed", {
        error: String(error),
      });
      initializationPromise = null;
      throw error;
    });
  }

  await initializationPromise;
}

export async function getProviderForChain(
  chain: ChainRecord,
): Promise<JsonRpcProvider> {
  await ensureInitialized();
  log(LogLevel.Info, "Retrieving provider for chain", { chainId: chain.id });
  return registerProvider(chain);
}

export async function warmProviderRegistry(): Promise<void> {
  await ensureInitialized();
  log(LogLevel.Info, "Provider registry warm-up complete");
}
