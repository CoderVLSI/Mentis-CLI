import { Tool } from './Tool';
import fs from 'fs-extra';
import path from 'path';
const pdf = require('pdf-parse');
import * as xlsx from 'xlsx';

export class PdfReaderTool implements Tool {
    name = 'read_pdf';
    description = 'Read text content from a PDF file.';
    parameters = {
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: 'The absolute path to the PDF file.'
            }
        },
        required: ['filePath']
    };

    async execute(args: { filePath: string }): Promise<string> {
        try {
            if (!await fs.pathExists(args.filePath)) {
                return `Error: File not found at ${args.filePath}`;
            }
            const dataBuffer = await fs.readFile(args.filePath);
            const data = await pdf(dataBuffer);
            return data.text;
        } catch (error: any) {
            return `Error reading PDF: ${error.message}`;
        }
    }
}

export class ExcelReaderTool implements Tool {
    name = 'read_excel';
    description = 'Read data from an Excel file (.xlsx, .xls). Returns data as JSON or CSV.';
    parameters = {
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: 'The absolute path to the Excel file.'
            },
            sheetName: {
                type: 'string',
                description: 'Optional: name of the sheet to read. Defaults to first sheet.'
            },
            format: {
                type: 'string',
                enum: ['json', 'csv'],
                description: 'Output format. Default is json.'
            }
        },
        required: ['filePath']
    };

    async execute(args: { filePath: string, sheetName?: string, format?: 'json' | 'csv' }): Promise<string> {
        try {
            if (!await fs.pathExists(args.filePath)) {
                return `Error: File not found at ${args.filePath}`;
            }
            const workbook = xlsx.readFile(args.filePath);
            const sheetName = args.sheetName || workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];

            if (!sheet) {
                return `Error: Sheet '${sheetName}' not found. Available sheets: ${workbook.SheetNames.join(', ')}`;
            }

            if (args.format === 'csv') {
                return xlsx.utils.sheet_to_csv(sheet);
            } else {
                return JSON.stringify(xlsx.utils.sheet_to_json(sheet), null, 2);
            }
        } catch (error: any) {
            return `Error reading Excel file: ${error.message}`;
        }
    }
}

export class JupyterReaderTool implements Tool {
    name = 'read_jupyter';
    description = 'Read code and markdown cells from a Jupyter Notebook (.ipynb).';
    parameters = {
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: 'The absolute path to the .ipynb file.'
            }
        },
        required: ['filePath']
    };

    async execute(args: { filePath: string }): Promise<string> {
        try {
            if (!await fs.pathExists(args.filePath)) {
                return `Error: File not found at ${args.filePath}`;
            }
            const content = await fs.readFile(args.filePath, 'utf-8');
            const json = JSON.parse(content);

            let output = '';

            if (json.cells && Array.isArray(json.cells)) {
                json.cells.forEach((cell: any, index: number) => {
                    const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
                    output += `\n--- Cell ${index + 1} (${cell.cell_type}) ---\n`;
                    output += source;
                    output += '\n';
                });
            } else {
                return 'Error: Invalid Jupyter Notebook format (no cells found).';
            }

            return output;
        } catch (error: any) {
            return `Error reading Jupyter Notebook: ${error.message}`;
        }
    }
}
