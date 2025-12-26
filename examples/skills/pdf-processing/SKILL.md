---
name: pdf-processing
description: Extract text, fill forms, merge PDFs, and manipulate PDF documents. Use when working with PDF files, forms, or document extraction. Requires pdf-parse package.
---

# PDF Processing

This skill provides PDF manipulation capabilities for text extraction, form filling, and document operations.

## Prerequisites

Install required packages:
```bash
npm install pdf-parse
# or
pnpm add pdf-parse
# or
yarn add pdf-parse
```

## Capabilities

### 1. Text Extraction
Extract plain text from PDF files with page-by-page information.

### 2. Form Field Detection
Identify and extract form fields from PDF documents.

### 3. Metadata Reading
Access PDF metadata like author, creation date, title.

### 4. Page Count & Info
Get total pages and document dimensions.

## Common Operations

### Extract All Text
```typescript
import fs from 'fs';
import pdf from 'pdf-parse';

const dataBuffer = fs.readFileSync('document.pdf');
const data = await pdf(dataBuffer);

console.log(data.text);        // Full text content
console.log(data.numpages);    // Number of pages
console.log(data.info);        // PDF metadata
```

### Extract Text by Page
```typescript
const data = await pdf(dataBuffer);
// Text includes page breaks
// Split by page markers if needed
```

### Get PDF Info
```typescript
const data = await pdf(dataBuffer);
console.log({
    pages: data.numpages,
    info: data.info,
    metadata: data.metadata
});
```

## Troubleshooting

### "pdf-parse not found"
Install the package: `npm install pdf-parse`

### Scanned PDFs return no text
Scanned PDFs are images. Use OCR (tesseract.js) instead.

### Encrypted PDFs
Password-protected PDFs cannot be read. Remove password first.

### Memory Issues with Large Files
For very large PDFs (>100MB), process in chunks or use streaming.

## Advanced Topics

For advanced PDF operations like filling forms, merging, or creating PDFs, see [ADVANCED.md](ADVANCED.md).

## Examples

### Quick Text Extraction
```bash
# User asks: "Extract text from this PDF"
# 1. Read the PDF file
# 2. Use pdf-parse to extract text
# 3. Return the text content
```

### Get Page Count
```bash
# User asks: "How many pages in this PDF?"
# 1. Parse the PDF
# 2. Return numpages value
```

### Form Analysis
```bash
# User asks: "What fields are in this PDF form?"
# 1. Parse the PDF
# 2. Look for form field patterns
# 3. List detected fields
```
