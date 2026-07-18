CREATE TABLE "webhook_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "webhook_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"delivery_id" text NOT NULL,
	"event_type" text NOT NULL,
	"action" text,
	"installation_id" bigint,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_events_delivery_id_unique" UNIQUE("delivery_id")
);
