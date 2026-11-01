# AMC Invoice Factory V1

Use this format when extracting shipment labels in another ChatGPT conversation. The Invoice Factory accepts either this customer-grouped JSON or a flat `packages` / `records` array with customer fields on each row.

```json
{
  "version": "AMC_INVOICE_FACTORY_V1",
  "batchId": "shipment-2026-11-01-a",
  "invoiceDate": "2026-11-01",
  "customers": [
    {
      "name": "Customer Name",
      "whatsapp": "+592 600 0000",
      "mailboxCode": "AMC123",
      "customerType": "regular",
      "adjustment": 0,
      "notes": "",
      "packages": [
        {
          "tracking": "FULL-TRACKING-NUMBER",
          "carrier": "GOFO",
          "sourceWeight": "11.28 oz",
          "weightLb": 0.705,
          "ref": "GFUS",
          "status": "ready"
        }
      ]
    },
    {
      "name": "Member Name",
      "whatsapp": "",
      "mailboxCode": "AMC203",
      "customerType": "member",
      "adjustment": 0,
      "notes": "",
      "packages": []
    }
  ]
}
```

## Locked rules

- `customerType` must be `regular` or `member`.
- Preserve full tracking numbers exactly.
- Preserve `sourceWeight` exactly as shown on the label when available.
- Convert the shipment weight to pounds in `weightLb` and preserve up to 4 decimal places.
- Multiple photos of the same tracking label are one package, not multiple packages.
- Do not mark invoices paid in import data. Invoice Factory creates new invoices as outstanding/sent; payments are recorded separately in HENRY OS.
- `adjustment` is for a manually reviewed special/oversized charge. Add an explanation in `notes` whenever it is non-zero.
- Use a new `batchId` for genuinely different shipment batches. Reusing the same Batch ID is intentionally idempotent and will not create duplicates.
