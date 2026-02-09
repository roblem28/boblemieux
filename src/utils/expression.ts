const OPERATORS = {
    '+': { precedence: 2, associativity: 'left', arity: 2, fn: (a: number, b: number) => a + b },
    '-': { precedence: 2, associativity: 'left', arity: 2, fn: (a: number, b: number) => a - b },
    '*': { precedence: 3, associativity: 'left', arity: 2, fn: (a: number, b: number) => a * b },
    '/': { precedence: 3, associativity: 'left', arity: 2, fn: (a: number, b: number) => a / b },
    '^': { precedence: 4, associativity: 'right', arity: 2, fn: (a: number, b: number) => Math.pow(a, b) },
    neg: { precedence: 5, associativity: 'right', arity: 1, fn: (a: number) => -a }
} as const;

type OperatorKey = keyof typeof OPERATORS;

type Token =
    | { type: 'number'; value: number }
    | { type: 'identifier'; value: string }
    | { type: 'operator'; value: OperatorKey }
    | { type: 'lparen' }
    | { type: 'rparen' }
    | { type: 'comma' }
    | { type: 'function'; value: string };

const FUNCTIONS: Record<string, (value: number) => number> = {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    sinh: Math.sinh,
    cosh: Math.cosh,
    tanh: Math.tanh,
    sqrt: Math.sqrt,
    abs: Math.abs,
    exp: Math.exp,
    ln: Math.log,
    log: Math.log,
    ceil: Math.ceil,
    floor: Math.floor
};

const CONSTANTS: Record<string, number> = {
    pi: Math.PI,
    e: Math.E
};

class ExpressionError extends Error {}

function tokenize(expression: string): Token[] {
    const tokens: Token[] = [];
    let index = 0;
    const trimmed = expression.trim();

    while (index < trimmed.length) {
        const char = trimmed[index];

        if (char === ' ') {
            index += 1;
            continue;
        }

        if (/[0-9.]/.test(char)) {
            let value = char;
            index += 1;
            while (index < trimmed.length && /[0-9.]/.test(trimmed[index])) {
                value += trimmed[index];
                index += 1;
            }
            const parsed = Number(value);
            if (Number.isNaN(parsed)) {
                throw new ExpressionError(`Unable to parse number "${value}".`);
            }
            tokens.push({ type: 'number', value: parsed });
            continue;
        }

        if (/[a-zA-Z_]/.test(char)) {
            let value = char;
            index += 1;
            while (index < trimmed.length && /[a-zA-Z0-9_]/.test(trimmed[index])) {
                value += trimmed[index];
                index += 1;
            }
            tokens.push({ type: 'identifier', value });
            continue;
        }

        if (char === '+') {
            tokens.push({ type: 'operator', value: '+' });
            index += 1;
            continue;
        }
        if (char === '-') {
            tokens.push({ type: 'operator', value: '-' });
            index += 1;
            continue;
        }
        if (char === '*') {
            tokens.push({ type: 'operator', value: '*' });
            index += 1;
            continue;
        }
        if (char === '/') {
            tokens.push({ type: 'operator', value: '/' });
            index += 1;
            continue;
        }
        if (char === '^') {
            tokens.push({ type: 'operator', value: '^' });
            index += 1;
            continue;
        }
        if (char === '(') {
            tokens.push({ type: 'lparen' });
            index += 1;
            continue;
        }
        if (char === ')') {
            tokens.push({ type: 'rparen' });
            index += 1;
            continue;
        }
        if (char === ',') {
            tokens.push({ type: 'comma' });
            index += 1;
            continue;
        }

        throw new ExpressionError(`Unexpected character "${char}" in expression.`);
    }

    return tokens;
}

