import { CreateRoundDto, PatchRoundDto } from "./round.ts";
import { ApplicationReviewDto, CreateApplicationDto } from "./application.ts";
import { ResultCalculationMethod } from "../services/resultsService.ts";
import { SubmitBallotDto } from "./ballot.ts";
import { SetRoundAdminsDto } from "./roundAdmin.ts";
import { SetRoundVotersDto } from "./roundVoter.ts";
import { CreateApplicationCategoryDto } from "./applicationCategory.ts";
import { CreateApplicationFormDto } from "./applicationForm.ts";

type RoundCreatedPayload = CreateRoundDto;
type RoundSettingsChangedPayload = PatchRoundDto;
type RoundAdminsChangedPayload = SetRoundAdminsDto;
type RoundVotersChangedPayload = SetRoundVotersDto;
type RoundPublishedPayload = null;
type RoundDeletedPayload = null;

type ApplicationSubmittedPayload = CreateApplicationDto & { id: string };
type ApplicationsReviewedPayload = ApplicationReviewDto;

type BallotSubmittedPayload = SubmitBallotDto & { id: string };
type BallotUpdatedPayload = SubmitBallotDto & { id: string };

type ResultsCalculatedPayload = {
  method: ResultCalculationMethod;
};
type ResultPublishedPayload = null;

type LinkedDripListsEditedPayload = {
  dripListAccountIds: string[];
};

type ApplicationCategoryCreatedPayload = CreateApplicationCategoryDto & { id: string };
type ApplicationCategoryUpdatedPayload = CreateApplicationCategoryDto & { id: string, previousName: string };
type ApplicationCategoryDeletedPayload = { id: string, previousName: string };

type ApplicationFormCreatedPayload = CreateApplicationFormDto & { id: string };
type ApplicationFormUpdatedPayload = CreateApplicationFormDto & { id: string };
type ApplicationFormDeletedPayload = { id: string, previousName: string };

export enum AuditLogAction {
  RoundCreated = "round_created",
  RoundSettingsChanged = "round_settings_changed",
  RoundAdminsChanged = "round_admins_changed",
  RoundVotersChanged = "round_voters_changed",
  RoundPublished = "round_published",
  RoundDeleted = "round_deleted",
  ApplicationSubmitted = "application_submitted",
  ApplicationsReviewed = "application_reviewed",
  BallotSubmitted = "ballot_submitted",
  BallotUpdated = "ballot_updated",
  ResultsCalculated = "results_calculated",
  ResultsPublished = "results_published",
  LinkedDripListsEdited = "linked_drip_lists_edited",
  ApplicationCategoryCreated = "application_category_created",
  ApplicationCategoryUpdated = "application_category_updated",
  ApplicationCategoryDeleted = "application_category_deleted",
  ApplicationFormCreated = "application_form_created",
  ApplicationFormUpdated = "application_form_updated",
  ApplicationFormDeleted = "application_form_deleted",
}

export type PayloadByAction = {
  [AuditLogAction.RoundCreated]: RoundCreatedPayload;
  [AuditLogAction.RoundSettingsChanged]: RoundSettingsChangedPayload;
  [AuditLogAction.RoundAdminsChanged]: RoundAdminsChangedPayload;
  [AuditLogAction.RoundVotersChanged]: RoundVotersChangedPayload;
  [AuditLogAction.RoundPublished]: RoundPublishedPayload;
  [AuditLogAction.RoundDeleted]: RoundDeletedPayload;
  [AuditLogAction.ApplicationSubmitted]: ApplicationSubmittedPayload;
  [AuditLogAction.ApplicationsReviewed]: ApplicationsReviewedPayload;
  [AuditLogAction.BallotSubmitted]: BallotSubmittedPayload;
  [AuditLogAction.BallotUpdated]: BallotUpdatedPayload;
  [AuditLogAction.ResultsCalculated]: ResultsCalculatedPayload;
  [AuditLogAction.ResultsPublished]: ResultPublishedPayload;
  [AuditLogAction.LinkedDripListsEdited]: LinkedDripListsEditedPayload;
  [AuditLogAction.ApplicationCategoryCreated]: ApplicationCategoryCreatedPayload;
  [AuditLogAction.ApplicationCategoryUpdated]: ApplicationCategoryUpdatedPayload;
  [AuditLogAction.ApplicationCategoryDeleted]: ApplicationCategoryDeletedPayload;
  [AuditLogAction.ApplicationFormCreated]: ApplicationFormCreatedPayload;
  [AuditLogAction.ApplicationFormUpdated]: ApplicationFormUpdatedPayload;
  [AuditLogAction.ApplicationFormDeleted]: ApplicationFormDeletedPayload;
};

export type AuditLog<TAction extends AuditLogAction> = {
  id: number;
  userWalletAddress: string;
  action: TAction;
  payload: PayloadByAction[TAction];
  createdAt: Date;
};
