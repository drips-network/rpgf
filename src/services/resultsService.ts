import { eq } from "drizzle-orm";
import { db } from "../db/postgres.ts";
import { applications, ballots } from "../db/schema.ts";

export async function getResults(roundId: string, format: "json" | "csv") {
  const submittedVotes = await db.query.ballots.findMany({
    where: eq(ballots.roundId, roundId),
  });

  const applicationsForRound = await db.query.applications.findMany({
    where: eq(applications.roundId, roundId),
  });

  const results = applicationsForRound.map((application) => {
    const votes = submittedVotes.filter(
      (vote) => vote.ballot[application.id] !== undefined,
    );
    const totalVotes = votes.reduce((acc, vote) => {
      return acc + (vote.ballot[application.id] ?? 0);
    }, 0);

    return {
      application,
      totalVotes,
    };
  });

  if (format === "csv") {
    const csvResults = results.map((result) => {
      return `${result.application.id},${result.application.projectName},${result.totalVotes}`;
    }).join("\n");

    return csvResults;
  }

  return results;
}
