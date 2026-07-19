-- pgvector (D5, ADR-0018): the image has shipped the extension since M0;
-- this is the milestone that finally creates it.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "ai_hypotheses" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_hypotheses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"repository_id" bigint NOT NULL,
	"suite_name" text DEFAULT '' NOT NULL,
	"class_name" text DEFAULT '' NOT NULL,
	"test_name" text NOT NULL,
	"content" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_digest" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "failure_embeddings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "failure_embeddings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"repository_id" bigint NOT NULL,
	"content_hash" text NOT NULL,
	"snippet" text NOT NULL,
	"embedding" vector(384) NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "test_results" ADD COLUMN "failure_hash" text;--> statement-breakpoint
ALTER TABLE "ai_hypotheses" ADD CONSTRAINT "ai_hypotheses_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_hypotheses" ADD CONSTRAINT "ai_hypotheses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "failure_embeddings" ADD CONSTRAINT "failure_embeddings_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_hypotheses_identity_idx" ON "ai_hypotheses" USING btree ("repository_id","suite_name","class_name","test_name");--> statement-breakpoint
CREATE INDEX "ai_hypotheses_repo_idx" ON "ai_hypotheses" USING btree ("repository_id");--> statement-breakpoint
CREATE UNIQUE INDEX "failure_embeddings_repo_hash_idx" ON "failure_embeddings" USING btree ("repository_id","content_hash");--> statement-breakpoint
CREATE INDEX "test_results_failure_hash_idx" ON "test_results" USING btree ("failure_hash") WHERE "test_results"."failure_hash" IS NOT NULL;