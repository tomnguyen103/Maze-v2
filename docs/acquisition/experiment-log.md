# Experiment log

Record one row per creative and channel window. Copy the empty row for each new
window. Read visits and purchases from the admin funnel export for the same UTC
days. Record cash cost in USD and owner minutes as whole numbers.

| Creative | Audience | Date | Campaign Code | Visits | Purchases | Refunds | Cash cost | Owner minutes |
| :-- | :-- | :-- | :-- | --: | --: | --: | --: | --: |
|  |  |  |  |  |  |  |  |  |

## Field guide

- **Creative:** the kit item, for example Clip 1 or Post 2.
- **Audience:** the group, list or channel audience in plain words. Record no
  person's name or contact.
- **Date:** the first and last UTC day of the window.
- **Campaign Code:** one code from `shared/campaign-codes.js`.
- **Visits:** Qualified Adult Visits under that code in the window.
- **Purchases:** Net Purchases in the window. The export does not attribute a
  purchase to a code, so a purchase is a window total. Net Purchases already
  exclude fully refunded and disputed purchases, so never subtract Refunds from
  Purchases.
- **Refunds:** full and partial refunds recorded in the window.
- **Cash cost:** money spent on this creative, for example a stock asset.
- **Owner minutes:** owner time to make, approve, send and answer this item.

## Notes

Record objections, support questions, payment failures and the uncertainty of a
small sample below the table.
