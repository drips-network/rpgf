import { CreateRoundDto, PatchRoundDto } from "./round.ts";
import { ApplicationReviewDto, CreateApplicationDto, UpdateApplicationDto } from "./application.ts";
import { ResultCalculationMethod } from "../services/resultsService.ts";
import { SubmitBallotDto } from "./ballot.ts";
import { SetRoundAdminsDto } from "./roundAdmin.ts";
import { SetRoundVotersDto } from "./roundVoter.ts";
import { CreateApplicationCategoryDto } from "./applicationCategory.ts";
import { CreateApplicationFormDto } from "./applicationForm.ts";
import { KycProvider, KycStatus } from "./kyc.ts";

type RoundCreatedPayload = CreateRoundDto;
type RoundSettingsChangedPayload = PatchRoundDto;
type RoundAdminsChangedPayload = SetRoundAdminsDto;
type RoundVotersChangedPayload = SetRoundVotersDto;
type RoundPublishedPayload = null;
type RoundDeletedPayload = null;

type ApplicationSubmittedPayload = CreateApplicationDto & { id: string };
type ApplicationUpdatedPayload = UpdateApplicationDto & { id: string };
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

type KycRequestCreatedPayload = { kycRequestId: string };
type KycRequestLinkedToApplicationPayload = { applicationId: string, kycRequestId: string };
type KycRequestUpdatedPayload = { kycRequestId: string, previousStatus: KycStatus, newStatus: KycStatus };

export enum AuditLogAction {
  RoundCreated = "round_created",
  RoundSettingsChanged = "round_settings_changed",
  RoundAdminsChanged = "round_admins_changed",
  RoundVotersChanged = "round_voters_changed",
  RoundPublished = "round_published",
  RoundDeleted = "round_deleted",

  ApplicationSubmitted = "application_submitted",
  ApplicationUpdated = "application_updated",
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

  KycRequestCreated = "kyc_request_created",
  KycRequestLinkedToApplication = "kyc_request_linked_to_application",
  KycRequestUpdated = "kyc_request_updated",
}

export type PayloadByAction = {
  [AuditLogAction.RoundCreated]: RoundCreatedPayload;
  [AuditLogAction.RoundSettingsChanged]: RoundSettingsChangedPayload;
  [AuditLogAction.RoundAdminsChanged]: RoundAdminsChangedPayload;
  [AuditLogAction.RoundVotersChanged]: RoundVotersChangedPayload;
  [AuditLogAction.RoundPublished]: RoundPublishedPayload;
  [AuditLogAction.RoundDeleted]: RoundDeletedPayload;

  [AuditLogAction.ApplicationSubmitted]: ApplicationSubmittedPayload;
  [AuditLogAction.ApplicationUpdated]: ApplicationUpdatedPayload;
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

  [AuditLogAction.KycRequestCreated]: KycRequestCreatedPayload;
  [AuditLogAction.KycRequestLinkedToApplication]: KycRequestLinkedToApplicationPayload;
  [AuditLogAction.KycRequestUpdated]: KycRequestUpdatedPayload;  
};

export enum AuditLogActorType {
  User = "user",
  System = "system",
  KycProvider = "kyc-provider",
}

export interface AuditLogUserActor {
  type: AuditLogActorType.User;
  walletAddress: string;
  userId: string;
}
export interface AuditLogSystemActor {
  type: AuditLogActorType.System;
}
export interface AuditLogKycProviderActor {
  type: AuditLogActorType.KycProvider;
  provider: KycProvider;
}

export type AuditLogActor = AuditLogUserActor | AuditLogSystemActor | AuditLogKycProviderActor;

export type AuditLog<TAction extends AuditLogAction> = {
  id: number;
  actor: {
    type: AuditLogActorType.User;
    walletAddress: string;
  } | {
    type: AuditLogActorType.System;
  } | {
    type: AuditLogActorType.KycProvider;
    provider: KycProvider;
  };
  action: TAction;
  payload: PayloadByAction[TAction];
  createdAt: Date;
};
