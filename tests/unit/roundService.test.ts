import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  validateFutureScheduleUpdates,
  validateSchedule,
} from "../../src/services/roundService.ts";
import { BadRequestError } from "../../src/errors/generic.ts";

Deno.test("validateSchedule should return true for a valid schedule", () => {
  const now = new Date();
  const schedule = {
    applicationPeriodStart: new Date(now.getTime() + 1000 * 60 * 60 * 24),
    applicationPeriodEnd: new Date(now.getTime() + 1000 * 60 * 60 * 48),
    votingPeriodStart: new Date(now.getTime() + 1000 * 60 * 60 * 72),
    votingPeriodEnd: new Date(now.getTime() + 1000 * 60 * 60 * 96),
    resultsPeriodStart: new Date(now.getTime() + 1000 * 60 * 60 * 120),
  };
  assertEquals(validateSchedule(schedule), true);
});

Deno.test("validateSchedule should throw if application end is before start", () => {
  const now = new Date();
  const schedule = {
    applicationPeriodStart: new Date(now.getTime() + 1000 * 60 * 60 * 48),
    applicationPeriodEnd: new Date(now.getTime() + 1000 * 60 * 60 * 24),
    votingPeriodStart: new Date(now.getTime() + 1000 * 60 * 60 * 72),
    votingPeriodEnd: new Date(now.getTime() + 1000 * 60 * 60 * 96),
    resultsPeriodStart: new Date(now.getTime() + 1000 * 60 * 60 * 120),
  };
  assertThrows(
    () => validateSchedule(schedule),
    BadRequestError,
    "Application period start must be before end.",
  );
  assertEquals(validateSchedule(schedule, false), false);
});

Deno.test("validateSchedule should throw if voting start is before application end", () => {
  const now = new Date();
  const schedule = {
    applicationPeriodStart: new Date(now.getTime() + 1000 * 60 * 60 * 24),
    applicationPeriodEnd: new Date(now.getTime() + 1000 * 60 * 60 * 72),
    votingPeriodStart: new Date(now.getTime() + 1000 * 60 * 60 * 48),
    votingPeriodEnd: new Date(now.getTime() + 1000 * 60 * 60 * 96),
    resultsPeriodStart: new Date(now.getTime() + 1000 * 60 * 60 * 120),
  };
  assertThrows(
    () => validateSchedule(schedule),
    BadRequestError,
    "Voting period must start after application period ends.",
  );
  assertEquals(validateSchedule(schedule, false), false);
});

Deno.test("validateSchedule should throw if dates are in the past", () => {
  const now = new Date();
  const schedule = {
    applicationPeriodStart: new Date(now.getTime() - 1000 * 60 * 60 * 120),
    applicationPeriodEnd: new Date(now.getTime() - 1000 * 60 * 60 * 96),
    votingPeriodStart: new Date(now.getTime() - 1000 * 60 * 60 * 72),
    votingPeriodEnd: new Date(now.getTime() - 1000 * 60 * 60 * 48),
    resultsPeriodStart: new Date(now.getTime() - 1000 * 60 * 60 * 24),
  };
  assertThrows(
    () => validateSchedule(schedule),
    BadRequestError,
    "All dates must be in the future.",
  );
  assertEquals(validateSchedule(schedule, false), false);
});

Deno.test("validateFutureScheduleUpdates allows updating future timestamps", () => {
  const now = new Date();
  const schedule = {
    applicationPeriodStart: new Date(now.getTime() + 1000 * 60 * 10),
    applicationPeriodEnd: new Date(now.getTime() + 1000 * 60 * 30),
    votingPeriodStart: new Date(now.getTime() + 1000 * 60 * 60),
    votingPeriodEnd: new Date(now.getTime() + 1000 * 60 * 90),
    resultsPeriodStart: new Date(now.getTime() + 1000 * 60 * 120),
  };

  const nextEnd = new Date(now.getTime() + 1000 * 60 * 45);

  validateFutureScheduleUpdates(
    schedule,
    {
      applicationPeriodEnd: nextEnd,
    },
    now,
  );
});

Deno.test("validateFutureScheduleUpdates rejects updates to past timestamps", () => {
  const now = new Date();
  const schedule = {
    applicationPeriodStart: new Date(now.getTime() - 1000 * 60 * 30),
    applicationPeriodEnd: new Date(now.getTime() + 1000 * 60 * 30),
    votingPeriodStart: new Date(now.getTime() + 1000 * 60 * 60),
    votingPeriodEnd: new Date(now.getTime() + 1000 * 60 * 90),
    resultsPeriodStart: new Date(now.getTime() + 1000 * 60 * 120),
  };

  assertThrows(
    () =>
      validateFutureScheduleUpdates(
        schedule,
        {
          applicationPeriodStart: new Date(now.getTime() + 1000 * 60 * 15),
        },
        now,
      ),
    BadRequestError,
    "Cannot update applicationPeriodStart because it is in the past.",
  );
});

Deno.test("validateFutureScheduleUpdates rejects updates not in the future", () => {
  const now = new Date();
  const schedule = {
    applicationPeriodStart: new Date(now.getTime() + 1000 * 60 * 10),
    applicationPeriodEnd: new Date(now.getTime() + 1000 * 60 * 30),
    votingPeriodStart: new Date(now.getTime() + 1000 * 60 * 60),
    votingPeriodEnd: new Date(now.getTime() + 1000 * 60 * 90),
    resultsPeriodStart: new Date(now.getTime() + 1000 * 60 * 120),
  };

  assertThrows(
    () =>
      validateFutureScheduleUpdates(
        schedule,
        {
          applicationPeriodEnd: new Date(now.getTime()),
        },
        now,
      ),
    BadRequestError,
    "applicationPeriodEnd must be in the future.",
  );
});

Deno.test("validateFutureScheduleUpdates enforces chronological order", () => {
  const now = new Date();
  const schedule = {
    applicationPeriodStart: new Date(now.getTime() + 1000 * 60 * 10),
    applicationPeriodEnd: new Date(now.getTime() + 1000 * 60 * 30),
    votingPeriodStart: new Date(now.getTime() + 1000 * 60 * 60),
    votingPeriodEnd: new Date(now.getTime() + 1000 * 60 * 90),
    resultsPeriodStart: new Date(now.getTime() + 1000 * 60 * 120),
  };

  assertThrows(
    () =>
      validateFutureScheduleUpdates(
        schedule,
        {
          applicationPeriodEnd: new Date(now.getTime() + 1000 * 60 * 80),
        },
        now,
      ),
    BadRequestError,
    "Voting period must start after application period ends.",
  );
});
