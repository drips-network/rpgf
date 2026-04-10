import { JsonRpcProvider } from "ethers";
import type { InferSelectModel } from "drizzle-orm";
import { chains } from "$app/db/schema.ts";
import { getChains } from "$app/services/chainService.ts";
import { Logger } from "$app/services/loggingService.ts";

const logger = new Logger("ethereum:providerRegistry");

const providersByChainDbId = new Map<number, JsonRpcProvider>();
let initializationPromise: Promise<void> | null = null;

// Chain record type used across the provider registry
export type ChainRecord = InferSelectModel<typeof chains>;

function createProvider(chain: ChainRecord): JsonRpcProvider {
  logger.info("Creating JsonRpcProvider", {
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
    logger.info("Cached JsonRpcProvider", { chainId: chain.id });
  }
  return provider;
}

async function initializeProviders(): Promise<void> {
  logger.info("Initializing chain providers");
  const configuredChains = await getChains();
  for (const chain of configuredChains) {
    registerProvider(chain);
  }
  logger.info("Finished initializing chain providers", {
    total: configuredChains.length,
  });
}

async function ensureInitialized(): Promise<void> {
  if (!initializationPromise) {
    logger.info("Starting provider registry warm-up");
    initializationPromise = initializeProviders().catch((error) => {
      logger.error("Provider registry warm-up failed", {
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
  logger.info("Retrieving provider for chain", { chainId: chain.id });
  return registerProvider(chain);
}

export async function warmProviderRegistry(): Promise<void> {
  await ensureInitialized();
  logger.info("Provider registry warm-up complete");
}