function toRpn(tokens: Token[]): Token[] {
    const output: Token[] = [];
    const stack: Token[] = [];
    let previousToken: Token | undefined;

    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        switch (token.type) {
            case 'number':
                output.push(token);
                previousToken = token;
                break;
            case 'identifier': {
                const nextToken = tokens[index + 1];
                if (nextToken && nextToken.type === 'lparen') {
                    stack.push({ type: 'function', value: token.value });
                } else {
                    output.push(token);
                }
                previousToken = token;
                break;
            }
            case 'operator': {
                const isUnary =
                    token.value === '-' &&
                    (!previousToken ||
                        previousToken.type === 'operator' ||
                        previousToken.type === 'lparen' ||
                        previousToken.type === 'comma' ||
                        previousToken.type === 'function');
                const operatorToken: Token = {
                    type: 'operator',
                    value: (isUnary ? 'neg' : token.value) as OperatorKey
                };
                const operatorInfo = OPERATORS[operatorToken.value];
                if (!operatorInfo) {
                    throw new ExpressionError(`Unsupported operator "${String(token.value)}".`);
                }

                while (stack.length > 0) {
                    const top = stack[stack.length - 1];
                    if (top.type !== 'operator') {
                        break;
                    }
                    const topInfo = OPERATORS[top.value];
                    if (!topInfo) {
                        break;
                    }
                    const shouldPop =
                        (operatorInfo.associativity === 'left' && operatorInfo.precedence <= topInfo.precedence) ||
                        (operatorInfo.associativity === 'right' && operatorInfo.precedence < topInfo.precedence);
                    if (!shouldPop) {
                        break;
                    }
                    output.push(stack.pop()!);
                }
                stack.push(operatorToken);
                previousToken = token;
                break;
            }
            case 'lparen':
                stack.push(token);
                previousToken = token;
                break;
            case 'comma': {
                let foundParen = false;
                while (stack.length > 0) {
                    const popped = stack.pop()!;
                    if (popped.type === 'lparen') {
                        stack.push(popped);
                        foundParen = true;
                        break;
                    }
                    output.push(popped);
                }
                if (!foundParen) {
                    throw new ExpressionError('Misplaced comma in expression.');
                }
                previousToken = token;
                break;
            }
            case 'rparen': {
                let foundParen = false;
                while (stack.length > 0) {
                    const popped = stack.pop()!;
                    if (popped.type === 'lparen') {
                        foundParen = true;
                        break;
                    }
                    output.push(popped);
                }
                if (!foundParen) {
                    throw new ExpressionError('Unmatched parenthesis in expression.');
                }
                const top = stack[stack.length - 1];
                if (top && top.type === 'function') {
                    output.push(stack.pop()!);
                }
                previousToken = token;
                break;
            }
            case 'function':
                stack.push(token);
                previousToken = token;
                break;
            default:
                throw new ExpressionError('Unknown token encountered.');
        }
    }

    while (stack.length > 0) {
        const token = stack.pop()!;
        if (token.type === 'lparen' || token.type === 'rparen') {
            throw new ExpressionError('Unmatched parenthesis in expression.');
        }
        output.push(token);
    }

    return output;
}

function evaluateRpn(rpnTokens: Token[], x: number): number {
    const stack: number[] = [];

    for (const token of rpnTokens) {
        if (token.type === 'number') {
            stack.push(token.value);
            continue;
        }
        if (token.type === 'identifier') {
            if (token.value === 'x') {
                stack.push(x);
                continue;
            }
            const constant = CONSTANTS[token.value.toLowerCase()];
            if (typeof constant === 'number') {
                stack.push(constant);
                continue;
            }
            throw new ExpressionError(`Unknown identifier "${token.value}".`);
        }
        if (token.type === 'operator') {
            const operator = OPERATORS[token.value];
            if (!operator) {
                throw new ExpressionError(`Unsupported operator "${token.value}".`);
            }
            if (stack.length < operator.arity) {
                throw new ExpressionError('Invalid expression structure.');
            }
            if (operator.arity === 1) {
                const value = stack.pop()!;
                stack.push(operator.fn(value) as number);
            } else {
                const right = stack.pop()!;
                const left = stack.pop()!;
                stack.push(operator.fn(left, right) as number);
            }
            continue;
        }
        if (token.type === 'function') {
            const fn = FUNCTIONS[token.value.toLowerCase()];
            if (!fn) {
                throw new ExpressionError(`Unsupported function "${token.value}".`);
            }
            if (stack.length === 0) {
                throw new ExpressionError(`Function "${token.value}" is missing an argument.`);
            }
            const value = stack.pop()!;
            stack.push(fn(value));
            continue;
        }
        throw new ExpressionError('Unsupported token encountered during evaluation.');
    }

    if (stack.length !== 1) {
        throw new ExpressionError('Invalid expression structure.');
    }

    return stack[0];
}

export function compileExpression(expression: string) {
    const tokens = tokenize(expression);
    const rpnTokens = toRpn(tokens);

    return {
        evaluate(x: number) {
            return evaluateRpn(rpnTokens, x);
        }
    };
}

export function validateExpression(expression: string): string | null {
    try {
        compileExpression(expression).evaluate(0);
        return null;
    } catch (error) {
        if (error instanceof ExpressionError) {
            return error.message;
        }
        return 'Unexpected error while parsing expression.';
    }
}

export type CompiledExpression = ReturnType<typeof compileExpression>;

export { ExpressionError };
