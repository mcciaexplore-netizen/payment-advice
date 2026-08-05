ALTER TABLE "payment_advices" ADD COLUMN "cash_voucher_no" text;--> statement-breakpoint
ALTER TABLE "serial_counters" ADD COLUMN "series" text DEFAULT 'PAYMENT_ADVICE' NOT NULL;--> statement-breakpoint
ALTER TABLE "serial_counters" DROP CONSTRAINT "serial_counters_pkey";--> statement-breakpoint
ALTER TABLE "serial_counters" ADD CONSTRAINT "serial_counters_financial_year_series_pk" PRIMARY KEY("financial_year","series");--> statement-breakpoint
-- Backfill: existing CASH-mode submissions predate the CASH_VOUCHER series
-- and never had a cash_voucher_no. Assign them retroactively, in submission
-- order, so no pre-existing Cash submission is left without a printable
-- voucher number.
DO $$
DECLARE
  rec RECORD;
  seq INTEGER;
BEGIN
  FOR rec IN
    SELECT id, financial_year
    FROM payment_advices
    WHERE payment_mode = 'CASH' AND cash_voucher_no IS NULL
    ORDER BY submitted_at ASC
  LOOP
    INSERT INTO serial_counters (financial_year, series, last_number)
    VALUES (rec.financial_year, 'CASH_VOUCHER', 0)
    ON CONFLICT (financial_year, series) DO NOTHING;

    UPDATE serial_counters
    SET last_number = last_number + 1
    WHERE financial_year = rec.financial_year AND series = 'CASH_VOUCHER'
    RETURNING last_number INTO seq;

    UPDATE payment_advices
    SET cash_voucher_no = 'CASH/MCCIA/' || rec.financial_year || '/' || LPAD(seq::text, 4, '0')
    WHERE id = rec.id;
  END LOOP;
END $$;
