import { createRound, createRoundAdmin } from "../helpers/round.ts";
import { createUser } from "../helpers/user.ts";
import { getAuthToken } from "../helpers/auth.ts";
import { CreateRoundDto } from "../../src/types/round.ts";
import withSuperOakApp from "../helpers/withSuperOakApp.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { assert } from "jsr:@std/assert@^1.0.13/assert";
import { CustomDataset } from "$app/types/customDataset.ts";
import { Application, CreateApplicationDto } from "$app/types/application.ts";
import { CreateApplicationFormDto } from "$app/types/applicationForm.ts";
import { CreateApplicationCategoryDto } from "$app/types/applicationCategory.ts";
import { stub } from "jsr:@std/testing@1.0.15/mock";
import projects from "$app/gql/projects.ts";
import { ethers } from "ethers";
import { SetRoundVotersDto } from "$app/types/roundVoter.ts";

Deno.test(
  "Custom Datasets",
  { sanitizeOps: false, sanitizeResources: false },
  async (t) => {
    const adminUser = await createUser();
    const roundData: CreateRoundDto = {
      draft: true,
      name: "custom dataset test round",
      emoji: "🧪",
      chainId: 1,
      color: "#27C537",
      description: "Test Description",
      applicationPeriodStart: new Date(
        Date.now() + 1000 * 60 * 60 * 24 * 1
      ).toISOString(),
      applicationPeriodEnd: new Date(
        Date.now() + 1000 * 60 * 60 * 24 * 2
      ).toISOString(),
      votingPeriodStart: new Date(
        Date.now() + 1000 * 60 * 60 * 24 * 3
      ).toISOString(),
      votingPeriodEnd: new Date(
        Date.now() + 1000 * 60 * 60 * 24 * 4
      ).toISOString(),
      resultsPeriodStart: new Date(
        Date.now() + 1000 * 60 * 60 * 24 * 5
      ).toISOString(),
      maxVotesPerVoter: 100,
      maxVotesPerProjectPerVoter: 10,
      voterGuidelinesLink: "https://example.com",
      customAvatarCid: null,
      urlSlug: "custom-dataset-test-round",
      kycProvider: null,
    };
    const round = await createRound(roundData, adminUser.id);
    await createRoundAdmin(round.id, adminUser.id);

    const authToken = await getAuthToken(adminUser.wallet);

    let dataset: CustomDataset;

    await t.step("should create a new custom dataset", async () => {
      const response = await withSuperOakApp((req) =>
        req
          .put(`/api/rounds/${round.id}/custom-datasets`)
          .set("Authorization", `Bearer ${authToken}`)
          .send({ name: "Test Dataset" })
          .expect(200)
      );

      dataset = response.body;
      assertEquals(dataset.name, "Test Dataset");
      assertEquals(dataset.roundId, round.id);
      assertEquals(dataset.rowCount, 0);

      const listingRes = await withSuperOakApp((req) =>
        req
          .get(`/api/rounds/${round.id}/custom-datasets`)
          .set("Authorization", `Bearer ${authToken}`)
          .expect(200)
      );

      assertEquals(listingRes.body.length, 1);
      assertEquals(listingRes.body[0].id, dataset.id);
    });

    await t.step(
      "should reject CSV with missing applicationId column",
      async () => {
        const csv = `foo,bar\nbaz,qux`;

        await withSuperOakApp((req) =>
          req
            .post(
              `/api/rounds/${round.id}/custom-datasets/${dataset.id}/upload`
            )
            .set("Authorization", `Bearer ${authToken}`)
            .send(csv)
            .expect(400)
        );
      }
    );

    await t.step("should reject CSV with invalid UUID", async () => {
      const csv = `applicationId,foo,bar\n${"a".repeat(36)},baz,qux`;

      await withSuperOakApp((req) =>
        req
          .post(`/api/rounds/${round.id}/custom-datasets/${dataset.id}/upload`)
          .set("Authorization", `Bearer ${authToken}`)
          .send(csv)
          .expect(400)
      );
    });

    await t.step(
      "should reject valid CSV but with unknown application IDs",
      async () => {
        const csv = `applicationId,foo,bar\n${"123e4567-e89b-12d3-a456-426614174000"},baz,qux\n${"123e4567-e89b-12d3-a456-426614174001"},foo,bar`;

        const res = await withSuperOakApp((req) =>
          req
            .post(
              `/api/rounds/${round.id}/custom-datasets/${dataset.id}/upload`
            )
            .set("Authorization", `Bearer ${authToken}`)
            .send(csv)
            .expect(400)
        );

        assert(
          res.body.error.includes(
            "Row 2: Application with ID '123e4567-e89b-12d3-a456-426614174000' not found"
          )
        );
        assert(
          res.body.error.includes(
            "Row 3: Application with ID '123e4567-e89b-12d3-a456-426614174001' not found"
          )
        );
      }
    );

    let applicationFormId: string;
    let categoryId: string;

    await t.step("should prepare the round for applications", async () => {
      // create form
      const form: CreateApplicationFormDto = {
        name: "Application Form",
        fields: [],
      };

      const formRes = await withSuperOakApp((request) =>
        request
          .put(`/api/rounds/${round.id}/application-forms`)
          .set("Authorization", `Bearer ${authToken}`)
          .send(form)
          .expect(201)
      );

      applicationFormId = formRes.body.id;

      // create category
      const category: CreateApplicationCategoryDto = {
        name: "Category A",
        applicationFormId,
      };

      const categoryRes = await withSuperOakApp((request) =>
        request
          .put(`/api/rounds/${round.id}/application-categories`)
          .set("Authorization", `Bearer ${authToken}`)
          .send(category)
          .expect(201)
      );

      categoryId = categoryRes.body.id;

      // set voter
      const voters: SetRoundVotersDto = {
        walletAddresses: ["0xB3539Ba5a4243f5c2c9F05E8DAF7e96061A9B7B0"],
      };
      await withSuperOakApp((request) =>
        request
          .put(`/api/rounds/${round.id}/voters`)
          .set("Authorization", `Bearer ${authToken}`)
          .send(voters)
          .expect(200)
      );

      // publish round
      await withSuperOakApp((request) =>
        request
          .post(`/api/rounds/${round.id}/publish`)
          .set("Authorization", `Bearer ${authToken}`)
          .expect(200)
      );

      // force into intake
      await withSuperOakApp((request) =>
        request
          .post(`/api/testing/force-round-state`)
          .send({
            roundSlug: round.urlSlug,
            desiredState: "intake",
          })
          .expect(200)
      );
    });

    const secondUserWallet = ethers.Wallet.createRandom();
    const secondUserAuthToken = await getAuthToken(secondUserWallet);

    let application: Application;
    await t.step("submit an application", async () => {
      const createApplicationDto: CreateApplicationDto = {
        projectName: "Test Project",
        dripsAccountId: "123",
        categoryId: categoryId,
        answers: [],
      };

      const getProjectsStub = stub(projects, "getProject", () => {
        return Promise.resolve({
          gitHubUrl: "foo.bar",
          avatar: {
            emoji: "🌚",
          },
          color: "#000000",
          owner: {
            address: secondUserWallet.address,
          },
        });
      });

      const res = await withSuperOakApp((request) =>
        request
          .put(`/api/rounds/${round.id}/applications`)
          .set("Authorization", `Bearer ${secondUserAuthToken}`)
          .send(createApplicationDto)
          .expect(200)
      );

      application = res.body;

      getProjectsStub.restore();
    });

    await t.step("should accept valid CSV upload", async () => {
      const csv = `applicationId,foo,bar\n${application.id},baz,qux`;

      const res = await withSuperOakApp((req) =>
        req
          .post(`/api/rounds/${round.id}/custom-datasets/${dataset.id}/upload`)
          .set("Authorization", `Bearer ${authToken}`)
          .send(csv)
          .expect(200)
      );

      assertEquals(res.body.rowCount, 1);
    });

    await t.step(
      "should not yet return the dataset for application",
      async () => {
        const res = await withSuperOakApp((req) =>
          req
            .get(`/api/rounds/${round.id}/applications/${application.id}`)
            .set("Authorization", `Bearer ${secondUserAuthToken}`)
            .expect(200)
        );

        assertEquals(res.body.customDatasetValues.length, 0);
      }
    );

    await t.step("should set the custom dataset to public", async () => {
      const res = await withSuperOakApp((req) =>
        req
          .patch(`/api/rounds/${round.id}/custom-datasets/${dataset.id}`)
          .set("Authorization", `Bearer ${authToken}`)
          .send({ isPublic: true })
          .expect(200)
      );

      assertEquals(res.body.isPublic, true);
    });

    await t.step(
      "should return the dataset values for application after dataset made public",
      async () => {
        const res = await withSuperOakApp((req) =>
          req
            .get(`/api/rounds/${round.id}/applications/${application.id}`)
            .set("Authorization", `Bearer ${secondUserAuthToken}`)
            .expect(200)
        );

        assertEquals(res.body.customDatasetValues.length, 1);
        assertEquals(res.body.customDatasetValues[0].datasetId, dataset.id);
        assertEquals(res.body.customDatasetValues[0].values, {
          foo: "baz",
          bar: "qux",
        });
      }
    );

    await t.step("should return the dataset values in CSV export", async () => {
      const adminResponse = await withSuperOakApp((request) =>
        request
          .get(`/api/rounds/${round.id}/applications?format=csv`)
          .set("Authorization", `Bearer ${authToken}`)
          .expect(200)
      );

      assert(adminResponse.text.includes("Test Dataset:foo,Test Dataset:bar"));
      assert(adminResponse.text.includes(`baz,qux`));
      assert(adminResponse.text.includes(application.id));
    });

    await t.step("should cap amount of datasets at max 5", async () => {
      await withSuperOakApp((req) =>
        req
          .put(`/api/rounds/${round.id}/custom-datasets`)
          .set("Authorization", `Bearer ${authToken}`)
          .send({ name: "Test Dataset 2" })
          .expect(200)
      );
      await withSuperOakApp((req) =>
        req
          .put(`/api/rounds/${round.id}/custom-datasets`)
          .set("Authorization", `Bearer ${authToken}`)
          .send({ name: "Test Dataset 3" })
          .expect(200)
      );
      await withSuperOakApp((req) =>
        req
          .put(`/api/rounds/${round.id}/custom-datasets`)
          .set("Authorization", `Bearer ${authToken}`)
          .send({ name: "Test Dataset 4" })
          .expect(200)
      );
      await withSuperOakApp((req) =>
        req
          .put(`/api/rounds/${round.id}/custom-datasets`)
          .set("Authorization", `Bearer ${authToken}`)
          .send({ name: "Test Dataset 5" })
          .expect(200)
      );
      await withSuperOakApp((req) =>
        req
          .put(`/api/rounds/${round.id}/custom-datasets`)
          .set("Authorization", `Bearer ${authToken}`)
          .send({ name: "Test Dataset 6" })
          .expect(400)
      );
    });

    await t.step("should cap amount of fields in dataset at 10", async () => {
      const csv = `applicationId,field1,field2,field3,field4,field5,field6,field7,field8,field9,field10,field11\n${application.id},v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11`;

      await withSuperOakApp((req) =>
        req
          .post(`/api/rounds/${round.id}/custom-datasets/${dataset.id}/upload`)
          .set("Authorization", `Bearer ${authToken}`)
          .send(csv)
          .expect(400)
      );
    });

    await t.step("should reject dataset with duplicate applicationIds", async () => {
      const csv = `applicationId,foo,bar\n${application.id},baz,qux\n${application.id},foo,bar`;

      await withSuperOakApp((req) =>
        req
          .post(`/api/rounds/${round.id}/custom-datasets/${dataset.id}/upload`)
          .set("Authorization", `Bearer ${authToken}`)
          .send(csv)
          .expect(400)
      );
    });
  }
);
