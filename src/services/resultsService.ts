// Return applications plus an extra "results" field that contains the resulting allocation given submitted ballots.
// In mean mode, the result is the mean of the votes allocated to the particular application across all ballots.
// In avg mode, the result is the average of the votes allocated to the particular application across all ballots.

import { db } from "../db/postgres.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import { results as resultsTable, rounds } from "../db/schema.ts";
import { eq } from "drizzle-orm";

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
    } else if (method === ResultCalculationMethod.AVG) {
      result = votes.reduce((acc, vote) => acc + vote, 0) / votes.length;
    } else if (method === ResultCalculationMethod.SUM) {
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

// Equal to 100% for a Drips split receiver.
// Weights on a Drip List must add up exactly to this value.
const MAX_WEIGHT = 1_000_000;

export async function calculateDripListWeights(
  roundSlug: string,
): Promise<{ [gitHubUrl: string]: number}> {
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

  // get the results for the round
  const results = await db.query.results.findMany({
    where: (results, { eq }) => eq(results.roundId, round.id),
    columns: {
      applicationId: true,
      result: true,
    },
    with: {
      application: {
        columns: {
          dripsProjectDataSnapshot: true,
        }
      }
    }
  });

  // calculate an object where the key is the github URL, and the number is the percentage (as weight) of the total
  // votes allocated

  const totalVotes = results.reduce((acc, result) => acc + result.result, 0);
  if (totalVotes === 0) {
    throw new BadRequestError("No votes allocated in this round");
  }

  const weights: { [gitHubUrl: string]: number } = {};

  for (const result of results) {
    const gitHubUrl = result.application.dripsProjectDataSnapshot?.gitHubUrl;
    if (!gitHubUrl) {
      throw new Error(`Application ${result.applicationId} does not have a GitHub URL`);
    }

    const weight = Math.round((result.result / totalVotes) * MAX_WEIGHT);

    weights[gitHubUrl] = (weights[gitHubUrl] || 0) + weight;
  }

  // If all the weights don't add up exactly to 100%, we need to handle it by
  // slightly bumping weights until they do.

  const totalWeights = Object.values(weights).reduce((acc, weight) => acc + weight, 0);

  if (totalWeights !== MAX_WEIGHT) {
    const diff = MAX_WEIGHT - totalWeights;
    const sortedGitHubUrls = Object.keys(weights).sort((a, b) => weights[b] - weights[a]);
    
    // Distribute the difference evenly among the top receipients
    for (let i = 0; i < Math.abs(diff); i++) {
      const url = sortedGitHubUrls[i % sortedGitHubUrls.length];
      weights[url] += diff > 0 ? 1 : -1;
    }
  }

  return weights;
}
