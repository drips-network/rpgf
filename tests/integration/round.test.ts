// deno-lint-ignore-file no-explicit-any
import {
  assertEquals,
  assertExists,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CreateRoundDto } from "$app/types/round.ts";
import { getAuthToken } from "../helpers/auth.ts";
import withSuperOakApp from "../helpers/withSuperOakApp.ts";
import { CreateApplicationDto } from "../../src/types/application.ts";
import { SetRoundVotersDto } from "$app/types/roundVoter.ts";
import { CreateApplicationFormDto } from "$app/types/applicationForm.ts";
import { CreateApplicationCategoryDto } from "$app/types/applicationCategory.ts";
import { db } from "$app/db/postgres.ts";
import { roundAdmins, users } from "$app/db/schema.ts";
import { assert } from "node:console";
import { ethers } from "ethers";
import { Stub, stub } from "jsr:@std/testing@1.0.15/mock";
import projects from '$app/gql/projects.ts';
import { assertFalse } from "https://deno.land/std@0.224.0/assert/assert_false.ts";
import { and, eq } from "drizzle-orm";
import { signBallot } from "../helpers/ballot.ts";
import { Ballot } from "$app/types/ballot.ts";

Deno.test("Round lifecycle", { sanitizeOps: false, sanitizeResources: false }, async (t) => {
  const adminWallet = ethers.Wallet.createRandom();
  const authToken = await getAuthToken(adminWallet);

  let roundId: string;

  await t.step("should create a new round", async () => {
    const createRoundDto: CreateRoundDto = {
      name: "Test Round",
      description: "A round for testing purposes",
      urlSlug: "test-round",
      chainId: 1,
      applicationPeriodStart: new Date(Date.now() + 3600000).toISOString(),
      applicationPeriodEnd: new Date(Date.now() + 7200000).toISOString(),
      votingPeriodStart: new Date(Date.now() + 10800000).toISOString(),
      votingPeriodEnd: new Date(Date.now() + 14400000).toISOString(),
      resultsPeriodStart: new Date(Date.now() + 18000000).toISOString(),
      maxVotesPerVoter: 100,
      maxVotesPerProjectPerVoter: 10,
      minVotesPerProjectPerVoter: null,
      emoji: "🎉",
      color: "#27C537",
      voterGuidelinesLink: "https://example.com/guidelines",
      customAvatarCid: null,
      draft: true,
      kycProvider: null,
    };

    const response = await withSuperOakApp((request) =>
      request
        .put("/api/rounds")
        .set("Authorization", `Bearer ${authToken}`)
        .send(createRoundDto)
        .expect(200)
    );

    assertEquals(response.body.name, "Test Round");
    assertExists(response.body.id);
    roundId = response.body.id;
  });

  await t.step("should allow clearing optional fields via patch", async () => {
    const patchResponse = await withSuperOakApp((request) =>
      request
        .patch(`/api/rounds/${roundId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          description: null,
          voterGuidelinesLink: null,
        })
        .expect(200)
    );

    assertEquals(patchResponse.body.description, null);
    assertEquals(patchResponse.body.voterGuidelinesLink, null);

    const adminRound = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200)
    );

    assertEquals(adminRound.body.description, null);
    assertEquals(adminRound.body.voterGuidelinesLink, null);
  });

  await t.step("should not list the round in public listing since it's not yet published", async () => {
    const response = await withSuperOakApp((request) =>
      request
        .get("/api/rounds")
        .expect(200)
    );

    assert(response.body.find((r: any) => r.id === roundId) === undefined);
  });

  await t.step("should refuse to return a non-published round", async () => {
    await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}`)
        .expect(404)
    );
  });

  await t.step("should reject publishing the round without an application form", async () => {
    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/publish`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(400)
    );
  });

  await t.step("should refuse to create an application form with invalid fields", async () => {
    const invalidForm = {
      name: "Invalid Form",
      fields: [
        {
          // Invalid type
          type: 'pooperoni',
          label: '',
          slug: 'slug',
          descriptionMd: 'Description',
          required: true,
          private: false,
        },
      ],
    };
    await withSuperOakApp((request) =>
      request
        .put(`/api/rounds/${roundId}/application-forms`)
        .set("Authorization", `Bearer ${authToken}`)
        .send(invalidForm)
        .expect(400)
    );
  });

  await t.step("should refuse to create an application form with duplicate slugs", async () => {
    const invalidForm = {
      name: "Invalid Form",
      fields: [
        {
          type: 'text',
          label: 'Some text field',
          slug: 'duplicate-slug',
          descriptionMd: 'Description',
          required: true,
          private: false,
        },
        {
          type: 'textarea',
          label: 'Description',
          slug: 'duplicate-slug', // Duplicate slug
          descriptionMd: 'Description',
          required: true,
          private: false,
        },
      ],
    };
    await withSuperOakApp((request) =>
      request
        .put(`/api/rounds/${roundId}/application-forms`)
        .set("Authorization", `Bearer ${authToken}`)
        .send(invalidForm)
        .expect(400)
    );
  });

  let applicationFormId: string;
  await t.step("should create form", async () => {
    const form: CreateApplicationFormDto = {
      name: "Application Form",
      fields: [
        {
          type: 'markdown',
          content: '# Welcome to the application form',
        },
        {
          type: 'divider',
        },
        {
          type: 'text',
          label: 'Some text field',
          slug: 'some-text-field',
          descriptionMd: 'Description',
          required: true,
          private: false,
        }, 
        {
          type: 'textarea',
          label: 'Description',
          slug: 'description',
          descriptionMd: 'Description',
          required: true,
          private: false,
        },
        {
          type: 'email',
          label: 'Email address',
          slug: 'email',
          descriptionMd: 'We will never share your email.',
          required: true,
          private: true,
        },
      ],
    };

    const formRes = await withSuperOakApp((request) =>
      request
        .put(`/api/rounds/${roundId}/application-forms`)
        .set("Authorization", `Bearer ${authToken}`)
        .send(form)
        .expect(201)
    );

    assertEquals(formRes.body.name, "Application Form");
    assertEquals(formRes.body.fields.length, 5);

    applicationFormId = formRes.body.id;
  });

  await t.step("should refuse to create a form with the same name", async () => {
    const form: CreateApplicationFormDto = {
      name: "Application Form",
      fields: [
        {
          type: 'text',
          label: 'Some text field',
          slug: 'some-text-field',
          descriptionMd: 'Description',
          required: true,
          private: false,
        },
      ],
    };
    await withSuperOakApp((request) =>
      request
        .put(`/api/rounds/${roundId}/application-forms`)
        .set("Authorization", `Bearer ${authToken}`)
        .send(form)
        .expect(400)
    );
  });

  await t.step("should return the application form in listing", async () => {
    const response = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/application-forms`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200)
    );

    assertEquals(response.body[0].name, "Application Form");
    assertEquals(response.body[0].fields.length, 5);
    assertEquals(response.body[0].id, applicationFormId);
  });

  await t.step("should still refuse to publish without categories", async () => {
    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/publish`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(400)
    );
  });

  await t.step("should create categories", async () => {
    const category: CreateApplicationCategoryDto = {
      name: "Category A",
      applicationFormId,
    }

    const categoryRes = await withSuperOakApp((request) =>
      request
        .put(`/api/rounds/${roundId}/application-categories`)
        .set("Authorization", `Bearer ${authToken}`)
        .send(category)
        .expect(201)
    );

    assertEquals(categoryRes.body.name, "Category A");
    assertExists(categoryRes.body.id);
  });

  await t.step("should still refuse to publish without voters", async () => {
    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/publish`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(400)
    );
  });

  await t.step("should reject invalid ethereum addresses for voters", async () => {
    const voters: SetRoundVotersDto = {
      walletAddresses: [
        '0xPissarro',
      ]
    };

    await withSuperOakApp((request) =>
      request
        .put(`/api/rounds/${roundId}/voters`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ voters })
        .expect(400)
    );
  });

  await t.step("should create voters", async () => {
    const voters: SetRoundVotersDto = {
      walletAddresses: [
        '0xB3539Ba5a4243f5c2c9F05E8DAF7e96061A9B7B0',
        '0xf0C0638991c33567B5f068D80DEB87BaA6B886Af',
        '0x0a97820c0DbDc763Ce6dDbfD482709392a647467',
      ]
    };
    await withSuperOakApp((request) =>
      request
        .put(`/api/rounds/${roundId}/voters`)
        .set("Authorization", `Bearer ${authToken}`)
        .send(voters)
        .expect(200)
    );
  });

  await t.step("should list the voters", async () => {
    const res = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/voters`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200)
    );

    assertEquals(res.body.length, 3);
    assert(res.body.includes((v: any) => v.walletAddress === '0xB3539Ba5a4243f5c2c9F05E8DAF7e96061A9B7B0'));
  });

  await t.step("should not return voters without authentication", async () => {
    await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/voters`)
        .expect(401)
    );
  });

  await t.step("should publish the round", async () => {
    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/publish`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200)
    );
  });

  await t.step("should return the round in public listing once published", async () => {
    const response = await withSuperOakApp((request) =>
      request
        .get("/api/rounds")
        .expect(200)
    );


    assert(response.body.find((r: any) => r.id === roundId) !== undefined);
  });

  let roundSlug: string;
  await t.step("should return a published round", async () => {
    const response = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}`)
        .expect(200)
    );

    assertEquals(response.body.name, "Test Round");
    assertEquals(response.body.id, roundId);
    assertEquals(response.body.state, 'pending-intake');

    roundSlug = response.body.urlSlug;
  });

  await t.step("should dangerously force the round state", async () => {
    await withSuperOakApp((request) =>
      request
        .post(`/api/testing/force-round-state`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          roundSlug,
          desiredState: 'intake',
        })
        .expect(200)
    );

    const response = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}`)
        .expect(200)
    );

    assertEquals(response.body.state, 'intake');
  });

  const secondUserWallet = ethers.Wallet.createRandom();
  const secondUserAuthToken = await getAuthToken(secondUserWallet);
  const superAdminOverrideWallet = ethers.Wallet.createRandom();

  let applicationForm: any;
  let category: any;

  await t.step("should return categories and forms to another user", async () => {
    const formRes = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/application-forms`)
        .set("Authorization", `Bearer ${secondUserAuthToken}`)
        .expect(200)
    );

    assertEquals(formRes.body.length, 1);
    assertEquals(formRes.body[0].name, "Application Form");
    assertEquals(formRes.body[0].fields.length, 5);
    assertEquals(formRes.body[0].id, applicationFormId);

    applicationForm = formRes.body[0];

    const categoryRes = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/application-categories`)
        .set("Authorization", `Bearer ${secondUserAuthToken}`)
        .expect(200)
    );

    assertEquals(categoryRes.body.length, 1);
    assertEquals(categoryRes.body[0].name, "Category A");

    category = categoryRes.body[0];
  });

  let applicationId: string;
  await t.step("should submit an application if valid", async () => {
    const createApplicationDto: CreateApplicationDto = {
      projectName: "Test Project",
      dripsAccountId: "123",
      categoryId: category.id,
      answers: [
        {
          fieldId: applicationForm.fields[2].id,
          value: "Some answer",
        },
        {
          fieldId: applicationForm.fields[3].id,
          value: "This is my project description.",
        },
        {
          fieldId: applicationForm.fields[4].id,
          value: "test@testerson.com",
        },
      ]
    };

    const getProjectsStub = stub(projects, 'getProject', () => {
      console.log("WE STUBBING");

      return Promise.resolve({
        gitHubUrl: 'foo.bar',
        avatar: {
          emoji: '🌚',
        },
        color: '#000000',
        owner: {
          address: secondUserWallet.address,
        }
      });
    });

    // ensure it rejects application from user that does not own the project
    await withSuperOakApp((request) =>
      request
        .put(`/api/rounds/${roundId}/applications`)
        .set("Authorization", `Bearer ${authToken}`) // Note: using the first user's auth token
        .send(createApplicationDto)
        .expect(400)
    );

    // ensure it rejects invalid fields
    await withSuperOakApp((request) =>
      request
        .put(`/api/rounds/${roundId}/applications`)
        .set("Authorization", `Bearer ${secondUserAuthToken}`)
        .send({
          ...createApplicationDto,
          answers: createApplicationDto.answers.slice(1), // Missing one required field
        })
        .expect(400)
    );

    // now submit properly
    const response = await withSuperOakApp((request) =>
      request
        .put(`/api/rounds/${roundId}/applications`)
        .set("Authorization", `Bearer ${secondUserAuthToken}`)
        .send(createApplicationDto)
        .expect(200)
    );

    getProjectsStub.restore();

    assertEquals(response.body.projectName, "Test Project");
    assertEquals(response.body.roundId, roundId);
    assertEquals(response.body.state, 'pending');
    assertExists(response.body.id);


    applicationId = response.body.id;
  });

  await t.step("should list the submitted application only to the applicant or admin while pending", async () => {
    const response = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/applications`)
        .set("Authorization", `Bearer ${secondUserAuthToken}`)
        .expect(200)
    );

    assertEquals(response.body.length, 1);
    assertEquals(response.body[0].id, applicationId);

    const adminResponse = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/applications`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200)
    );
    assertEquals(adminResponse.body.length, 1);
    assertEquals(adminResponse.body[0].id, applicationId);

    // ensure anon user cannot see it
    await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/applications`)
        .expect(200, [])
    );

    // ensure other users cannot see it
    await withSuperOakApp(async (request) =>
      request
        .get(`/api/rounds/${roundId}/applications`)
        .set("Authorization", `Bearer ${await getAuthToken()}`)
        .expect(200, [])
    );

    // ... and all the same tests for CSV export

    const adminCsvRes = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/applications?format=csv`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200)
    );
    assert(adminCsvRes.text.includes("Test Project"));
    assert(adminCsvRes.text.includes("some-test-field"));
    assert(adminCsvRes.text.includes("This is my project description."));
    assert(adminCsvRes.text.includes("pending"));
    // private field should be included for admins
    assert(adminCsvRes.text.includes("test@testerson.com"));

    const userCsvRes = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/applications?format=csv`)
        .set("Authorization", `Bearer ${secondUserAuthToken}`)
        .expect(200)
    );
    // should be empty
    assertFalse(userCsvRes.text.includes("Test Project"));
    assertFalse(userCsvRes.text.includes("test@testerson.com"));

    const anonCsvRes = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/applications?format=csv`)
        .expect(200)
    );
    // should be empty
    assertFalse(anonCsvRes.text.includes("Test Project"));
    assertFalse(userCsvRes.text.includes("test@testerson.com"));
  });

  await t.step("should approve the application", async () => {
    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/applications/review`)
        .set("Authorization", `Bearer ${authToken}`)
        .send([{
          applicationId,
          decision: "approve",
        }])
        .expect(200)
    );

    const response = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/applications/${applicationId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200)
    );
    assertEquals(response.body.state, "approved");
  });

  await t.step("should now return the application in listing to everyone", async () => {
    // admin listing
    const adminResponse = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/applications`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200)
    );
    assertEquals(adminResponse.body.length, 1);
    assertEquals(adminResponse.body[0].id, applicationId);
    // include private fields
    assert(adminResponse.text.includes("test@testerson.com"));

    // applicant listing
    const userResponse = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/applications`)
        .set("Authorization", `Bearer ${secondUserAuthToken}`)
        .expect(200)
    );
    assertEquals(userResponse.body.length, 1);
    assertEquals(userResponse.body[0].id, applicationId);
    // include privte fields
    assert(userResponse.text.includes("test@testerson.com"));

    // authenticated listing, random user
    const authResponse = await withSuperOakApp(async (request) =>
      request
        .get(`/api/rounds/${roundId}/applications`)
        .set("Authorization", `Bearer ${await getAuthToken()}`) // some random user
        .expect(200)
    );
    assertEquals(authResponse.body.length, 1);
    assertEquals(authResponse.body[0].id, applicationId);
    // must not include private fields
    assertFalse(authResponse.text.includes("test@testerson.com"));

    // anon listing
    const anonResponse = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/applications`)
        .expect(200)
    );
    assertEquals(anonResponse.body.length, 1);
    assertEquals(anonResponse.body[0].id, applicationId);
    // must not include private fields
    assertFalse(anonResponse.text.includes("test@testerson.com"));

    // ... and all the same tests for CSV export
  
    const adminCsvRes = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/applications?format=csv`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200)
    );
    assert(adminCsvRes.text.includes("Test Project"));
    // include private fields
    assert(adminCsvRes.text.includes("test@testerson.com"));

    const applicantCsvRes = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/applications?format=csv`)
        .set("Authorization", `Bearer ${secondUserAuthToken}`)
        .expect(200)
    );
    assert(applicantCsvRes.text.includes("Test Project"));
    // include private fields
    assert(applicantCsvRes.text.includes("test@testerson.com"));

    const randomUserCsvRes = await withSuperOakApp(async (request) =>
      request
        .get(`/api/rounds/${roundId}/applications?format=csv`)
        .set("Authorization", `Bearer ${await getAuthToken()}`) // some random user
        .expect(200)
    );
    assert(randomUserCsvRes.text.includes("Test Project"));
    // must not include private fields
    assertFalse(randomUserCsvRes.text.includes("test@testerson.com"));

    const anonCsvRes = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/applications?format=csv`)
        .expect(200)
    );
    assert(anonCsvRes.text.includes("Test Project"));
    // must not include private fields
    assertFalse(anonCsvRes.text.includes("test@testerson.com"));
  });

  await t.step("should edit the application", async () => {
    const updatedApplication: CreateApplicationDto = {
      projectName: "Test Project - Edited",
      dripsAccountId: "456",
      categoryId: category.id,
      answers: [
        {
          fieldId: applicationForm.fields[2].id,
          value: "Some answer - edited",
        },
        {
          fieldId: applicationForm.fields[3].id,
          value: "This is my project description. Edited.",
        },
        {
          fieldId: applicationForm.fields[4].id,
          value: "bro@breh.com",
        },
      ]
    };

    // ensure it rejects if the applicant doesn't own the new project
    const getProjectsStubInvalid = stub(projects, 'getProject', () => {
      return Promise.resolve({
        gitHubUrl: 'foo.bar',
        avatar: {
          emoji: '🌚',
        },
        color: '#000000',
        owner: {
          address: '0xGodIsNowhere',
        }
      });
    });

    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/applications/${applicationId}`)
        .set("Authorization", `Bearer ${secondUserAuthToken}`)
        .send(updatedApplication)
        .expect(400)
    );
    getProjectsStubInvalid.restore();

    const getProjectsStub: Stub = stub(projects, 'getProject', () => {
      return Promise.resolve({
        gitHubUrl: 'foo.bar',
        avatar: {
          emoji: '🌚',
        },
        color: '#000000',
        owner: {
          address: secondUserWallet.address,
        }
      });
    });

    // ensure it doesn't let some random user edit it
    await withSuperOakApp(async (request) =>
      request
        .post(`/api/rounds/${roundId}/applications/${applicationId}`)
        .set("Authorization", `Bearer ${await getAuthToken()}`) // some random user
        .send(updatedApplication)
        // technically should be 403 but tbh whatever
        .expect(401)
    );

    // ensure it rejects invalid fields
    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/applications/${applicationId}`)
        .set("Authorization", `Bearer ${secondUserAuthToken}`)
        .send({
          ...updatedApplication,
          answers: updatedApplication.answers.slice(1), // Missing one required field
        })
        .expect(400)
    );

    // now edit properly
    const response = await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/applications/${applicationId}`)
        .set("Authorization", `Bearer ${secondUserAuthToken}`)
        .send(updatedApplication)
        .expect(200)
    );

    getProjectsStub.restore();

    assertEquals(response.body.latestVersion.projectName, "Test Project - Edited");
    assertEquals(response.body.latestVersion.dripsAccountId, "456");

    // ensure the state is pending again
    assertEquals(response.body.state, "pending");
  });

  await t.step("should approve the edited application", async () => {
    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/applications/review`)
        .set("Authorization", `Bearer ${authToken}`)
        .send([{
          applicationId,
          decision: "approve",
        }])
        .expect(200)
    );

    const response = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/applications/${applicationId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200)
    );
    assertEquals(response.body.state, "approved");
  });

  await t.step("should return the updated data in single and list application endpoints", async () => {
    const singleAppResponse = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/applications/${applicationId}`)
        .set("Authorization", `Bearer ${secondUserAuthToken}`)
        .expect(200)
    );
    assertEquals(singleAppResponse.body.latestVersion.projectName, "Test Project - Edited");

    const listAppResponse = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/applications`)
        .set("Authorization", `Bearer ${secondUserAuthToken}`)
        .expect(200)
    );
    const appInList = listAppResponse.body.find((app: any) => app.id === applicationId);
    assertEquals(appInList.projectName, "Test Project - Edited");
  });

  await t.step("should return history of the application", async () => {
    const history = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/applications/${applicationId}/history`)
        .set("Authorization", `Bearer ${secondUserAuthToken}`)
        .expect(200)
    );

    assertEquals(history.body.length, 2);
    assertEquals(history.body[1].projectName, "Test Project");
    assertEquals(history.body[0].projectName, "Test Project - Edited");
    // includes private fields since it's the applicant
    assert(history.text.includes("bro@breh.com"));
    assert(history.text.includes("test@testerson.com"));

    // ensure admin can see history, including private fields
    const adminHistory = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/applications/${applicationId}/history`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200)
    );
    assertEquals(adminHistory.body.length, 2);
    assertEquals(adminHistory.body[1].projectName, "Test Project");
    assertEquals(adminHistory.body[0].projectName, "Test Project - Edited");
    // includes private fields since it's the admin
    assert(adminHistory.text.includes("bro@breh.com"));
    assert(adminHistory.text.includes("test@testerson.com"));

    // ensure some random user can see history, but w/o private fields
    const randomUserHistory = await withSuperOakApp(async (request) =>
      request
        .get(`/api/rounds/${roundId}/applications/${applicationId}/history`)
        .set("Authorization", `Bearer ${await getAuthToken()}`) // some random user
        .expect(200)
    );
    assertEquals(randomUserHistory.body.length, 2);
    assertEquals(randomUserHistory.body[1].projectName, "Test Project");
    assertEquals(randomUserHistory.body[0].projectName, "Test Project - Edited");
    // must not include private fields
    assertFalse(randomUserHistory.text.includes("bro@breh.com"));
    assertFalse(randomUserHistory.text.includes("test@testerson.com"));

    // ensure anon user can see history, but w/o private fields
    const anonHistory = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/applications/${applicationId}/history`)
        .expect(200)
    );
    assertEquals(anonHistory.body.length, 2);
    assertEquals(anonHistory.body[1].projectName, "Test Project");
    assertEquals(anonHistory.body[0].projectName, "Test Project - Edited");
    // must not include private fields
    assertFalse(anonHistory.text.includes("bro@breh.com"));
    assertFalse(anonHistory.text.includes("test@testerson.com"));
  });

  const voterWallet = ethers.Wallet.createRandom();
  const voterAuthToken = await getAuthToken(voterWallet);

  await t.step("should submit a ballot via CSV", async () => {
    const voters: SetRoundVotersDto = {
      walletAddresses: [
        '0xB3539Ba5a4243f5c2c9F05E8DAF7e96061A9B7B0',
        '0xf0C0638991c33567B5f068D80DEB87BaA6B886Af',
        '0x0a97820c0DbDc763Ce6dDbfD482709392a647467',
        voterWallet.address,
      ]
    };
    await withSuperOakApp((request) =>
      request
        .put(`/api/rounds/${roundId}/voters`)
        .set("Authorization", `Bearer ${authToken}`)
        .send(voters)
        .expect(200)
    );

    await withSuperOakApp((request) =>
      request
        .post(`/api/testing/force-round-state`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          roundSlug,
          desiredState: 'voting',
        })
        .expect(200)
    );

    const csv = `ID,Allocation\n${applicationId},10`;
    const ballot: Ballot = { [applicationId]: 10 };
    const chainId = 1;
    const signature = await signBallot(voterWallet, ballot, chainId);

    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/ballots/spreadsheet?format=csv&signature=${encodeURIComponent(signature)}&chainId=${chainId}`)
        .set("Authorization", `Bearer ${voterAuthToken}`)
        .send(csv)
        .expect(200)
    );

    const response = await withSuperOakApp((request) =>
      request
        .get(`/api/rounds/${roundId}/ballots/own`)
        .set("Authorization", `Bearer ${voterAuthToken}`)
        .expect(200)
    );

    assertEquals(response.body.ballot[applicationId], 10);
  });

  await t.step("should reject submitterOverride unless requester is super admin", async () => {
    const overrideProjectStub: Stub = stub(projects, "getProject", () => {
      return Promise.resolve({
        gitHubUrl: "bar.baz",
        avatar: {
          emoji: "🌞",
        },
        color: "#123456",
        owner: {
          address: superAdminOverrideWallet.address,
        },
      });
    });

    try {
      const overrideApplicationDto: CreateApplicationDto = {
        projectName: "Super Admin Project",
        dripsAccountId: "987",
        categoryId: category.id,
        answers: [
          {
            fieldId: applicationForm.fields[2].id,
            value: "Super admin answer",
          },
          {
            fieldId: applicationForm.fields[3].id,
            value: "This is a project submitted during voting by a super admin.",
          },
          {
            fieldId: applicationForm.fields[4].id,
            value: "override@applicant.com",
          },
        ],
        submitterOverride: superAdminOverrideWallet.address,
      };

      await withSuperOakApp((request) =>
        request
          .put(`/api/rounds/${roundId}/applications`)
          .set("Authorization", `Bearer ${authToken}`)
          .send(overrideApplicationDto)
          .expect(401)
      );

      const randomUserToken = await getAuthToken();
      await withSuperOakApp((request) =>
        request
          .put(`/api/rounds/${roundId}/applications`)
          .set("Authorization", `Bearer ${randomUserToken}`)
          .send({ ...overrideApplicationDto })
          .expect(401)
      );
    } finally {
      overrideProjectStub.restore();
    }
  });

  await t.step("should promote the admin to super admin in the database", async () => {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.walletAddress, adminWallet.address.toLowerCase()),
    });
    assertExists(adminUser);

    const [updatedAdmin] = await db.update(roundAdmins)
      .set({ superAdmin: true })
      .where(and(
        eq(roundAdmins.roundId, roundId),
        eq(roundAdmins.userId, adminUser.id),
      ))
      .returning();

    assertExists(updatedAdmin);
    assertEquals(updatedAdmin.superAdmin, true);
  });

  await t.step("should allow a super admin to submit on behalf during voting", async () => {
    const overrideApplicationDto: CreateApplicationDto = {
      projectName: "Super Admin Project",
      dripsAccountId: "987",
      categoryId: category.id,
      answers: [
        {
          fieldId: applicationForm.fields[2].id,
          value: "Super admin answer",
        },
        {
          fieldId: applicationForm.fields[3].id,
          value: "This is a project submitted during voting by a super admin.",
        },
        {
          fieldId: applicationForm.fields[4].id,
          value: "override@applicant.com",
        },
      ],
      submitterOverride: superAdminOverrideWallet.address,
    };

    const overrideProjectStub: Stub = stub(projects, "getProject", () => {
      return Promise.resolve({
        gitHubUrl: "bar.baz",
        avatar: {
          emoji: "🌞",
        },
        color: "#123456",
        owner: {
          address: superAdminOverrideWallet.address,
        },
      });
    });

    try {
      const response = await withSuperOakApp((request) =>
        request
          .put(`/api/rounds/${roundId}/applications`)
          .set("Authorization", `Bearer ${authToken}`)
          .send(overrideApplicationDto)
          .expect(200)
      );

      assertEquals(response.body.projectName, "Super Admin Project");
      assertEquals(response.body.state, "pending");
      assertNotEquals(
        adminWallet.address.toLowerCase(),
        superAdminOverrideWallet.address.toLowerCase(),
      );
      assertNotEquals(
        response.body.submitter.walletAddress.toLowerCase(),
        adminWallet.address.toLowerCase(),
      );
      assertEquals(
        response.body.submitter.walletAddress.toLowerCase(),
        superAdminOverrideWallet.address.toLowerCase(),
      );
    } finally {
      overrideProjectStub.restore();
    }
  });

  await t.step("should reject ballot from non-voter", async () => {
    const nonVoterWallet = ethers.Wallet.createRandom();
    const nonVoterAuthToken = await getAuthToken(nonVoterWallet);

    const csv = `ID,Allocation\n${applicationId},10`;
    const ballot: Ballot = { [applicationId]: 10 };
    const chainId = 1;
    const signature = await signBallot(nonVoterWallet, ballot, chainId);

    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/ballots/spreadsheet?format=csv&signature=${encodeURIComponent(signature)}&chainId=${chainId}`)
        .set("Authorization", `Bearer ${nonVoterAuthToken}`)
        .send(csv)
        .expect(401)
    );
  });

  await t.step("should reject ballot in wrong round state", async () => {
    await withSuperOakApp((request) =>
      request
        .post(`/api/testing/force-round-state`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          roundSlug,
          desiredState: 'intake',
        })
        .expect(200)
    );

    const csv = `ID,Allocation\n${applicationId},10`;
    const ballot: Ballot = { [applicationId]: 10 };
    const chainId = 1;
    const signature = await signBallot(voterWallet, ballot, chainId);

    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/ballots/spreadsheet?format=csv&signature=${encodeURIComponent(signature)}&chainId=${chainId}`)
        .set("Authorization", `Bearer ${voterAuthToken}`)
        .send(csv)
        .expect(400)
    );

    await withSuperOakApp((request) =>
      request
        .post(`/api/testing/force-round-state`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          roundSlug,
          desiredState: 'voting',
        })
        .expect(200)
    );
  });

  await t.step("should reject unauthenticated ballot submission", async () => {
    const csv = `ID,Allocation\n${applicationId},10`;
    const ballot: Ballot = { [applicationId]: 10 };
    const chainId = 1;
    // Use voterWallet to sign even though we won't authenticate
    const signature = await signBallot(voterWallet, ballot, chainId);

    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/ballots/spreadsheet?format=csv&signature=${encodeURIComponent(signature)}&chainId=${chainId}`)
        .send(csv)
        .expect(401)
    );
  });

  await t.step("should reject ballot submission without signature", async () => {
    const csv = `ID,Allocation\n${applicationId},10`;

    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/ballots/spreadsheet?format=csv`)
        .set("Authorization", `Bearer ${voterAuthToken}`)
        .send(csv)
        .expect(400)
    );
  });

  await t.step("should reject ballot submission with invalid signature", async () => {
    const csv = `ID,Allocation\n${applicationId},10`;
    const ballot: Ballot = { [applicationId]: 10 };
    const chainId = 1;

    // Sign with a different wallet to create a valid signature format but wrong signer
    const wrongWallet = ethers.Wallet.createRandom();
    const invalidSignature = await signBallot(wrongWallet, ballot, chainId);

    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/ballots/spreadsheet?format=csv&signature=${encodeURIComponent(invalidSignature)}&chainId=${chainId}`)
        .set("Authorization", `Bearer ${voterAuthToken}`)
        .send(csv)
        .expect(401)
    );
  });

  await t.step("should reject ballot with invalid content", async () => {
    await withSuperOakApp((request) =>
      request
        .post(`/api/testing/force-round-state`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          roundSlug,
          desiredState: 'voting',
        })
        .expect(200)
    );

    const chainId = 1;


    // Exceeding total vote limit
    let csv = `ID,Allocation\n${applicationId},101`;
    let ballot: Ballot = { [applicationId]: 101 };
    let signature = await signBallot(voterWallet, ballot, chainId);
    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/ballots/spreadsheet?format=csv&signature=${encodeURIComponent(signature)}&chainId=${chainId}`)
        .set("Authorization", `Bearer ${voterAuthToken}`)
        .send(csv)
        .expect(400)
    );

    console.log("foo-2");

    // Exceeding per-project vote limit
    csv = `ID,Allocation\n${applicationId},11`;
    ballot = { [applicationId]: 11 };
    signature = await signBallot(voterWallet, ballot, chainId);
    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/ballots/spreadsheet?format=csv&signature=${encodeURIComponent(signature)}&chainId=${chainId}`)
        .set("Authorization", `Bearer ${voterAuthToken}`)
        .send(csv)
        .expect(400)
    );

    console.log("foo-3");

    // Voting for a non-existent application
    csv = `ID,Allocation\nbc7534eb-acd3-43f0-952a-4a431e1b1065,10`;
    ballot = { "bc7534eb-acd3-43f0-952a-4a431e1b1065": 10 };
    signature = await signBallot(voterWallet, ballot, chainId);
    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/ballots/spreadsheet?format=csv&signature=${encodeURIComponent(signature)}&chainId=${chainId}`)
        .set("Authorization", `Bearer ${voterAuthToken}`)
        .send(csv)
        .expect(400)
    );

    console.log("foo-4");

    // Empty ballot
    csv = `ID,Allocation\n`;
    ballot = {};
    signature = await signBallot(voterWallet, ballot, chainId);
    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/ballots/spreadsheet?format=csv&signature=${encodeURIComponent(signature)}&chainId=${chainId}`)
        .set("Authorization", `Bearer ${voterAuthToken}`)
        .send(csv)
        .expect(400)
    );

    console.log("foo-5");

    // Negative allocation - this should fail at CSV parsing before signature validation
    csv = `ID,Allocation\n${applicationId},-10`;
    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/ballots/spreadsheet?format=csv&signature=dummy&chainId=${chainId}`)
        .set("Authorization", `Bearer ${voterAuthToken}`)
        .send(csv)
        .expect(400)
    );
  });

  await t.step("should reject ballot with invalid CSV format", async () => {
    const chainId = 1;

    // Missing required columns - fails at CSV parsing, signature not needed
    let csv = `ID\n${applicationId}`;
    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/ballots/spreadsheet?format=csv&signature=dummysig&chainId=${chainId}`)
        .set("Authorization", `Bearer ${voterAuthToken}`)
        .send(csv)
        .expect(400)
    );

    // Invalid data types - fails at CSV parsing, signature not needed
    csv = `ID,Allocation\nnot-a-uuid,10`;
    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/ballots/spreadsheet?format=csv&signature=dummysig&chainId=${chainId}`)
        .set("Authorization", `Bearer ${voterAuthToken}`)
        .send(csv)
        .expect(400)
    );

    csv = `ID,Allocation\n${applicationId},not-a-number`;
    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/ballots/spreadsheet?format=csv&signature=dummysig&chainId=${chainId}`)
        .set("Authorization", `Bearer ${voterAuthToken}`)
        .send(csv)
        .expect(400)
    );
  });

  await t.step("should parse ballot from CSV spreadsheet", async () => {
    const csv = `ID,Allocation\n${applicationId},10`;

    const response = await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/ballots/parse-spreadsheet?format=csv`)
        .set("Authorization", `Bearer ${voterAuthToken}`)
        .send(csv)
        .expect(200)
    );

    assertEquals(response.body.ballot[applicationId], 10);
    assertEquals(Object.keys(response.body.ballot).length, 1);
  });

  await t.step("should parse ballot and filter out zero allocations", async () => {
    const csv = `ID,Allocation\n${applicationId},10\n${applicationId},0`;

    const response = await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/ballots/parse-spreadsheet?format=csv`)
        .set("Authorization", `Bearer ${voterAuthToken}`)
        .send(csv)
        .expect(200)
    );

    // Only non-zero allocations should be included
    assertEquals(response.body.ballot[applicationId], 10);
  });

  await t.step("should reject parse-spreadsheet with invalid format", async () => {
    const csv = `ID,Allocation\n${applicationId},10`;

    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/ballots/parse-spreadsheet?format=invalid`)
        .set("Authorization", `Bearer ${voterAuthToken}`)
        .send(csv)
        .expect(400)
    );
  });

  await t.step("should reject parse-spreadsheet with invalid CSV", async () => {
    const csv = `ID\n${applicationId}`;

    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/ballots/parse-spreadsheet?format=csv`)
        .set("Authorization", `Bearer ${voterAuthToken}`)
        .send(csv)
        .expect(400)
    );
  });

  await t.step("should reject unauthenticated parse-spreadsheet request", async () => {
    const csv = `ID,Allocation\n${applicationId},10`;

    await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/ballots/parse-spreadsheet?format=csv`)
        .send(csv)
        .expect(401)
    );
  });

  await t.step("should parse empty CSV (no allocations)", async () => {
    const csv = `ID,Allocation\n${applicationId},0`;

    const response = await withSuperOakApp((request) =>
      request
        .post(`/api/rounds/${roundId}/ballots/parse-spreadsheet?format=csv`)
        .set("Authorization", `Bearer ${voterAuthToken}`)
        .send(csv)
        .expect(200)
    );

    // Zero allocations should be filtered out
    assertEquals(response.body.ballot, {});
  });
});
