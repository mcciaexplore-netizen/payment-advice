# Vendor matching audit — 15 September 2026

Status: **approved corrections executed in production on 16 September 2026.**

Execution outcome:

- All 18 Tier 1 rows, all 7 Tier 2 rows, and all 4 Tier 4 rows are linked to
  their confirmed canonical vendors (**29/29 complete**).
- The invoice confirmed `Hotel Ayodhya` was correct; the master record typo
  `HOTEL AYODHAYA` was renamed rather than rewriting the submission.
- The pre-existing July `KHAANE PE` vendor was confirmed canonical. The
  unused September `Khane Pe` duplicate was deactivated, and rows 0004/0097
  were linked to the July record.
- Human confirmation resolved Tier 3 row 0132 to `VENTIVE HOSPITALITY PRIVATE
  LIMITED-CR-JW`; the other four Tier 3 rows remain for Finance review.
- All 17 Tier 5 names passed a fresh full-list duplicate/variant check, were
  created as active canonical vendors, and were linked to their originating
  submissions.
- Every vendor creation, master-name correction, deactivation, and submission
  linkage was written to `audit_log`. Serial numbers, amounts, statuses, and
  payment/workflow fields were not changed.

This audit implements the approved policy exception allowing historical
`payee_name` and, where applicable, `payee_address` snapshots to be corrected
to canonical vendor data. The exception does not permit changes to reference
numbers, amounts, payment/workflow data, or any other historical field. Each
approved correction must be made transactionally and logged in `audit_log`
with the old value, new value, actor, and timestamp.

## Audit-time production counts

| Measure | Count |
| --- | ---: |
| All submissions | 172 |
| Regular NEFT Payment Advice submissions | 154 |
| Regular NEFT submissions with `vendor_id IS NULL` | 51 |
| Canonical vendors | 666 |

The 51 unlinked rows break down as: Tier 1 = 18, Tier 2 = 7, Tier 3 = 5,
Tier 4 = 4 rows (two duplicate pairs), and Tier 5 = 17.

All 13 existing canonical vendors proposed below were checked directly. Their
canonical `address` is null, so the Tier 1/2 proposal changes only
`vendor_id` and `payee_name`; it preserves each submission's current
`payee_address`.

## Tier 1 — exact-name matches (executed)

