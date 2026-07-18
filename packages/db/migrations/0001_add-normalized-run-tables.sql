CREATE TABLE "repositories" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "repositories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"github_repo_id" bigint NOT NULL,
	"installation_id" bigint NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"private" boolean NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repositories_github_repo_id_unique" UNIQUE("github_repo_id")
);
--> statement-breakpoint
CREATE TABLE "run_artifacts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "run_artifacts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workflow_run_id" bigint NOT NULL,
	"github_artifact_id" bigint NOT NULL,
	"name" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"xml_files_found" integer DEFAULT 0 NOT NULL,
	"skipped_reason" text,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_artifacts_github_artifact_id_unique" UNIQUE("github_artifact_id")
);
--> statement-breakpoint
CREATE TABLE "test_results" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "test_results_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workflow_run_id" bigint NOT NULL,
	"suite_name" text DEFAULT '' NOT NULL,
	"class_name" text DEFAULT '' NOT NULL,
	"test_name" text NOT NULL,
	"status" text NOT NULL,
	"duration_ms" integer,
	"failure_message" text,
	"failure_details" text,
	"file" text
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "workflow_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"repository_id" bigint NOT NULL,
	"github_run_id" bigint NOT NULL,
	"run_attempt" integer NOT NULL,
	"raw_event_id" bigint NOT NULL,
	"name" text,
	"head_branch" text,
	"head_sha" text NOT NULL,
	"event" text,
	"status" text,
	"conclusion" text,
	"run_started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"processing_status" text DEFAULT 'queued' NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "run_artifacts" ADD CONSTRAINT "run_artifacts_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_raw_event_id_webhook_events_id_fk" FOREIGN KEY ("raw_event_id") REFERENCES "public"."webhook_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "test_results_workflow_run_idx" ON "test_results" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE INDEX "test_results_test_identity_idx" ON "test_results" USING btree ("suite_name","class_name","test_name");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_runs_github_run_attempt_idx" ON "workflow_runs" USING btree ("github_run_id","run_attempt");--> statement-breakpoint
CREATE INDEX "workflow_runs_repository_idx" ON "workflow_runs" USING btree ("repository_id");