CREATE TABLE "test_flake_scores" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "test_flake_scores_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"repository_id" bigint NOT NULL,
	"suite_name" text DEFAULT '' NOT NULL,
	"class_name" text DEFAULT '' NOT NULL,
	"test_name" text NOT NULL,
	"score" real NOT NULL,
	"verdict" text NOT NULL,
	"divergence_evidence" integer DEFAULT 0 NOT NULL,
	"transition_evidence" integer DEFAULT 0 NOT NULL,
	"last_failure_at" timestamp with time zone,
	"computed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "default_branch" text;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "flake_check_run_id" bigint;--> statement-breakpoint
ALTER TABLE "test_flake_scores" ADD CONSTRAINT "test_flake_scores_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "test_flake_scores_identity_idx" ON "test_flake_scores" USING btree ("repository_id","suite_name","class_name","test_name");--> statement-breakpoint
CREATE INDEX "test_flake_scores_repo_verdict_idx" ON "test_flake_scores" USING btree ("repository_id","verdict");