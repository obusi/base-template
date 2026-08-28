CREATE TABLE "report_attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"report_id" uuid NOT NULL,
	"path" text NOT NULL UNIQUE,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_attachment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "report_attachment_report_id_idx" ON "report_attachment" ("report_id");--> statement-breakpoint
ALTER TABLE "report_attachment" ADD CONSTRAINT "report_attachment_report_id_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "report"("id") ON DELETE CASCADE;