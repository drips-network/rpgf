import { assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateBallot } from "../../src/services/ballotService.ts";
import { BadRequestError } from "../../src/errors/generic.ts";

Deno.test("validateBallot should throw if total votes exceed maxVotesPerVoter", () => {
  const ballot = {
    "project-1": 10,
    "project-2": 20,
  };
  const votingConfig = {
    maxVotesPerVoter: 25,
    maxVotesPerProjectPerVoter: 20,
  };
  assertThrows(
    () => validateBallot(ballot, votingConfig),
    BadRequestError,
    "Total votes exceed the maximum allowed (25)",
  );
});

Deno.test("validateBallot should throw if votes for a project exceed maxVotesPerProjectPerVoter", () => {
  const ballot = {
    "project-1": 25,
    "project-2": 10,
  };
  const votingConfig = {
    maxVotesPerVoter: 40,
    maxVotesPerProjectPerVoter: 20,
  };
  assertThrows(
    () => validateBallot(ballot, votingConfig),
    BadRequestError,
    "Votes for project project-1 exceed the maximum allowed (20)",
  );
});

Deno.test("validateBallot should not throw for a valid ballot", () => {
  const ballot = {
    "project-1": 10,
    "project-2": 15,
  };
  const votingConfig = {
    maxVotesPerVoter: 30,
    maxVotesPerProjectPerVoter: 20,
  };
  validateBallot(ballot, votingConfig);
});