| Reference | Current stored text | Proposed stored text | Canonical vendor / ID |
| --- | --- | --- | --- |
| MCCIA/2026-27/0004 | `Khane Pe` | `KHAANE PE` | KHAANE PE (`a7bb1a1b-4fe6-4784-97e9-aef8497eb2ba`) |
| MCCIA/2026-27/0006 | `Suyog Mangesh Bagul` | `SUYOG MANGESH BAGUL` | SUYOG MANGESH BAGUL (`0a76414b-f802-4825-86a7-9a2d1c4b5799`) |
| MCCIA/2026-27/0018 | `ATRONIX INDIA` | `ATRONIX INDIA` | ATRONIX INDIA (`de5bc5a6-835b-4036-8279-188aca07d2a1`) |
| MCCIA/2026-27/0019 | `Supriya Bhandari and Associates` | `Supriya Bhandari and Associates` | Supriya Bhandari and Associates (`ae3703a1-8192-41bb-b2ac-2c7601743ff4`) |
| MCCIA/2026-27/0020 | `Supriya Bhandari and Associates` | `Supriya Bhandari and Associates` | Supriya Bhandari and Associates (`ae3703a1-8192-41bb-b2ac-2c7601743ff4`) |
| MCCIA/2026-27/0033 | `Sagar M. Gayke` | `Sagar M. Gayke` | Sagar M. Gayke (`c80cc1f3-6c1f-4b02-94ad-5bbef212221c`) |
| MCCIA/2026-27/0038 | `Sagar M. Gayke` | `Sagar M. Gayke` | Sagar M. Gayke (`c80cc1f3-6c1f-4b02-94ad-5bbef212221c`) |
| MCCIA/2026-27/0048 | `CA Rahul Subhashrao Kulkarni` | `CA Rahul Subhashrao Kulkarni` | CA Rahul Subhashrao Kulkarni (`9f956cf6-e986-4839-9fff-5dc7cfd9e9cd`) |
| MCCIA/2026-27/0049 | `CA Rahul Subhashrao Kulkarni` | `CA Rahul Subhashrao Kulkarni` | CA Rahul Subhashrao Kulkarni (`9f956cf6-e986-4839-9fff-5dc7cfd9e9cd`) |
| MCCIA/2026-27/0073 | `Curious Catalyst` | `Curious Catalyst` | Curious Catalyst (`b1ade2cb-5b15-488e-9573-aece592dd935`) |
| MCCIA/2026-27/0086 | `Ganesh Mate` | `Ganesh Mate` | Ganesh Mate (`f55f0063-d51a-4b3a-9d81-ca592cb09468`) |
| MCCIA/2026-27/0087 | `Supriya Bhandari and Associates` | `Supriya Bhandari and Associates` | Supriya Bhandari and Associates (`ae3703a1-8192-41bb-b2ac-2c7601743ff4`) |
| MCCIA/2026-27/0090 | `Supriya Bhandari and Associates` | `Supriya Bhandari and Associates` | Supriya Bhandari and Associates (`ae3703a1-8192-41bb-b2ac-2c7601743ff4`) |
| MCCIA/2026-27/0097 | `Khane Pe` | `KHAANE PE` | KHAANE PE (`a7bb1a1b-4fe6-4784-97e9-aef8497eb2ba`) |
| MCCIA/2026-27/0119 | `Tlpglobus Solutions Pvt Ltd.` | `Tlpglobus Solutions Pvt Ltd.` | Tlpglobus Solutions Pvt Ltd. (`488c05a2-ae7f-4ee9-9c96-8c286ab9ddb9`) |
| MCCIA/2026-27/0120 | `Tlpglobus Solutions Pvt Ltd.` | `Tlpglobus Solutions Pvt Ltd.` | Tlpglobus Solutions Pvt Ltd. (`488c05a2-ae7f-4ee9-9c96-8c286ab9ddb9`) |
| MCCIA/2026-27/0128 | `Ganesh Mate` | `Ganesh Mate` | Ganesh Mate (`f55f0063-d51a-4b3a-9d81-ca592cb09468`) |
| MCCIA/2026-27/0129 | `Ganesh Mate` | `Ganesh Mate` | Ganesh Mate (`f55f0063-d51a-4b3a-9d81-ca592cb09468`) |

Rows whose spelling is already identical still need the proposed
`vendor_id` link; their name text remains byte-for-byte unchanged.

## Tier 2 — confirmed variants (executed)

| Reference | Current stored text | Proposed stored text | Canonical vendor / ID |
| --- | --- | --- | --- |
| MCCIA/2026-27/0003 | `PI Framework Pvt. Ltd.` | `PI FRAMEWORK PVT LTD-CR` | PI FRAMEWORK PVT LTD-CR (`4942cab9-4fa9-4125-ae0a-706656c2a541`) |
| MCCIA/2026-27/0017 | `D.S. Printers` | `D S PRINTERS` | D S PRINTERS (`93692f2a-f609-4ad4-8dc1-3ef0516d5d8d`) |
| MCCIA/2026-27/0057 | `Omkar Enterprises` | `OMKAR ENTERPRISES -CR` | OMKAR ENTERPRISES -CR (`98bbfdfd-2c98-4858-9b03-be4a61d39402`) |
| MCCIA/2026-27/0058 | `Omkar Enterprises` | `OMKAR ENTERPRISES -CR` | OMKAR ENTERPRISES -CR (`98bbfdfd-2c98-4858-9b03-be4a61d39402`) |
| MCCIA/2026-27/0061 | `Omkar Enterprises` | `OMKAR ENTERPRISES -CR` | OMKAR ENTERPRISES -CR (`98bbfdfd-2c98-4858-9b03-be4a61d39402`) |
| MCCIA/2026-27/0064 | `Omkar Enterprises` | `OMKAR ENTERPRISES -CR` | OMKAR ENTERPRISES -CR (`98bbfdfd-2c98-4858-9b03-be4a61d39402`) |
| MCCIA/2026-27/0137 | `Hotel Ayodhya` | `Hotel Ayodhya` | Hotel Ayodhya (`8d372e1a-222a-42c2-97fe-b34ac282e7c2`) — master spelling corrected |

## Tier 4 — duplicate pairs resolved with new vendors

