// Manual mock for chalk to avoid ESM issues in Jest
module.exports = {
    dim: (str: string) => str,
    green: (str: string) => str,
    yellow: (str: string) => str,
    red: (str: string) => str,
    gray: (str: string) => str,
    bold: (str: string) => str,
    cyan: (str: string) => str,
    default: {
        dim: (str: string) => str,
        green: (str: string) => str,
        yellow: (str: string) => str,
        red: (str: string) => str,
        gray: (str: string) => str,
        bold: (str: string) => str,
        cyan: (str: string) => str
    }
};
