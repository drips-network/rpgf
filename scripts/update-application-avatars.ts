import { db } from "$app/db/postgres.ts";
import { applications, applicationVersions } from "$app/db/schema.ts";
import projects, { type ProjectData } from "$app/gql/projects.ts";
import { cachingService } from "$app/services/cachingService.ts";
import { log, LogLevel } from "$app/services/loggingService.ts";
import { desc, eq } from "drizzle-orm";

function isEmojiAvatar(
  avatar: ProjectData["avatar"],
): avatar is { emoji: string } {
  return "emoji" in avatar;
}

function snapshotsEqual(
  currentSnapshot: ProjectData | undefined,
  latestSnapshot: ProjectData,
): boolean {
  if (!currentSnapshot) {
    return false;
  }

  if (currentSnapshot.color !== latestSnapshot.color) {
    return false;
  }

  if (currentSnapshot.gitHubUrl !== latestSnapshot.gitHubUrl) {
    return false;
  }

  if (
    currentSnapshot.owner.address.toLowerCase() !==
      latestSnapshot.owner.address.toLowerCase()
  ) {
    return false;
  }

  const currentAvatar = currentSnapshot.avatar;
  const latestAvatar = latestSnapshot.avatar;

  if (isEmojiAvatar(currentAvatar) && isEmojiAvatar(latestAvatar)) {
    return currentAvatar.emoji === latestAvatar.emoji;
  }

  if (!isEmojiAvatar(currentAvatar) && !isEmojiAvatar(latestAvatar)) {
    return currentAvatar.cid === latestAvatar.cid;
  }

  return false;
}

async function main() {
  log(LogLevel.Info, "Fetching applications for avatar refresh");

  const allApplications = await db.query.applications.findMany({
    with: {
      versions: {
        orderBy: desc(applicationVersions.createdAt),
      },
      round: {
        with: {
          chain: true,
        },
      },
    },
  });

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const application of allApplications) {
    const latestVersion = application.versions[0];

    if (!latestVersion) {
      skippedCount += 1;
      log(
        LogLevel.Warn,
        "Application has no versions; skipping avatar update",
        {
          applicationId: application.id,
        },
      );
      continue;
    }

    const chain = application.round?.chain;

    if (!chain) {
      skippedCount += 1;
      log(
        LogLevel.Warn,
        "Application round has no associated chain; skipping avatar update",
        {
          applicationId: application.id,
          roundId: application.roundId,
        },
      );
      continue;
    }

    try {
      const latestProjectSnapshot = await projects.getProject(
        latestVersion.dripsAccountId,
        chain.gqlName,
      );

      if (!latestProjectSnapshot) {
        skippedCount += 1;
        log(
          LogLevel.Warn,
          "Project snapshot unavailable; skipping avatar update",
          {
            applicationId: application.id,
            dripsAccountId: latestVersion.dripsAccountId,
          },
        );
        continue;
      }

      const shouldUpdate = !snapshotsEqual(
        latestVersion.dripsProjectDataSnapshot,
        latestProjectSnapshot,
      );

      if (!shouldUpdate) {
        skippedCount += 1;
        continue;
      }

      await db.transaction(async (tx) => {
        await tx.update(applications)
          .set({ dripsProjectDataSnapshot: latestProjectSnapshot })
          .where(eq(applications.id, application.id));

        await tx.update(applicationVersions)
          .set({ dripsProjectDataSnapshot: latestProjectSnapshot })
          .where(eq(applicationVersions.id, latestVersion.id));
      });

      await cachingService.delByPattern(
        cachingService.generateKey(["applications", application.roundId, "*"]),
      );
      await cachingService.delByPattern(
        cachingService.generateKey(["application", application.id, "*"]),
      );

      updatedCount += 1;
      log(LogLevel.Info, "Updated application avatar snapshot", {
        applicationId: application.id,
      });
    } catch (error) {
      errorCount += 1;
      log(LogLevel.Error, "Failed to refresh application avatar", {
        applicationId: application.id,
        error,
      });
    }
  }

  log(LogLevel.Info, "Avatar refresh completed", {
    totalApplications: allApplications.length,
    updatedCount,
    skippedCount,
    errorCount,
  });
}

if (import.meta.main) {
  await main();
}
