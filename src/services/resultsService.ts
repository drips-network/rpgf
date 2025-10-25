// Return applications plus an extra "results" field that contains the resulting allocation given submitted ballots.
// In mean mode, the result is the mean of the votes allocated to the particular application across all ballots.
// In avg mode, the result is the average of the votes allocated to the particular application across all ballots.

import { db } from "../db/postgres.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import { results as resultsTable, rounds } from "../db/schema.ts";
import { log, LogLevel } from "./loggingService.ts";
import { eq } from "drizzle-orm";
import { getRound } from "./roundService.ts";
import { createLog } from "./auditLogService.ts";
import { AuditLogAction, AuditLogActorType } from "../types/auditLog.ts";
import { cachingService } from "./cachingService.ts";

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

/**
 * Calculate the results for a set of applications based on the provided ballots
 * and calculation method, ensuring integer outputs.
 */
function calculateResultsForApplications(
  applicationIds: string[],
  ballots: { [key: string]: number }[],
  method: ResultCalculationMethod,
): Record<string, number> {
  const results = Object.fromEntries(applicationIds.map((applicationId) => {
    const votes = ballots.map((ballot) =>
      ballot[applicationId] || 0
    );

    let result: number;

    if (method === ResultCalculationMethod.MEDIAN) {
      const sortedVotes = votes.sort((a, b) => a - b);
      const mid = Math.floor(sortedVotes.length / 2);

      if (sortedVotes.length === 0) {
        result = 0;
      } else if (sortedVotes.length % 2 === 0) {
        // Average of two middle values, rounded to the nearest integer
        result = Math.round((sortedVotes[mid - 1] + sortedVotes[mid]) / 2);
      } else {
        // Middle value is already an integer
        result = sortedVotes[mid];
      }
    } else if (method === ResultCalculationMethod.AVG) {
      if (votes.length === 0) {
        result = 0;
      } else {
        const sum = votes.reduce((acc, vote) => acc + vote, 0);
        // Round the average to the nearest integer
        result = Math.round(sum / votes.length);
      }
    } else if (method === ResultCalculationMethod.SUM) {
      // Sum is already an integer
      result = votes.reduce((acc, vote) => acc + vote, 0);
    } else {
      result = 0; // Default case
    }

    return [applicationId, result];
  }));

  return results;
}

/** For the given round, calculate results, and persist them in the `results` table for later retrieval. */
export async function recalculateResultsForRound(
  roundId: string,
  requestingUserId: string,
  method: ResultCalculationMethod,
) {
  log(LogLevel.Info, "Recalculating results for round", {
    roundId,
    requestingUserId,
    method,
  });
  await db.transaction(async (tx) => {
    const round = await getRound(roundId, requestingUserId, tx);
    if (!round) {
      log(LogLevel.Error, "Round not found", { roundId });
      throw new NotFoundError("Round not found");
    }
    if (!round.isAdmin) {
      log(LogLevel.Error, "User is not authorized to modify this round", {
        roundId,
        requestingUserId,
      });
      throw new BadRequestError("You are not authorized to modify this round");
    }

    if (!(round.state === "results" || round.state === "pending-results")) {
      log(LogLevel.Error, "Round voting hasn't concluded yet", { roundId });
      throw new BadRequestError("Round voting hasn't concluded yet");
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

    await createLog({
      type: AuditLogAction.ResultsCalculated,
      roundId: round.id,
      actor: {
        type: AuditLogActorType.User,
        userId: requestingUserId,
      },
      payload: {
        method,
      },
      tx,
    });

    await cachingService.delByPattern(
      cachingService.generateKey(["applications", roundId, "*"]),
    );
    await cachingService.del(
      applications.map((app) =>
        cachingService.generateKey(["application", app.id, "*"])
      ),
    );
  });
}

export async function publishResults(
  roundId: string,
  requestingUserId: string,
): Promise<void> {
  log(LogLevel.Info, "Publishing results", { roundId, requestingUserId });
  await db.transaction(async (tx) => {
    const round = await getRound(roundId, requestingUserId, tx);
    if (!round) {
      log(LogLevel.Error, "Round not found", { roundId });
      throw new NotFoundError("Round not found");
    }
    if (!round.isAdmin) {
      log(LogLevel.Error, "User is not authorized to modify this round", {
        roundId,
        requestingUserId,
      });
      throw new BadRequestError("You are not authorized to modify this round");
    }

    if (!round.resultsCalculated) {
      log(LogLevel.Error, "Results have not been calculated for this round", {
        roundId,
      });
      throw new BadRequestError("Results have not been calculated for this round");
    }

    // Update the round to indicate that results are published
    await tx
      .update(rounds)
      .set({ resultsPublished: true })
      .where(eq(rounds.id, round.id));

    await createLog({
      type: AuditLogAction.ResultsPublished,
      roundId: round.id,
      actor: {
        type: AuditLogActorType.User,
        userId: requestingUserId,
      },
      payload: null,
      tx,
    })
  });
}

// Equal to 100% for a Drips split receiver.
// Weights on a Drip List must add up exactly to this value.
const MAX_WEIGHT = 1_000_000;

export async function calculateDripListWeights(
  roundId: string,
  requestingUserId: string,
): Promise<{ [gitHubUrl: string]: number}> {
  log(LogLevel.Info, "Calculating drip list weights", {
    roundId,
    requestingUserId,
  });
  const round = await getRound(roundId, requestingUserId);
  if (!round) {
    log(LogLevel.Error, "Round not found", { roundId });
    throw new NotFoundError("Round not found");
  }
  if (!round.isAdmin) {
    log(LogLevel.Error, "User is not authorized to modify this round", {
      roundId,
      requestingUserId,
    });
    throw new BadRequestError("You are not authorized to modify this round");
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
    log(LogLevel.Error, "No votes allocated in this round", { roundId });
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
