import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

// Three rows confirmed by the human (2026-09-15) to hold garbage bank-detail
// values, not real distinct accounts — excluded from the backfill entirely:
//   MCCIA/2026-27/0118 (KHAANE PE): "Account No. : 919010001820467" — the
//     field's own label typed into the account number, same real account.
//   MCCIA/2026-27/0126 (KHAANE PE): "909010001820467" — a single-digit
//     transposition of the real "919010001820467".
//   MCCIA/2026-27/0143 (Vehemence): "Vehemence" — the vendor's own name
//     typed into the account-number field.
const EXCLUDED_ROW_IDS = [
  "82ce1af3-184d-45b1-89a4-503bcbbcb38f",
  "90e2a329-e096-4a1d-bca9-454e36cce608",
  "2168dedd-6057-4e9f-9a79-5f812479a61e",
];

// MSEDCL genuinely has multiple real regional billing account numbers
// (confirmed by the human) — excluded from this backfill by explicit
// instruction ("keep bank details optional for this vendor"), so it starts
// at zero known accounts and submitters keep typing fresh, same as today.
const EXCLUDED_VENDOR_IDS = ["6f8393eb-d66f-46b2-ad4b-e6e252b1e928"]; // MSEDCL

// KHAANE PE: the human confirmed the one real account/name pair directly
// ("919010001820467 - KHAANE PE are the real bank acc and name") — used
// verbatim instead of whichever beneficiary-name spelling was most recent
// among the real (non-excluded) rows, which would otherwise have been
// "Anup subba" (2026-09-09) rather than the vendor's own canonical name.
const BENEFICIARY_NAME_OVERRIDES: Record<string, string> = {
  "a7bb1a1b-4fe6-4784-97e9-aef8497eb2ba": "KHAANE PE", // vendor_id
};

async function main() {
  const excludedRowsList = sql.join(EXCLUDED_ROW_IDS.map((id) => sql`${id}`), sql`, `);
  const excludedVendorsList = sql.join(EXCLUDED_VENDOR_IDS.map((id) => sql`${id}`), sql`, `);

  const combos = await db.execute(sql`
    select
      vendor_id,
      bank_account_no,
      bank_ifsc,
      (array_agg(beneficiary_name order by submitted_at desc))[1] as beneficiary_name,
      (array_agg(id order by submitted_at asc))[1] as source_advice_id,
      max(submitted_at) as last_used_at,
      count(*) as source_row_count
    from payment_advices
    where payment_mode = 'NEFT' and is_advance = false
      and vendor_id is not null
      and vendor_id not in (${excludedVendorsList})
      and id not in (${excludedRowsList})
      and bank_account_no is not null and trim(bank_account_no) != ''
      and bank_ifsc is not null and trim(bank_ifsc) != ''
      and beneficiary_name is not null and trim(beneficiary_name) != ''
    group by vendor_id, bank_account_no, bank_ifsc
  `);

  console.log(`Distinct combinations to insert: ${combos.rows.length}`);

  let inserted = 0;
  for (const row of combos.rows as Array<{
    vendor_id: string;
    bank_account_no: string;
    bank_ifsc: string;
    beneficiary_name: string;
    source_advice_id: string;
    last_used_at: string;
    source_row_count: string;
  }>) {
    const beneficiaryName = BENEFICIARY_NAME_OVERRIDES[row.vendor_id] ?? row.beneficiary_name;
    await db.execute(sql`
      insert into vendor_bank_accounts
        (vendor_id, bank_account_no, bank_ifsc, beneficiary_name, source_advice_id, last_used_at)
      values
        (${row.vendor_id}, ${row.bank_account_no}, ${row.bank_ifsc}, ${beneficiaryName}, ${row.source_advice_id}, ${row.last_used_at})
      on conflict (vendor_id, bank_account_no, bank_ifsc) do nothing
    `);
    inserted++;
  }
  console.log(`Inserted: ${inserted}`);

  const finalCount = await db.execute(sql`select count(*) as n from vendor_bank_accounts`);
  console.log("Final vendor_bank_accounts row count:", finalCount.rows[0]);

  const vendorsWithMultiple = await db.execute(sql`
    select vendor_id, count(*) as n from vendor_bank_accounts group by vendor_id having count(*) > 1
  `);
  console.log("Vendors with more than one account after backfill:", vendorsWithMultiple.rows.length, JSON.stringify(vendorsWithMultiple.rows));

  await db.$client.end?.();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
