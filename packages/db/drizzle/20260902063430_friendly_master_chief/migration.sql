CREATE TABLE "migration_probe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"label" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "migration_probe" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "note" text;