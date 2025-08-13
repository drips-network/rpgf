/** Includes functionality only intended for testing.
 * These routes are all disabled unless ENABLE_DANGEROUS_TEST_ROUTES is set to true in env */

import { eq } from "drizzle-orm";
import { db } from "../db/postgres.ts";
import { rounds } from "../db/schema.ts";
import { UnauthorizedError } from "../errors/auth.ts";
import { roundStateSchema } from "../types/round.ts";
import { UnauthenticatedAppState } from "../../main.ts";
import { Context } from "oak";
import parseDto from "../utils/parseDto.ts";
import { z } from "zod";

const ENABLE_DANGEROUS_TEST_ROUTES = Deno.env.get("ENABLE_DANGEROUS_TEST_ROUTES") === "true";

function checkDangerousRoutesEnabled() {
  if (!ENABLE_DANGEROUS_TEST_ROUTES) {
    throw new UnauthorizedError("Dangerous test routes are not enabled. Set ENABLE_DANGEROUS_TEST_ROUTES to true in your environment.");
  }
}

/** Force a round into a particular state by overriding its schedule */
export async function dangerouslyForceRoundStateController(
  ctx: Context<UnauthenticatedAppState>,
) {
  checkDangerousRoutesEnabled();

  const {
    roundSlug,
    desiredState,
  } = await parseDto(z.object({
    roundSlug: z.string(),
    desiredState: roundStateSchema
  }), ctx);

  // set the schedules such that the desired state is currently active
  // any milestones before the current state should be set to 0 time
  // any milestones ahead of the current state should be set to 10 years from now

  const beginningOfTime = new Date(0);
  const endOfTime = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 10); // 10 years from now

  let newSchedule: {
    applicationPeriodStart: Date;
    applicationPeriodEnd: Date;
    votingPeriodStart: Date;
    votingPeriodEnd: Date;
    resultsPeriodStart: Date;
  }

  switch (desiredState) {
    case 'pending-intake': {
      newSchedule = {
        applicationPeriodStart: endOfTime,
        applicationPeriodEnd: endOfTime,
        votingPeriodStart: endOfTime,
        votingPeriodEnd: endOfTime,
        resultsPeriodStart: endOfTime,
      };
      break;
    }
    case 'intake': {
      newSchedule = {
        applicationPeriodStart: beginningOfTime,
        applicationPeriodEnd: endOfTime,
        votingPeriodStart: endOfTime,
        votingPeriodEnd: endOfTime,
        resultsPeriodStart: endOfTime,
      };
      break;
    }
    case 'pending-voting': {
      newSchedule = {
        applicationPeriodStart: beginningOfTime,
        applicationPeriodEnd: beginningOfTime,
        votingPeriodStart: endOfTime,
        votingPeriodEnd: endOfTime,
        resultsPeriodStart: endOfTime,
      };
      break;
    }
    case 'voting': {
      newSchedule = {
        applicationPeriodStart: beginningOfTime,
        applicationPeriodEnd: beginningOfTime,
        votingPeriodStart: beginningOfTime,
        votingPeriodEnd: endOfTime,
        resultsPeriodStart: endOfTime,
      };
      break;
    }
    case 'pending-results': {
      newSchedule = {
        applicationPeriodStart: beginningOfTime,
        applicationPeriodEnd: beginningOfTime,
        votingPeriodStart: beginningOfTime,
        votingPeriodEnd: beginningOfTime,
        resultsPeriodStart: endOfTime,
      };
      break;
    }
    case 'results': {
      newSchedule = {
        applicationPeriodStart: beginningOfTime,
        applicationPeriodEnd: beginningOfTime,
        votingPeriodStart: beginningOfTime,
        votingPeriodEnd: beginningOfTime,
        resultsPeriodStart: beginningOfTime,
      };
      break;
    }
  }

  await db.update(rounds).set({
    applicationPeriodStart: newSchedule.applicationPeriodStart,
    applicationPeriodEnd: newSchedule.applicationPeriodEnd,
    votingPeriodStart: newSchedule.votingPeriodStart,
    votingPeriodEnd: newSchedule.votingPeriodEnd,
    resultsPeriodStart: newSchedule.resultsPeriodStart,
  }).where(eq(rounds.urlSlug, roundSlug));

  ctx.response.status = 200;
  ctx.response.body = {
    message: `Round ${roundSlug} forced into state ${desiredState}`,
  };
}
