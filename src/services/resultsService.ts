// Return applications plus an extra "results" field that contains the resulting allocation given submitted ballots.
// In mean mode, the result is the mean of the votes allocated to the particular application across all ballots.
// In avg mode, the result is the average of the votes allocated to the particular application across all ballots.

import { db } from "../db/postgres.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import { applications, results as resultsTable, rounds } from "../db/schema.ts";
import { asc, desc, eq } from "drizzle-orm";
import { Application } from "../types/application.ts";
import { SortConfig } from "../utils/sort.ts";

export enum ResultCalculationMethod {
  MEDIAN = "median",
  AVG = "avg",
  SUM = "sum",
}

export function isValidResultsCalculationMethod(
  method: string,
): method is ResultCalculationMethod {
  if (!Object.values(ResultCalculationMethod).includes(method as ResultCalculationMethod)) {
    return false;
  }
  return true;
}

/** Calculate the results for a set of applications based on the provided ballots and calculation method. */ 
export function calculateResultsForApplications(
  applicationIds: string[],
  ballots: { [key: string]: number }[],
  method: ResultCalculationMethod,
): Record<string, number> {
  const results = Object.fromEntries(applicationIds.map((applicationId) => {
    const votes = ballots.map((ballot) =>
      ballot[applicationId] || 0
    );

    let result;

    if (method === ResultCalculationMethod.MEDIAN) {
      result = votes
        .sort((a, b) => a - b);
      const mid = Math.floor(result.length / 2);
      if (result.length % 2 === 0) {
        result = (result[mid - 1] + result[mid]) / 2; // Average of two middle values
      } else {
        result = result[mid]; // Middle value
      }
    } else if (ResultCalculationMethod.AVG) {
      result = votes.reduce((acc, vote) => acc + vote, 0) / votes.length;
    } else if (ResultCalculationMethod.SUM) {
      result = votes.reduce((acc, vote) => acc + vote, 0);
    }

    return [applicationId, result ?? 0];
  }));

  return results;
}

/** For the given round, calculate results, and persist them in the `results` table for later retrieval. */
export async function recalculateResultsForRound(
  roundSlug: string,
  method: ResultCalculationMethod,
) {
  await db.transaction(async (tx) => {
    const round = await db.query.rounds.findFirst({
      where: (rounds, { eq }) => eq(rounds.urlSlug, roundSlug),
    });
    if (!round) {
      throw new NotFoundError("Round not found");
    }

    const applications = await db.query.applications.findMany({
      where: (applications, { eq }) => eq(applications.roundId, round.id),
      columns: {
        id: true,
      },
    });

    const ballots = await db.query.ballots.findMany({
      where: (ballots, { eq }) => eq(ballots.roundId, round.id),
      columns: {
        ballot: true,
      },
    });

    const results = calculateResultsForApplications(
      applications.map((app) => app.id),
      ballots.map((ballot) => ballot.ballot),
      method,
    );

    // Delete existing results for the round
    await tx
      .delete(resultsTable)
      .where(
        eq(resultsTable.roundId, round.id),
      );

    // Insert new results

    const resultsToInsert = Object.entries(results).map(([applicationId, result]) => ({
      roundId: round.id,
      applicationId,
      method,
      result,
    }));

    await tx
      .insert(resultsTable)
      .values(resultsToInsert);

    // Indicate on the round that results have been calculated
    await tx
      .update(rounds)
      .set({ resultsCalculated: true })
      .where(eq(rounds.id, round.id));
  });
}

export async function publishResults(
  roundSlug: string,
): Promise<void> {
  const round = await db.query.rounds.findFirst({
    where: (rounds, { eq }) => eq(rounds.urlSlug, roundSlug),
    columns: {
      id: true,
      resultsCalculated: true,
    },
  });

  if (!round) {
    throw new NotFoundError("Round not found");
  }

  if (!round.resultsCalculated) {
    throw new BadRequestError("Results have not been calculated for this round");
  }

  // Update the round to indicate that results are published
  await db
    .update(rounds)
    .set({ resultsPublished: true })
    .where(eq(rounds.id, round.id));
}
