/**
 * Purge private applicant answers for a concluded round.
 *
 * Private answers live in `application_answers.answer` (jsonb). An answer is
 * "private" when its field (`application_form_fields.private`) is true. This
 * script nulls out those answer values in place for a single round, forgetting
 * the content while leaving the row structure (and referential integrity)
 * intact. Public API responses already drop private fields, so this is
 * invisible to non-admins; admins/submitters will simply see empty values.
 *
 * Safety:
 *  - Scoped to ONE round, passed via --round=<uuid>.
 *  - Runs a dry-run by default. Nothing is written unless --confirm is passed.
 *  - With no --round, prints the list of rounds (with private-answer counts) so
 *    you can pick one, then exits.
 *  - The write runs in a single transaction.
 *
 * Usage:
 *   deno task applications:purge-private-answers                     # list rounds
 *   deno task applications:purge-private-answers --round=<uuid>      # dry run
 *   deno task applications:purge-private-answers --round=<uuid> --confirm   # execute
 */

import { db } from "$app/db/postgres.ts";
import {
  applicationAnswers,
  applicationFormFields,
  applications,
  applicationVersions,
  rounds,
} from "$app/db/schema.ts";
import { cachingService } from "$app/services/cachingService.ts";
import { log, LogLevel } from "$app/services/loggingService.ts";
import { and, eq, isNotNull, sql } from "drizzle-orm";

function parseArgs() {
  let round: string | undefined;
  let confirm = false;

  for (const arg of Deno.args) {
    if (arg === "--confirm") {
      confirm = true;
    } else if (arg.startsWith("--round=")) {
      round = arg.slice("--round=".length).trim();
    }
  }

  return { round, confirm };
}

/** Print all rounds with a count of not-yet-purged private answers, then exit. */
async function listRounds() {
  const allRounds = await db.query.rounds.findMany({
    columns: {
      id: true,
      name: true,
      emoji: true,
      urlSlug: true,
      published: true,
      votingPeriodEnd: true,
      resultsPublished: true,
    },
    orderBy: (r, { desc }) => desc(r.createdAt),
  });

  log(LogLevel.Info, "Rounds (with remaining private-answer counts)");

  for (const round of allRounds) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(applicationAnswers)
      .innerJoin(
        applicationVersions,
        eq(applicationAnswers.applicationVersionId, applicationVersions.id),
      )
      .innerJoin(
        applications,
        eq(applicationVersions.applicationId, applications.id),
      )
      .innerJoin(
        applicationFormFields,
        eq(applicationAnswers.fieldId, applicationFormFields.id),
      )
      .where(
        and(
          eq(applications.roundId, round.id),
          eq(applicationFormFields.private, true),
          isNotNull(applicationAnswers.answer),
        ),
      );

    console.info(
      `  ${round.emoji ?? "  "} ${round.id}  ` +
        `${(round.name ?? "(unnamed)").padEnd(30)} ` +
        `slug=${round.urlSlug ?? "-"}  published=${round.published}  ` +
        `resultsPublished=${round.resultsPublished}  ` +
        `votingEnded=${round.votingPeriodEnd?.toISOString() ?? "-"}  ` +
        `privateAnswers=${count}`,
    );
  }

  log(
    LogLevel.Info,
    "Re-run with --round=<id> for a dry run, then add --confirm to execute.",
  );
}

async function main() {
  const { round: roundId, confirm } = parseArgs();

  if (!roundId) {
    await listRounds();
    return;
  }

  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    columns: { id: true, name: true, emoji: true, urlSlug: true },
  });

  if (!round) {
    log(LogLevel.Error, "No round found with that id; aborting", { roundId });
    Deno.exit(1);
  }

  // Fetch every private answer for this round (that still has a value) so we can
  // report exactly what will be purged before touching anything.
  const targets = await db
    .select({
      applicationId: applications.id,
      projectName: applications.projectName,
      versionId: applicationAnswers.applicationVersionId,
      fieldId: applicationFormFields.id,
      fieldSlug: applicationFormFields.slug,
      fieldType: applicationFormFields.type,
    })
    .from(applicationAnswers)
    .innerJoin(
      applicationVersions,
      eq(applicationAnswers.applicationVersionId, applicationVersions.id),
    )
    .innerJoin(
      applications,
      eq(applicationVersions.applicationId, applications.id),
    )
    .innerJoin(
      applicationFormFields,
      eq(applicationAnswers.fieldId, applicationFormFields.id),
    )
    .where(
      and(
        eq(applications.roundId, round.id),
        eq(applicationFormFields.private, true),
        isNotNull(applicationAnswers.answer),
      ),
    );

  const affectedApplicationIds = new Set(targets.map((t) => t.applicationId));

  const byField = new Map<string, number>();
  for (const t of targets) {
    const key = `${t.fieldType} (${t.fieldSlug ?? t.fieldId})`;
    byField.set(key, (byField.get(key) ?? 0) + 1);
  }

  log(LogLevel.Info, "Purge target summary", {
    round: { id: round.id, name: round.name, slug: round.urlSlug },
    privateAnswersToNull: targets.length,
    affectedApplications: affectedApplicationIds.size,
    byField: Object.fromEntries(byField),
  });

  if (targets.length === 0) {
    log(LogLevel.Info, "Nothing to purge for this round.");
    return;
  }

  if (!confirm) {
    log(
      LogLevel.Warn,
      "DRY RUN — no data written. Re-run with --confirm to purge.",
    );
    return;
  }

  // Execute: null out the answer value for every private field in this round.
  // Scoped through versions -> applications.round_id so only this round is
  // touched, even if a field definition were somehow shared.
  const result = await db.transaction(async (tx) => {
    return await tx.execute(sql`
      UPDATE application_answers aa
      SET answer = NULL
      FROM application_form_fields aff,
           application_versions av,
           applications a
      WHERE aa.field_id = aff.id
        AND aa.application_version_id = av.id
        AND av.application_id = a.id
        AND aff.private = true
        AND a.round_id = ${round.id}
        AND aa.answer IS NOT NULL
    `);
  });

  const rowsPurged = result.rowCount ?? targets.length;

  log(LogLevel.Info, "Private answers purged", {
    roundId: round.id,
    rowsPurged,
  });

  // Bust cached API responses that may still contain the private values
  // (admin/submitter reads are cached with the raw answers).
  await cachingService.delByPattern(
    cachingService.generateKey(["applications", round.id, "*"]),
  );
  for (const applicationId of affectedApplicationIds) {
    await cachingService.delByPattern(
      cachingService.generateKey(["application", applicationId, "*"]),
    );
  }

  log(LogLevel.Info, "Cache invalidated; purge complete", {
    roundId: round.id,
    invalidatedApplications: affectedApplicationIds.size,
  });
}

if (import.meta.main) {
  await main();
}