### Created vendor: `VANDANA MILIND DANDEKAR`

Vendor ID: `36e0ee49-8bbc-411e-99df-5129505b922b`.

Proposed canonical address (shared exactly by both rows; preserve the stored
line break):

```text
A Wing, Flat No.2, Shree Krishna Arcade, Plot No.47, Purnanagar, Chikhali
Chinchwad, Pune, Maharashtra – 411019
```

| Reference | Current stored text | Proposed stored text | Address treatment |
| --- | --- | --- | --- |
| MCCIA/2026-27/0060 | `VANDANA DANDEKAR` | `VANDANA MILIND DANDEKAR` | Preserve the current shared address |
| MCCIA/2026-27/0062 | `Vandana Milind Dandekar` | `VANDANA MILIND DANDEKAR` | Preserve the current shared address |

### Created vendor: `VIKAS K & CO.`

Vendor ID: `92197c60-6236-4057-976a-384a5375518b`.

Proposed canonical address (shared exactly by both rows; preserve the stored
line break):

```text
D-356, 4th Floor, Gali No. 13
Lalita Park, Laxmi Nagar, Delhi-110092
```

| Reference | Current stored text | Proposed stored text | Address treatment |
| --- | --- | --- | --- |
| MCCIA/2026-27/0083 | `VIKAS K& CO.` | `VIKAS K & CO.` | Preserve the current shared address |
| MCCIA/2026-27/0084 | `VIKAS K & CO.` | `VIKAS K & CO.` | Preserve the current shared address |

Each pair now links to the one canonical vendor shown above, with both names
rewritten to the exact canonical spelling.

## Tier 3 — weak/questionable; human review outcomes

| Reference | Stored payee | Reason for manual review |
| --- | --- | --- |
| MCCIA/2026-27/0001 | `EXIM KING INTERNATIONALS` | Keyword similarity to Exim Management Services-CR is insufficient |
| MCCIA/2026-27/0039 | `ANIRUDDHA BRAHMA` | Person-name payee; no confident canonical vendor identity |
| MCCIA/2026-27/0093 | `Datta Poul` | Possible match to Datta Arun Poul, but identity is not certain |
| MCCIA/2026-27/0123 | `Nikhil Jain` | Possible match to NIKHIL JAIN ADV FOR EXPENSES, but purpose/identity may differ |
| MCCIA/2026-27/0132 | `VENTIVE-JWMT-COLL-AC` | Human confirmed and linked to `VENTIVE HOSPITALITY PRIVATE LIMITED-CR-JW` |

## Tier 5 — genuinely unmatched; created and linked after fresh re-check

| Reference | Stored payee |
| --- | --- |
| MCCIA/2026-27/0005 | `KUBENEXIS SYSTEMS PRIVATE LIMITED` |
| MCCIA/2026-27/0010 | `Kiran Patole` |
| MCCIA/2026-27/0023 | `Digital Expert` |
| MCCIA/2026-27/0036 | `Myko Consulting Professionals` |
| MCCIA/2026-27/0052 | `MAHESH KABADI` |
| MCCIA/2026-27/0053 | `GEETANJALI JOJARE & ASSOCIATES` |
| MCCIA/2026-27/0054 | `Effi Core Solutions` |
| MCCIA/2026-27/0063 | `Manufacturers Association of Kagal-Hatkanagale (MAKH)` |
| MCCIA/2026-27/0066 | `Marvel Events` |
| MCCIA/2026-27/0068 | `Gurukrupa Photos` |
| MCCIA/2026-27/0069 | `Shri Vijay Shyamrao Mali` |
| MCCIA/2026-27/0079 | `Puspalata sopan khirade` |
| MCCIA/2026-27/0085 | `Vyom Business Advisors Private Limited` |
| MCCIA/2026-27/0096 | `Ms. Nisha Balakrishnan` |
| MCCIA/2026-27/0110 | `Business Sikandar` |
| MCCIA/2026-27/0121 | `Infinite Exim Solutions` |
| MCCIA/2026-27/0125 | `RCM World Business` |

## Generated documents and exports

PDFs and Excel exports are generated from current database values, so future
downloads will display an approved correction. Files already downloaded,
printed, emailed, or saved outside the application cannot be retroactively
changed; they will continue to show the original snapshot text.
