export interface Tool {
    name: string;
    description: string;
    parameters: object;
    execute(args: any): Promise<string>;
}
