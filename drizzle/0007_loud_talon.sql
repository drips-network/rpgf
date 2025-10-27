ALTER TABLE "application_answers" ALTER COLUMN "answer" DROP NOT NULL;--> statement-breakpoint

ALTER TABLE "application_answers" ADD COLUMN "order" integer;

UPDATE "application_answers"
SET "order" = "application_form_fields"."order"
FROM "application_form_fields"
WHERE "application_answers"."field_id" = "application_form_fields"."id";

ALTER TABLE "application_answers" ALTER COLUMN "order" SET NOT NULL;

INSERT INTO "application_answers" ("application_version_id", "field_id", "answer", "order")
SELECT
    av.id AS application_version_id,
    aff.id AS field_id,
    NULL AS answer,
    aff.order
FROM
    application_versions av
JOIN
    application_form_fields aff ON av.form_id = aff.form_id
LEFT JOIN
    application_answers aa ON aa.application_version_id = av.id AND aa.field_id = aff.id
WHERE
    aff.slug IS NOT NULL
    AND aff.deleted_at IS NULL
    AND aa.field_id IS NULL;
