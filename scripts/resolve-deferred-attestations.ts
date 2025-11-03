import { db } from "$app/db/postgres.ts";
import { applicationVersions } from "$app/db/schema.ts";
import { addApplicationAttestationFromTransaction } from "$app/services/applicationService.ts";
import { log, LogLevel } from "$app/services/loggingService.ts";
import { desc } from "drizzle-orm";

async function fetchPendingApplicationVersions() {
  const pendingVersions = await db.query.applicationVersions.findMany({
    where: (av, { isNull }) => isNull(av.easAttestationUID),
    orderBy: desc(applicationVersions.createdAt),
    with: {
      application: {
        with: {
          submitter: true,
        },
      },
    },
  });

  return pendingVersions.filter((version) =>
    Boolean(version.deferredAttestationTxHash) && version.application?.submitter
  );
}

async function resolvePendingAttestations() {
  const versions = await fetchPendingApplicationVersions();

  log(LogLevel.Info, "Found pending attestations", {
    count: versions.length,
  });

  let resolvedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const version of versions) {
    const application = version.application;

    if (!application) {
      skippedCount += 1;
      log(LogLevel.Warn, "Application missing for version", {
        applicationVersionId: version.id,
      });
      continue;
    }

    const submitter = application.submitter;

    if (!submitter) {
      skippedCount += 1;
      log(LogLevel.Warn, "Submitter missing for application", {
        applicationVersionId: version.id,
        applicationId: application.id,
      });
      continue;
    }

    log(LogLevel.Info, "Attempting to resolve deferred attestation", {
      applicationVersionId: version.id,
      applicationId: application.id,
      roundId: application.roundId,
      deferredAttestationTxHash: version.deferredAttestationTxHash,
    });

    try {
      await addApplicationAttestationFromTransaction(
        application.id,
        application.roundId,
        application.submitterUserId,
        submitter.walletAddress,
      );
      resolvedCount += 1;
      log(LogLevel.Info, "Resolved deferred attestation", {
        applicationVersionId: version.id,
        applicationId: application.id,
      });
    } catch (error) {
      errorCount += 1;
      log(LogLevel.Error, "Failed to resolve deferred attestation", {
        applicationVersionId: version.id,
        applicationId: application.id,
        error,
      });
    }
  }

  log(LogLevel.Info, "Deferred attestation resolution complete", {
    total: versions.length,
    resolvedCount,
    skippedCount,
    errorCount,
  });
}

async function main() {
  await resolvePendingAttestations();
}

if (import.meta.main) {
  await main();
}
