# PDF Templates

Place your PDF template files here.

## Offer & Acceptance

The system expects a fillable PDF template at:
```
public/templates/oa.pdf
```

### Requirements:
- The PDF must contain form fields matching the field names in `oaPdfGenerator.ts`
- Field names should match the `FIELD_MAP` keys (e.g., `BuyerName`, `PropertyAddress`, etc.)
- The template is loaded via `fetch("/templates/oa.pdf")`

### Fallback:
If the template is not found or fails to load, the system automatically generates
a text-based PDF using jsPDF — so the feature never breaks.

### How to create a fillable PDF:
1. Open the REIWA O&A PDF in Adobe Acrobat or similar PDF editor
2. Add text form fields with the names from `FIELD_MAP` in `oaPdfGenerator.ts`
3. Save as a fillable PDF
4. Place in this directory as `oa.pdf`
